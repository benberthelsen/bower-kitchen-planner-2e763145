
CREATE POLICY "Public read appliance-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'appliance-assets');

CREATE POLICY "Admins can upload appliance-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'appliance-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update appliance-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'appliance-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete appliance-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'appliance-assets' AND public.has_role(auth.uid(), 'admin'));
