begin;  -- todo o nada

-- =====================================================================================
-- 008_temporada.sql — Temporadas (Navidad, Black Friday, Rebajas, Feria) y anuncio destacado
-- (sorteos, eventos…), que la dueña enciende desde el panel (pestaña Portada):
--   · ajustes.datos.temporada = { tipo, texto (0-60), hasta ('' o AAAA-MM-DD) }
--   · ajustes.datos.anuncio   = { activo, tipo (sorteo|evento|anuncio), titulo (1-60 si está activo),
--                                 texto (0-220), foto ('' o img/… o portada/{uuid}.jpg), boton { texto (0-30),
--                                 enlace ('' o https de Instagram/Facebook/TikTok/wa.me) }, hasta, bases }
--   · productos.en_temporada: el producto sale también en la sección de la temporada.
-- Reemplaza privado.ajustes_problema (la de 005 con las dos claves nuevas, opcionales) y añade sus
-- funciones de apoyo. La foto del anuncio va en la carpeta portada/ del bucket, como la de la tienda:
-- no cambian las rutas admitidas ni las políticas de Storage.
-- La fecha «hasta» no se revisa contra hoy: la web deja de enseñarlo sola al día siguiente (hora de Madrid).
-- Hasta ejecutarla, la web funciona igual y el panel avisa si se intenta guardar algo de esto.
-- No cambia datos. Se puede volver a ejecutar.
-- =====================================================================================

alter table public.productos add column if not exists en_temporada boolean not null default false;
comment on column public.productos.en_temporada is
  'Sale también en la sección de la temporada (si hay una encendida en ajustes.datos.temporada).';

-- Fecha «AAAA-MM-DD» que existe (no «2026-02-30»).
create or replace function privado.es_fecha(t text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if t is null or t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  return to_char(t::date, 'YYYY-MM-DD') = t;
exception when others then
  return false;
end
$$;

-- Enlace del botón del anuncio: una publicación de Instagram, Facebook o TikTok, o WhatsApp.
-- Dominio ANCLADO (igual que js/contenido.js), https, sin espacios, comillas ni caracteres raros.
create or replace function privado.es_enlace_anuncio(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(t) <= 500
    and t !~ '[\x01-\x20\x7f<>"''\\`]'
    and t ~ '^https://((www|m)\.)?(instagram|facebook)\.com(/|$)|^https://((www|m|vm|vt)\.)?tiktok\.com(/|$)|^https://wa\.me/',
    false)
$$;

-- Enlace a las bases legales: los mismos del anuncio o la web de las bases (eduardolar.github.io).
create or replace function privado.es_enlace_bases(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    privado.es_enlace_anuncio(t)
    or (char_length(t) <= 500
        and t !~ '[\x01-\x20\x7f<>"''\\`]'
        and t ~ '^https://eduardolar\.github\.io/'),
    false)
$$;

-- Revisa ajustes.datos. Devuelve NULL si vale o el motivo (en español) si no.
-- No replica toda la normalización: tipos, largos principales, WhatsApp, rutas y tamaños.
-- Lo que depende de la fecha (desde <= año actual) y de otras tablas (destacado) lo revisa
-- el disparador privado.ajustes_antes_de_guardar().
create or replace function privado.ajustes_problema(d jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  t jsonb;
  p jsonb;
  o jsonb;
  f jsonb;
  m jsonb;
  x jsonb;
  clave text;
  n numeric;
begin
  if d is null or jsonb_typeof(d) <> 'object' then
    return 'datos tiene que ser un objeto JSON';
  end if;
  if octet_length(d::text) > 32768 then
    return 'datos ocupa más de 32 KB';
  end if;
  for clave in select jsonb_object_keys(d) loop
    if clave not in ('tienda', 'portada', 'opiniones', 'financiacion', 'marcas', 'desde', 'version', 'temporada', 'anuncio') then
      return format('clave desconocida en datos: %s', clave);
    end if;
  end loop;
  if d ? 'version' and jsonb_typeof(d -> 'version') <> 'number' then
    return 'version tiene que ser un número';
  end if;

  -- tienda
  t := d -> 'tienda';
  if jsonb_typeof(t) is distinct from 'object' then
    return 'falta tienda (objeto)';
  end if;
  if not privado.json_linea(t -> 'telefono', 1, 20) then
    return 'tienda.telefono: de 1 a 20 caracteres, en una línea';
  end if;
  if jsonb_typeof(t -> 'whatsapp') is distinct from 'string' or (t ->> 'whatsapp') !~ '^34[0-9]{9}$' then
    return 'tienda.whatsapp: 34 seguido de 9 cifras';
  end if;
  if jsonb_typeof(t -> 'direccion') is distinct from 'string' or not privado.es_lineas(t ->> 'direccion', 140, 3) then
    return 'tienda.direccion: de 1 a 140 caracteres y como mucho 3 líneas';
  end if;
  if jsonb_typeof(t -> 'horario') is distinct from 'array' or jsonb_array_length(t -> 'horario') > 7 then
    return 'tienda.horario: lista de como mucho 7 tramos';
  end if;
  for x in select value from jsonb_array_elements(t -> 'horario') loop
    if jsonb_typeof(x) is distinct from 'object'
       or not privado.json_linea(x -> 'dias', 1, 60)
       or not privado.json_linea(x -> 'horas', 0, 60) then
      return 'tienda.horario: cada tramo con dias (1-60) y horas (0-60)';
    end if;
  end loop;
  if jsonb_typeof(t -> 'aviso') is distinct from 'object'
     or jsonb_typeof(t -> 'aviso' -> 'activo') is distinct from 'boolean'
     or not privado.json_linea(t -> 'aviso' -> 'texto', 0, 120) then
    return 'tienda.aviso: { activo: true/false, texto: hasta 120 caracteres }';
  end if;
  if not privado.json_linea(t -> 'zonaEntrega', 0, 80) then
    return 'tienda.zonaEntrega: hasta 80 caracteres, en una línea';
  end if;

  -- portada
  p := d -> 'portada';
  if jsonb_typeof(p) is distinct from 'object' then
    return 'falta portada (objeto)';
  end if;
  if jsonb_typeof(p -> 'titular') is distinct from 'string' or not privado.es_lineas(p ->> 'titular', 80, 3) then
    return 'portada.titular: de 1 a 80 caracteres y como mucho 3 líneas';
  end if;
  if not privado.json_linea(p -> 'entradilla', 1, 220) then
    return 'portada.entradilla: de 1 a 220 caracteres, en una línea';
  end if;
  if jsonb_typeof(p -> 'destacado') is distinct from 'string'
     or ((p ->> 'destacado') <> '' and (p ->> 'destacado') !~ '^[A-Z]{3}-[0-9]{2,4}$') then
    return 'portada.destacado: una referencia (p. ej. SOF-01) o vacío';
  end if;
  if jsonb_typeof(p -> 'foto') is distinct from 'string' or not privado.es_foto_portada(p ->> 'foto') then
    return 'portada.foto: ruta img/... o portada/{uuid}.jpg del bucket';
  end if;

  -- opiniones
  o := d -> 'opiniones';
  if jsonb_typeof(o) is distinct from 'object' then
    return 'falta opiniones (objeto)';
  end if;
  if coalesce(jsonb_typeof(o -> 'nota'), 'null') not in ('number', 'null') then
    return 'opiniones.nota: número de 1 a 5 o null';
  end if;
  if jsonb_typeof(o -> 'nota') = 'number' then
    n := (o ->> 'nota')::numeric;
    if n < 1 or n > 5 or n <> round(n, 1) then
      return 'opiniones.nota: de 1 a 5 con un decimal como mucho';
    end if;
  end if;
  if coalesce(jsonb_typeof(o -> 'total'), 'null') not in ('number', 'null') then
    return 'opiniones.total: número entero o null';
  end if;
  if jsonb_typeof(o -> 'total') = 'number' then
    n := (o ->> 'total')::numeric;
    if n < 0 or n > 100000 or n <> trunc(n) then
      return 'opiniones.total: entero de 0 a 100000';
    end if;
  end if;
  if jsonb_typeof(o -> 'enlace') is distinct from 'string'
     or char_length(o ->> 'enlace') > 500
     or (o ->> 'enlace') ~ '[\x01-\x20\x7f]'
     or (o ->> 'enlace') !~ '^https://(www\.)?google\.(com|es)/maps([/?]|$)|^https://maps\.app\.goo\.gl/|^https://g\.page/' then
    return 'opiniones.enlace: enlace https de Google Maps';
  end if;
  if jsonb_typeof(o -> 'lista') is distinct from 'array' or jsonb_array_length(o -> 'lista') > 6 then
    return 'opiniones.lista: como mucho 6 opiniones';
  end if;
  for x in select value from jsonb_array_elements(o -> 'lista') loop
    if jsonb_typeof(x) is distinct from 'object'
       or not privado.json_linea(x -> 'texto', 1, 220)
       or not privado.json_linea(x -> 'autor', 0, 40) then
      return 'opiniones.lista: cada opinión con texto (1-220) y autor (0-40)';
    end if;
  end loop;

  -- financiación
  f := d -> 'financiacion';
  if jsonb_typeof(f) is distinct from 'object'
     or jsonb_typeof(f -> 'activa') is distinct from 'boolean'
     or not privado.json_linea(f -> 'texto', 0, 80) then
    return 'financiacion: { activa: true/false, texto: hasta 80 caracteres }';
  end if;

  -- marcas: hasta 12, de 1 a 30 caracteres, sin repetir (sin distinguir mayúsculas)
  m := d -> 'marcas';
  if jsonb_typeof(m) is distinct from 'array' or jsonb_array_length(m) > 12 then
    return 'marcas: lista de como mucho 12';
  end if;
  for x in select value from jsonb_array_elements(m) loop
    if not privado.json_linea(x, 1, 30) then
      return 'marcas: cada marca de 1 a 30 caracteres, en una línea';
    end if;
  end loop;
  if (select count(distinct lower(value #>> '{}')) from jsonb_array_elements(m)) <> jsonb_array_length(m) then
    return 'marcas: hay marcas repetidas';
  end if;

  -- desde: año de 4 cifras (19xx o 20xx) o vacío
  if jsonb_typeof(d -> 'desde') is distinct from 'string'
     or ((d ->> 'desde') <> '' and (d ->> 'desde') !~ '^(19|20)[0-9]{2}$') then
    return 'desde: año de 4 cifras o vacío';
  end if;

  -- temporada (desde la 008, opcional): { tipo, texto (0-60), hasta ('' o AAAA-MM-DD) }
  if d ? 'temporada' then
    x := d -> 'temporada';
    if jsonb_typeof(x) is distinct from 'object' then
      return 'temporada: { tipo, texto, hasta }';
    end if;
    for clave in select jsonb_object_keys(x) loop
      if clave not in ('tipo', 'texto', 'hasta') then
        return format('clave desconocida en temporada: %s', clave);
      end if;
    end loop;
    if jsonb_typeof(x -> 'tipo') is distinct from 'string'
       or (x ->> 'tipo') not in ('ninguna', 'navidad', 'black-friday', 'rebajas', 'feria') then
      return 'temporada.tipo: ninguna, navidad, black-friday, rebajas o feria';
    end if;
    if not privado.json_linea(x -> 'texto', 0, 60) then
      return 'temporada.texto: hasta 60 caracteres, en una línea';
    end if;
    if jsonb_typeof(x -> 'hasta') is distinct from 'string'
       or ((x ->> 'hasta') <> '' and not privado.es_fecha(x ->> 'hasta')) then
      return 'temporada.hasta: fecha AAAA-MM-DD o vacío';
    end if;
  end if;

  -- anuncio (desde la 008, opcional): sorteos, eventos…
  if d ? 'anuncio' then
    x := d -> 'anuncio';
    if jsonb_typeof(x) is distinct from 'object' then
      return 'anuncio: objeto';
    end if;
    for clave in select jsonb_object_keys(x) loop
      if clave not in ('activo', 'tipo', 'titulo', 'texto', 'foto', 'boton', 'hasta', 'bases') then
        return format('clave desconocida en anuncio: %s', clave);
      end if;
    end loop;
    if jsonb_typeof(x -> 'activo') is distinct from 'boolean' then
      return 'anuncio.activo: true/false';
    end if;
    if jsonb_typeof(x -> 'tipo') is distinct from 'string' or (x ->> 'tipo') not in ('sorteo', 'evento', 'anuncio') then
      return 'anuncio.tipo: sorteo, evento o anuncio';
    end if;
    if not privado.json_linea(x -> 'titulo', case when (x -> 'activo') = 'true'::jsonb then 1 else 0 end, 60) then
      return 'anuncio.titulo: de 1 a 60 caracteres (sin título no se puede encender), en una línea';
    end if;
    if not privado.json_linea(x -> 'texto', 0, 220) then
      return 'anuncio.texto: hasta 220 caracteres, en una línea';
    end if;
    if jsonb_typeof(x -> 'foto') is distinct from 'string'
       or ((x ->> 'foto') <> '' and not privado.es_foto_portada(x ->> 'foto')) then
      return 'anuncio.foto: vacía, ruta img/... o portada/{uuid}.jpg del bucket';
    end if;
    if jsonb_typeof(x -> 'boton') is distinct from 'object' then
      return 'anuncio.boton: { texto, enlace }';
    end if;
    for clave in select jsonb_object_keys(x -> 'boton') loop
      if clave not in ('texto', 'enlace') then
        return format('clave desconocida en anuncio.boton: %s', clave);
      end if;
    end loop;
    if not privado.json_linea(x -> 'boton' -> 'texto', 0, 30) then
      return 'anuncio.boton.texto: hasta 30 caracteres, en una línea';
    end if;
    if jsonb_typeof(x -> 'boton' -> 'enlace') is distinct from 'string'
       or ((x #>> '{boton,enlace}') <> '' and not privado.es_enlace_anuncio(x #>> '{boton,enlace}')) then
      return 'anuncio.boton.enlace: vacío o https de Instagram, Facebook, TikTok o WhatsApp (wa.me)';
    end if;
    if jsonb_typeof(x -> 'hasta') is distinct from 'string'
       or ((x ->> 'hasta') <> '' and not privado.es_fecha(x ->> 'hasta')) then
      return 'anuncio.hasta: fecha AAAA-MM-DD o vacío';
    end if;
    if jsonb_typeof(x -> 'bases') is distinct from 'string'
       or ((x ->> 'bases') <> '' and not privado.es_enlace_bases(x ->> 'bases')) then
      return 'anuncio.bases: vacío o https de Instagram, Facebook, TikTok, WhatsApp o eduardolar.github.io';
    end if;
  end if;

  return null;
end
$$;

-- Los permisos (los mismos que en 001 para las funciones de los CHECK)
revoke all on function privado.es_fecha(text), privado.es_enlace_anuncio(text), privado.es_enlace_bases(text),
  privado.ajustes_problema(jsonb) from public, anon, authenticated;
grant execute on function privado.es_fecha(text), privado.es_enlace_anuncio(text), privado.es_enlace_bases(text),
  privado.ajustes_problema(jsonb) to authenticated, service_role;

-- Comprobación: la columna nueva y que la fila de ajustes sigue valiendo (problema NULL)
select (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'productos' and column_name = 'en_temporada') as columna_en_temporada,
       privado.ajustes_problema(datos) as problema
  from public.ajustes where id = 1;

commit;
