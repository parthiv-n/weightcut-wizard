-- Add missing UPDATE policies for techniques and technique_edges
-- Required because useSkillTree.ts uses .upsert() which needs UPDATE on conflict

CREATE POLICY "Authenticated users can update techniques"
  ON public.techniques FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update technique edges"
  ON public.technique_edges FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
