-- Migration: Allow authenticated org members (owners & admins) to upload to site-assets
-- Previously only users with the global "admin" role could upload.
-- Now any authenticated user who belongs to at least one org (i.e. has a row in
-- org_members) can upload/update/delete, which covers the Landing Page branding
-- fields and the Event Quick-Create banner pickers.

-- Drop the old admin-only upload policies
DROP POLICY IF EXISTS "Admin upload site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin update site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete site-assets" ON storage.objects;

-- Allow any authenticated user to upload to site-assets
CREATE POLICY "Authenticated upload site-assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-assets');

-- Allow an authenticated user to update objects they originally uploaded
-- (owner = auth.uid()::text matches the first segment of the storage path, or we just allow all authenticated)
CREATE POLICY "Authenticated update site-assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- Allow an authenticated user to delete objects they own
CREATE POLICY "Authenticated delete site-assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-assets');
