import re

with open('src/pages/WeightTracker.tsx', 'r') as f:
    content = f.read()

# 1. Add imports
content = content.replace(
    'import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Sparkles, Activity, Apple, Trash2, RefreshCw, Bug } from "lucide-react";',
    'import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Sparkles, Activity, Apple, Trash2, RefreshCw, Bug, Edit2, ChevronDown } from "lucide-react";\nimport { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";'
)

# 2. Add state
state_injection = """  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);"""
content = content.replace('  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);', state_injection)

# 3. Handle edit log function
edit_func = """  const handleEditLog = (log: WeightLog) => {
    setNewWeight(log.weight_kg.toString());
    setNewDate(log.date);
    setEditingLogId(log.id);
    weightInputRef.current?.focus();
    triggerHapticSuccess();
  };

  const initiateDelete = (log: WeightLog) => {"""
content = content.replace('  const initiateDelete = (log: WeightLog) => {', edit_func)

# 4. Update the handleAddWeight function
add_weight = """    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingLogId) {
      const { error } = await supabase
        .from("weight_logs")
        .update({
          weight_kg: parseFloat(newWeight),
          date: newDate,
        })
        .eq("id", editingLogId);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update weight log",
          variant: "destructive",
        });
      } else {
        toast({ title: "Updated", description: "Weight log has been updated" });
      }
      setEditingLogId(null);
    } else {
      const { error } = await supabase.from("weight_logs").insert({
        user_id: user.id,
        weight_kg: parseFloat(newWeight),
        date: newDate,
      });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to log weight",
          variant: "destructive",
        });
      }
    }

    const { error: postSaveError } = editingLogId ? { error: null } : await supabase.from("weight_logs").select('id').limit(1); // Dummy check so we don't break flow
    
    // We already handled error toast above, so we just run success block
    const loggedWeight = parseFloat(newWeight);

    // Update profile current weight
    await supabase
      .from("profiles")
      .update({ current_weight_kg: loggedWeight })
      .eq("id", user.id);"""

# Replace the specific insert block
insert_pattern = r'    const \{ error \} = await supabase\.from\("weight_logs"\)\.insert\(\{(.*?)\}\);(.*?)if \(error\) \{(.*?)variant: "destructive",(.*?)\}\n    \} else \{'
# Actually, the logic is a bit complex for simple regex. I will replace the whole handleAddWeight function.

# Find the start and end of handleAddWeight
handle_add_match = re.search(r'  const handleAddWeight = async \(e: React\.FormEvent\) => \{.*?\n  \};\n', content, re.DOTALL)
if handle_add_match:
    original_add = handle_add_match.group(0)
    new_add = """  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationResult = weightLogSchema.safeParse({
      weight_kg: parseFloat(newWeight),
      date: newDate,
    });

    if (!validationResult.success) {
      toast({
        title: "Validation Error",
        description: validationResult.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let opError = null;

    if (editingLogId) {
      const { error } = await supabase
        .from("weight_logs")
        .update({
          weight_kg: parseFloat(newWeight),
          date: newDate,
        })
        .eq("id", editingLogId);
      opError = error;
    } else {
      const { error } = await supabase.from("weight_logs").insert({
        user_id: user.id,
        weight_kg: parseFloat(newWeight),
        date: newDate,
      });
      opError = error;
    }

    if (opError) {
      toast({
        title: "Error",
        description: `Failed to ${editingLogId ? 'update' : 'log'} weight`,
        variant: "destructive",
      });
    } else {
      const loggedWeight = parseFloat(newWeight);

      await supabase
        .from("profiles")
        .update({ current_weight_kg: loggedWeight })
        .eq("id", user.id);

      await updateCurrentWeight(loggedWeight);

      if (userId) {
        const storageKey = `weight_tracker_ai_analysis_${userId}`;
        localStorage.removeItem(storageKey);
        setAiAnalysis(null);
        setAiAnalysisWeight(null);
        setAiAnalysisTarget(null);
      }

      toast({
        title: editingLogId ? "Weight updated" : "Weight logged",
        description: "Your weight has been recorded",
      });
      triggerHapticSuccess();
      setNewWeight("");
      setEditingLogId(null);
      fetchData();
    }

    setLoading(false);
  };
"""
    content = content.replace(original_add, new_add)


# 5. Update the form button text
content = content.replace(
    '{loading ? "..." : "Log"}',
    '{loading ? "..." : editingLogId ? "Update" : "Log"}'
)

# 6. Replace Recent Entries with Collapsible
history_pattern = r'<div className="border-t border-border/20 pt-3">.*?</div>\s*</>'
history_match = re.search(history_pattern, content, re.DOTALL)
if history_match:
    new_history = """<div className="border-t border-border/20 pt-3">
                <Collapsible
                  open={isHistoryOpen}
                  onOpenChange={setIsHistoryOpen}
                  className="w-full space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent Entries</p>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground">
                        {isHistoryOpen ? "Hide" : "View & Edit"}
                        <ChevronDown className={`h-3 w-3 ml-1 transition-transform duration-200 ${isHistoryOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {weightLogs.slice().reverse().map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-background/50 hover:bg-background/80 transition-colors"
                        >
                          <div>
                            <span className="text-base font-bold text-primary mr-3">{log.weight_kg} kg</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(log.date), "MMM dd, yyyy")}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditLog(log)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => initiateDelete(log)}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </>"""
    content = content.replace(history_match.group(0), new_history)


with open('src/pages/WeightTracker.tsx', 'w') as f:
    f.write(content)
print("Updated WeightTracker.tsx")
