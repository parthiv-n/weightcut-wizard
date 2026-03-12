-- Technique Skill Tree tables

-- Global technique catalog (shared across users)
CREATE TABLE public.techniques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  sport TEXT NOT NULL,
  position TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name_normalized, sport)
);

-- Directed edges between techniques
CREATE TABLE public.technique_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_technique_id UUID NOT NULL REFERENCES public.techniques(id) ON DELETE CASCADE,
  to_technique_id UUID NOT NULL REFERENCES public.techniques(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'chains_into',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_technique_id, to_technique_id, relation_type)
);

-- Per-user proficiency tracking
CREATE TABLE public.user_technique_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  technique_id UUID NOT NULL REFERENCES public.techniques(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'seen' CHECK (level IN ('seen', 'drilled', 'landed', 'mastered')),
  times_logged INTEGER NOT NULL DEFAULT 1,
  first_logged_at TIMESTAMPTZ DEFAULT NOW(),
  last_logged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, technique_id)
);

-- Individual log entries
CREATE TABLE public.training_technique_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  technique_id UUID NOT NULL REFERENCES public.techniques(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.fight_camp_calendar(id) ON DELETE SET NULL,
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_technique_edges_from ON public.technique_edges(from_technique_id);
CREATE INDEX idx_technique_edges_to ON public.technique_edges(to_technique_id);
CREATE INDEX idx_user_technique_progress_user ON public.user_technique_progress(user_id);
CREATE INDEX idx_training_technique_logs_user_date ON public.training_technique_logs(user_id, date DESC);

-- RLS
ALTER TABLE public.techniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technique_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_technique_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_technique_logs ENABLE ROW LEVEL SECURITY;

-- techniques: SELECT + INSERT for all authenticated
CREATE POLICY "Authenticated users can read techniques"
  ON public.techniques FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert techniques"
  ON public.techniques FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- technique_edges: SELECT + INSERT for all authenticated
CREATE POLICY "Authenticated users can read technique edges"
  ON public.technique_edges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert technique edges"
  ON public.technique_edges FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- user_technique_progress: full CRUD scoped to user
CREATE POLICY "Users can read own technique progress"
  ON public.user_technique_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own technique progress"
  ON public.user_technique_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own technique progress"
  ON public.user_technique_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own technique progress"
  ON public.user_technique_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- training_technique_logs: full CRUD scoped to user
CREATE POLICY "Users can read own technique logs"
  ON public.training_technique_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own technique logs"
  ON public.training_technique_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own technique logs"
  ON public.training_technique_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own technique logs"
  ON public.training_technique_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
