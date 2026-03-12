import * as dagre from "@dagrejs/dagre";
import type { Technique, TechniqueEdge, GraphNode, GraphEdge } from "@/types/technique";

const NODE_WIDTH = 140;
const NODE_HEIGHT = 56;

export function normalizeTechniqueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function processChains(
  chains: string[][],
  sport: string,
  existingTechniques: Technique[],
  existingEdges: TechniqueEdge[]
): { newTechniques: { name: string; name_normalized: string; sport: string }[]; newEdges: { fromNormalized: string; toNormalized: string }[] } {
  const existingNormalized = new Set(existingTechniques.map((t) => t.name_normalized));
  const existingEdgeKeys = new Set(
    existingEdges.map((e) => `${e.from_technique_id}::${e.to_technique_id}`)
  );

  const newTechMap = new Map<string, { name: string; name_normalized: string; sport: string }>();
  const newEdgeSet = new Set<string>();
  const newEdges: { fromNormalized: string; toNormalized: string }[] = [];

  // Build a normalized→id lookup for existing techniques
  const normalizedToId = new Map<string, string>();
  for (const t of existingTechniques) {
    normalizedToId.set(t.name_normalized, t.id);
  }

  for (const chain of chains) {
    for (let i = 0; i < chain.length; i++) {
      const name = chain[i].trim();
      if (!name) continue;
      const normalized = normalizeTechniqueName(name);

      if (!existingNormalized.has(normalized) && !newTechMap.has(normalized)) {
        newTechMap.set(normalized, { name, name_normalized: normalized, sport });
      }

      if (i > 0) {
        const prevNormalized = normalizeTechniqueName(chain[i - 1].trim());
        const edgeKey = `${prevNormalized}::${normalized}`;

        // Check if edge already exists (by ID) or is already queued
        const fromId = normalizedToId.get(prevNormalized);
        const toId = normalizedToId.get(normalized);
        const existsByIds = fromId && toId && existingEdgeKeys.has(`${fromId}::${toId}`);

        if (!existsByIds && !newEdgeSet.has(edgeKey)) {
          newEdgeSet.add(edgeKey);
          newEdges.push({ fromNormalized: prevNormalized, toNormalized: normalized });
        }
      }
    }
  }

  return {
    newTechniques: Array.from(newTechMap.values()),
    newEdges,
  };
}

export function layoutGraph(
  nodes: { id: string; label: string }[],
  edges: { source: string; target: string }[]
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { label: node.label, width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    // Only add edges where both nodes exist
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const nodeId of g.nodes()) {
    const n = g.node(nodeId);
    if (n) {
      positions.set(nodeId, { x: n.x, y: n.y });
    }
  }

  const graphLabel = g.graph();
  return {
    positions,
    width: graphLabel.width ?? 400,
    height: graphLabel.height ?? 300,
  };
}

export function buildGraphData(
  techniques: Technique[],
  edges: TechniqueEdge[],
  progressMap: Map<string, { level: string; timesLogged: number }>
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[]; graphBounds: { width: number; height: number } } {
  if (techniques.length === 0) {
    return { graphNodes: [], graphEdges: [], graphBounds: { width: 400, height: 300 } };
  }

  const nodeInputs = techniques.map((t) => ({ id: t.id, label: t.name }));
  const edgeInputs = edges.map((e) => ({ source: e.from_technique_id, target: e.to_technique_id }));

  const { positions, width, height } = layoutGraph(nodeInputs, edgeInputs);

  const graphNodes: GraphNode[] = techniques.map((t) => {
    const pos = positions.get(t.id) ?? { x: 0, y: 0 };
    const progress = progressMap.get(t.id);
    return {
      id: t.id,
      label: t.name,
      x: pos.x,
      y: pos.y,
      level: (progress?.level as GraphNode["level"]) ?? "seen",
      timesLogged: progress?.timesLogged ?? 0,
      sport: t.sport,
      category: t.category ?? undefined,
    };
  });

  const nodeMap = new Map(graphNodes.map((n) => [n.id, n]));
  const graphEdges: GraphEdge[] = edges
    .filter((e) => nodeMap.has(e.from_technique_id) && nodeMap.has(e.to_technique_id))
    .map((e) => {
      const source = nodeMap.get(e.from_technique_id)!;
      const target = nodeMap.get(e.to_technique_id)!;
      return {
        source: e.from_technique_id,
        target: e.to_technique_id,
        sourceX: source.x,
        sourceY: source.y + NODE_HEIGHT / 2,
        targetX: target.x,
        targetY: target.y - NODE_HEIGHT / 2,
      };
    });

  return { graphNodes, graphEdges, graphBounds: { width, height } };
}

export { NODE_WIDTH, NODE_HEIGHT };
