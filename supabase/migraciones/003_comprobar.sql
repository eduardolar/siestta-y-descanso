-- Comprobación (solo lectura): pégalo después de 001 y 002 y mira el resultado.
select 'productos' as que, count(*)::text as valor from public.productos
union all select 'ajustes', count(*)::text from public.ajustes
union all select 'editores', count(*)::text from public.editores
union all select 'rls_' || c.relname, c.relrowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('productos', 'ajustes', 'editores')
union all select 'bucket_fotos', coalesce((select public::text from storage.buckets where id = 'fotos'), 'no existe');
