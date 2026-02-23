-- Create training_summaries table for persisting AI-generated weekly training summaries
CREATE TABLE public.training_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  summary_data JSONB NOT NULL,
  session_ids UUID[] NOT NULL DEFAULT '{}',
  notes_fingerprint TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Enable RLS
ALTER TABLE public.training_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own training summaries"
  ON public.training_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own training summaries"
  ON public.training_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training summaries"
  ON public.training_summaries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training summaries"
  ON public.training_summaries FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookup by user + week
CREATE INDEX idx_training_summaries_user_week
  ON public.training_summaries(user_id, week_start DESC);

-- Auto-update updated_at trigger
CREATE TRIGGER update_training_summaries_updated_at
  BEFORE UPDATE ON public.training_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
