-- Persist user cut/weight plan in profiles so it survives localStorage clears
-- (iOS Capacitor WebView can clear localStorage on app updates / storage pressure)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cut_plan_json JSONB;
