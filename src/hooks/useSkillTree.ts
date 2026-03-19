import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { normalizeTechniqueName, processChains, buildGraphData } from "@/lib/techniqueGraph";
import { createAIAbortController, extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { celebrateSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import type {
  Technique,
  TechniqueEdge,
  UserTechniqueProgress,
  TechniqueChainResponse,
  GraphNode,
  GraphEdge,
  TechniqueLevel,
} from "@/types/technique";

interface SkillTreeState {
  techniques: Technique[];
  edges: TechniqueEdge[];
  progress: UserTechniqueProgress[];
}

export function useSkillTree() {
  const { userId } = useAuth();
  const [state, setState] = useState<SkillTreeState>({ techniques: [], edges: [], progress: [] });
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [graphBounds, setGraphBounds] = useState({ width: 400, height: 300 });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const rebuildGraph = useCallback((techniques: Technique[], edges: TechniqueEdge[], progress: UserTechniqueProgress[]) => {
    const progressMap = new Map(
      progress.map((p) => [p.technique_id, { level: p.level, timesLogged: p.times_logged }])
    );
    const { graphNodes: nodes, graphEdges: edgs, graphBounds: bounds } = buildGraphData(techniques, edges, progressMap);
    setGraphNodes(nodes);
    setGraphEdges(edgs);
    setGraphBounds(bounds);
  }, []);

  // Fetch all data on mount
  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setIsLoading(true);
      try {
        // Try cache first
        const cached = AIPersistence.load(userId, "skill_tree");
        if (cached) {
          setState(cached);
          rebuildGraph(cached.techniques, cached.edges, cached.progress);
          setIsLoading(false);
          // Still fetch fresh data in background
        }

        // Fetch user's technique progress to know which techniques they have
        const { data: progressData, error: progressError } = await supabase
          .from("user_technique_progress")
          .select("id, user_id, technique_id, level, times_logged, first_logged_at, last_logged_at")
          .eq("user_id", userId);

        if (progressError) throw progressError;
        const progress = (progressData ?? []) as UserTechniqueProgress[];

        if (progress.length === 0 && !cached) {
          setState({ techniques: [], edges: [], progress: [] });
          rebuildGraph([], [], []);
          setIsLoading(false);
          return;
        }

        const techniqueIds = progress.map((p) => p.technique_id);

        // Fetch techniques that the user has progress on
        const { data: techData, error: techError } = await supabase
          .from("techniques")
          .select("id, name, name_normalized, sport, position, category, created_at")
          .in("id", techniqueIds.length > 0 ? techniqueIds : ["00000000-0000-0000-0000-000000000000"]);

        if (techError) throw techError;
        const techniques = (techData ?? []) as Technique[];

        // Fetch edges between these techniques
        const { data: edgeData, error: edgeError } = await supabase
          .from("technique_edges")
          .select("id, from_technique_id, to_technique_id, relation_type, created_at")
          .or(
            techniqueIds.length > 0
              ? `from_technique_id.in.(${techniqueIds.join(",")}),to_technique_id.in.(${techniqueIds.join(",")})`
              : "id.eq.00000000-0000-0000-0000-000000000000"
          );

        if (edgeError) throw edgeError;
        const edges = (edgeData ?? []) as TechniqueEdge[];

        // Also fetch any techniques referenced by edges but not in user's progress
        const allTechIds = new Set(techniqueIds);
        for (const e of edges) {
          allTechIds.add(e.from_technique_id);
          allTechIds.add(e.to_technique_id);
        }
        const missingIds = Array.from(allTechIds).filter((id) => !techniqueIds.includes(id));

        let allTechniques = techniques;
        if (missingIds.length > 0) {
          const { data: extraTechs } = await supabase
            .from("techniques")
            .select("id, name, name_normalized, sport, position, category, created_at")
            .in("id", missingIds);
          if (extraTechs) {
            allTechniques = [...techniques, ...(extraTechs as Technique[])];
          }
        }

        const newState = { techniques: allTechniques, edges, progress };
        setState(newState);
        rebuildGraph(allTechniques, edges, progress);
        AIPersistence.save(userId, "skill_tree", newState, 24);
      } catch (err) {
        logger.error("Failed to load skill tree data", { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [userId, rebuildGraph]);

  const generateChains = async (
    name: string,
    sport: string,
    techniqueId: string,
    updatedProgress: UserTechniqueProgress[],
    controller: AbortController,
    cleanup: () => void
  ) => {
    try {
      const existingNames = stateRef.current.techniques.map((t) => t.name);
      const { data: chainResponse, error: chainError } = await supabase.functions.invoke(
        "generate-technique-chains",
        { body: { techniqueName: name, sport, existingTechniques: existingNames }, signal: controller.signal }
      );

      if (controller.signal.aborted) return;
      if (chainError) {
        if (chainError?.name === "AbortError") throw chainError;
        throw new Error(await extractEdgeFunctionError(chainError, "Chain generation failed"));
      }
      const chainData = chainResponse as TechniqueChainResponse;

      if (!chainData?.chains?.length) return;

      // Update technique metadata if provided
      if (chainData.technique_metadata) {
        const { position, category } = chainData.technique_metadata;
        if (position || category) {
          await supabase
            .from("techniques")
            .update({
              ...(position ? { position } : {}),
              ...(category ? { category } : {}),
            })
            .eq("id", techniqueId);
        }
      }

      // Process chains
      const { newTechniques, newEdges } = processChains(
        chainData.chains,
        sport,
        stateRef.current.techniques,
        stateRef.current.edges
      );

      // Batch insert new techniques
      const insertedTechniques: Technique[] = [];
      if (newTechniques.length > 0) {
        const { data: inserted } = await supabase
          .from("techniques")
          .upsert(
            newTechniques.map((t) => ({ name: t.name, name_normalized: t.name_normalized, sport: t.sport })),
            { onConflict: "name_normalized,sport" }
          )
          .select();
        if (inserted) insertedTechniques.push(...(inserted as Technique[]));
      }

      // Build normalized→id lookup with all techniques
      const allTechs = [...stateRef.current.techniques, ...insertedTechniques];
      const normalizedToId = new Map<string, string>();
      for (const t of allTechs) {
        normalizedToId.set(t.name_normalized, t.id);
      }

      // Batch insert new edges
      const edgesToInsert = newEdges
        .map((e) => ({
          from_technique_id: normalizedToId.get(e.fromNormalized),
          to_technique_id: normalizedToId.get(e.toNormalized),
          relation_type: "chains_into",
        }))
        .filter((e) => e.from_technique_id && e.to_technique_id) as {
        from_technique_id: string;
        to_technique_id: string;
        relation_type: string;
      }[];

      const insertedEdges: TechniqueEdge[] = [];
      if (edgesToInsert.length > 0) {
        const { data: edgeResults } = await supabase
          .from("technique_edges")
          .upsert(edgesToInsert, {
            onConflict: "from_technique_id,to_technique_id,relation_type",
          })
          .select();
        if (edgeResults) insertedEdges.push(...(edgeResults as TechniqueEdge[]));
      }

      // Update state and rebuild graph
      const finalState: SkillTreeState = {
        techniques: [...new Map([...stateRef.current.techniques, ...insertedTechniques].map((t) => [t.id, t])).values()],
        edges: [...new Map([...stateRef.current.edges, ...insertedEdges].map((e) => [e.id, e])).values()],
        progress: updatedProgress,
      };
      setState(finalState);
      rebuildGraph(finalState.techniques, finalState.edges, finalState.progress);
      if (userId) AIPersistence.save(userId, "skill_tree", finalState, 24);
      celebrateSuccess();
    } catch (chainErr: any) {
      if (chainErr?.name === "AbortError" || controller.signal.aborted) {
        logger.info("Chain generation cancelled by user");
      } else {
        logger.warn("Chain generation failed (technique was still logged)", { error: chainErr });
      }
    } finally {
      cleanup();
      aiAbortRef.current = null;
      setIsGenerating(false);
    }
  };

  const logTechnique = useCallback(
    async (name: string, sport: string, notes?: string, sessionId?: string) => {
      if (!userId) return;

      const normalized = normalizeTechniqueName(name);

      try {
        // 1. Upsert technique
        const { data: techData, error: techError } = await supabase
          .from("techniques")
          .upsert(
            { name, name_normalized: normalized, sport },
            { onConflict: "name_normalized,sport" }
          )
          .select()
          .single();

        if (techError) throw techError;
        const technique = techData as Technique;

        // 2. Insert training log
        await supabase.from("training_technique_logs").insert({
          user_id: userId,
          technique_id: technique.id,
          session_id: sessionId || null,
          notes: notes || null,
          date: new Date().toISOString().split("T")[0],
        });

        // 3. Upsert progress
        const existing = stateRef.current.progress.find((p) => p.technique_id === technique.id);
        if (existing) {
          await supabase
            .from("user_technique_progress")
            .update({
              times_logged: existing.times_logged + 1,
              last_logged_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("user_technique_progress").insert({
            user_id: userId,
            technique_id: technique.id,
            level: "seen",
            times_logged: 1,
          });
        }

        // Update local state immediately (optimistic)
        const updatedProgress = existing
          ? stateRef.current.progress.map((p) =>
              p.technique_id === technique.id
                ? { ...p, times_logged: p.times_logged + 1, last_logged_at: new Date().toISOString() }
                : p
            )
          : [
              ...stateRef.current.progress,
              {
                id: crypto.randomUUID(),
                user_id: userId,
                technique_id: technique.id,
                level: "seen" as TechniqueLevel,
                times_logged: 1,
                first_logged_at: new Date().toISOString(),
                last_logged_at: new Date().toISOString(),
              },
            ];

        const updatedTechniques = stateRef.current.techniques.some((t) => t.id === technique.id)
          ? stateRef.current.techniques
          : [...stateRef.current.techniques, technique];

        const intermediateState = { ...stateRef.current, techniques: updatedTechniques, progress: updatedProgress };
        setState(intermediateState);
        rebuildGraph(intermediateState.techniques, intermediateState.edges, intermediateState.progress);

        // 4. Generate chains in background — don't block the caller
        const { controller, cleanup } = createAIAbortController();
        aiAbortRef.current = controller;
        setIsGenerating(true);
        generateChains(name, sport, technique.id, updatedProgress, controller, cleanup);
      } catch (err) {
        logger.error("Failed to log technique", { error: err });
        throw err;
      }
    },
    [userId, rebuildGraph]
  );

  const updateProgress = useCallback(
    async (techniqueId: string, level: TechniqueLevel) => {
      if (!userId) return;

      const { error } = await supabase
        .from("user_technique_progress")
        .update({ level })
        .eq("user_id", userId)
        .eq("technique_id", techniqueId);

      if (error) {
        logger.error("Failed to update technique progress", { error });
        return;
      }

      setState((prev) => {
        const updated = {
          ...prev,
          progress: prev.progress.map((p) =>
            p.technique_id === techniqueId ? { ...p, level } : p
          ),
        };
        rebuildGraph(updated.techniques, updated.edges, updated.progress);
        AIPersistence.save(userId, "skill_tree", updated, 24);
        return updated;
      });
    },
    [userId, rebuildGraph]
  );

  return {
    graphNodes,
    graphEdges,
    graphBounds,
    techniques: state.techniques,
    progress: state.progress,
    isLoading,
    isGenerating,
    logTechnique,
    updateProgress,
  };
}
