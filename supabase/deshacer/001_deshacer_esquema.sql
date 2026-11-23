-- =====================================================================================
-- Deshace 001_esquema.sql. BORRA productos, ajustes y la lista de editores.
-- Antes: Database → Backups o exporta los datos (ver LEEME.md, «Copias»).
-- El bucket «fotos» no se puede vaciar por SQL (Supabase lo impide): vacíalo en Storage y
-- después ejecuta la última línea, o bórralo desde el panel.
-- =====================================================================================

drop policy if exists "fotos: los editores listan"     on storage.objects;
drop policy if exists "fotos: los editores suben"      on storage.objects;
drop policy if exists "fotos: los editores reemplazan" on storage.objects;
drop policy if exists "fotos: los editores borran"     on storage.objects;

drop table if exists public.productos;
drop table if exists public.ajustes;
drop table if exists public.editores;

drop schema if exists privado cascade;

-- Vuelve a los permisos por defecto de Supabase para lo nuevo de public
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;

-- Solo con el bucket ya vacío:
-- delete from storage.buckets where id = 'fotos';
