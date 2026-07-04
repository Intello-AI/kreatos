-- Upload directo browser → Storage para el chat de marca: los usuarios
-- autenticados (solo @intelloai.com pueden registrarse) suben al bucket
-- brand-assets sin pasar los bytes por server actions.
create policy "authenticated puede subir brand assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets');
