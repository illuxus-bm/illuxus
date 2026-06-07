-- Create a public bucket for admin-uploaded site assets (favicon, OG image, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view (public bucket)
CREATE POLICY "Public can read site-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-assets');

-- Only platform admins can upload / replace / delete
CREATE POLICY "Admins can upload site-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update site-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete site-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));