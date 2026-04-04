-- Add media_url column to fight_camp_calendar for session photos/videos
ALTER TABLE fight_camp_calendar ADD COLUMN media_url text;

-- Create storage bucket for training session media
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-media', 'training-media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can upload to their own folder
CREATE POLICY "Users can upload session media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'training-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: users can view their own media
CREATE POLICY "Users can view own session media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'training-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: public read access for media URLs
CREATE POLICY "Public read access for training media"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'training-media');

-- RLS: users can delete their own media
CREATE POLICY "Users can delete own session media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'training-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: users can update their own media
CREATE POLICY "Users can update own session media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'training-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
