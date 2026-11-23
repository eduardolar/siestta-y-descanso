begin;  -- todo o nada: si algo falla, no queda nada a medias

-- =====================================================================================
-- 001_esquema.sql — Esquema de la web-escaparate de Siestta y Descanso (Supabase, PostgreSQL 15+)
--
-- Qué crea:
--   · esquema privado «privado» (no se publica en la API) con las funciones de apoyo;
--   · tablas public.productos, public.ajustes (una sola fila) y public.editores;
--   · restricciones (CHECK) que copian las reglas de js/contenido.js (versión 3 del contenido), ya con lo
--     de las migraciones 005 (enlace de opiniones), 007 (accesorios y otros) y 008 (temporada y anuncio);
--   · disparadores: sellado de fechas (actualizado_en), límite de 200 productos, referencia
--     inmutable y «si se vende o se borra el producto de la portada, la portada se queda sin destacado»;
--   · RLS y permisos mínimos para anon / authenticated;
--   · bucket de Storage «fotos» y sus políticas.
--
-- Se ejecuta entero en el SQL Editor de Supabase (como postgres). Se puede volver a ejecutar:
-- funciones, disparadores y políticas se reemplazan; las tablas existentes NO se tocan (si
-- cambia una restricción hará falta una migración nueva, 003_...).
-- Vuelta atrás: supabase/deshacer/001_deshacer_esquema.sql
--
-- Orden de bloqueo (para que no haya interbloqueos):
--   productos (fila)  ->  ajustes (fila id = 1)
--   Quien cambia ajustes NO bloquea filas de productos (solo las lee); quien vende o borra
--   un producto bloquea después la fila de ajustes. Así nunca hay ciclo.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0. Esquema privado: lo que hay aquí no lo publica PostgREST (solo publica «public»).
-- -------------------------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public;
revoke all on schema privado from anon, authenticated;
-- authenticated necesita USAGE para evaluar las políticas y CHECK que llaman a estas funciones.
grant usage on schema privado to authenticated, service_role;

comment on schema privado is
  'Funciones de apoyo de la web (validaciones, es_editor, disparadores). No se publica en la API.';

-- -------------------------------------------------------------------------------------
-- 1. Funciones de validación (inmutables). Reproducen la normalización de js/contenido.js:
--    la BD no acepta un texto que la web no dejaría tal cual tras normalizarlo.
--    Los largos se cuentan en caracteres (como Array.from en JS), no en bytes.
-- -------------------------------------------------------------------------------------

-- Texto de una línea, como unaLinea(): sin caracteres de control (ni saltos ni tabuladores),
-- sin espacios «raros» (los \s de JS distintos del espacio normal), sin dos espacios seguidos
-- y sin espacios al principio ni al final. Vacío ('') vale; el mínimo lo pone quien llama.
create or replace function privado.es_linea(t text, maximo integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(t) <= maximo
    and t !~ '[\x01-\x1f\x7f   -     　﻿]'
    and t !~ '^ | $|  ',
    false)
$$;

-- Texto de varias líneas sin líneas vacías (titular y dirección, como los guarda el panel):
-- cada línea es una «línea» válida, no vacía, y como mucho «max_lineas» líneas.
create or replace function privado.es_lineas(t text, maximo integer, max_lineas integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(t) between 1 and maximo
    and t !~ '[\x01-\x09\x0b-\x1f\x7f   -     　﻿]'
    and t !~ '^[ \n]|[ \n]$| \n|\n |  |\n\n'
    and char_length(t) - char_length(replace(t, chr(10), '')) + 1 <= max_lineas,
    false)
$$;

-- Párrafos, como parrafos(): saltos de línea permitidos, como mucho una línea en blanco
-- seguida, cada línea sin espacios dobles ni en los bordes, el conjunto recortado. '' vale.
create or replace function privado.es_parrafos(t text, maximo integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(t) <= maximo
    and t !~ '[\x01-\x09\x0b-\x1f\x7f   -     　﻿]'
    and t !~ '^[ \n]|[ \n]$| \n|\n |  |\n\n\n',
    false)
$$;

-- Foto de la carpeta img/ del repositorio (las de la web actual), como fotoValida().
create or replace function privado.es_ruta_img(r text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(r) <= 200
    and r ~* '^img/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$'
    and strpos(r, '..') = 0,
    false)
$$;

-- Ruta de un objeto del bucket «fotos»:
--   productos/{ref}/{uuid}.{jpg|png|webp}   o   portada/{uuid}.{jpg|png|webp}
-- (uuid en minúsculas, como crypto.randomUUID()).
create or replace function privado.es_ruta_almacen(r text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    r ~ '^(productos/[A-Z]{3}-[0-9]{2,4}|portada)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$',
    false)
$$;

-- Foto válida para el producto «ref»: de img/ o del bucket dentro de productos/{ref}/.
-- (Las fotos incrustadas «data:image/...» del prototipo NO se aceptan: van al bucket.)
create or replace function privado.es_foto_producto(r text, ref text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    privado.es_ruta_img(r)
    or (privado.es_ruta_almacen(r) and split_part(r, '/', 1) = 'productos' and split_part(r, '/', 2) = ref),
    false)
$$;

-- Foto de la portada: de img/ o del bucket dentro de portada/.
create or replace function privado.es_foto_portada(r text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    privado.es_ruta_img(r)
    or (privado.es_ruta_almacen(r) and split_part(r, '/', 1) = 'portada'),
    false)
$$;

-- Lista de fotos de un producto: de 0 a 4, una dimensión, sin nulos ni repetidas, todas válidas.
create or replace function privado.fotos_validas(fotos text[], ref text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if fotos is null then
    return false;
  end if;
  if cardinality(fotos) = 0 then
    return true;
  end if;
  if cardinality(fotos) > 4 or array_ndims(fotos) <> 1 then
    return false;
  end if;
  return coalesce((
    select count(f) = count(*)               -- sin nulos
       and count(distinct f) = count(*)      -- sin repetidas
       and bool_and(privado.es_foto_producto(f, ref))
      from unnest(fotos) as f
  ), false);
end
$$;

-- Valor jsonb que es una cadena de una línea con largo entre «minimo» y «maximo».
create or replace function privado.json_linea(v jsonb, minimo integer, maximo integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(v) = 'string'
    and char_length(v #>> '{}') >= minimo
    and privado.es_linea(v #>> '{}', maximo),
    false)
$$;

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

-- -------------------------------------------------------------------------------------
-- 2. Tablas
-- -------------------------------------------------------------------------------------

create table if not exists public.productos (
  ref               text primary key,
  nombre            text not null,
  categoria         text not null default 'sofas',
  precio            numeric(10, 2),                       -- null = «Consultar»
  precio_antes      numeric(10, 2),                       -- precio tachado; solo si hay precio y es mayor
  etiqueta          text not null default '',
  estado            text not null default 'disponible',
  fotos             text[] not null default '{}',         -- 0-4 rutas; la primera es la principal
  descripcion       text not null default '',
  descripcion_larga text not null default '',
  medidas           text not null default '',
  colores           text not null default '',
  firmeza           text not null default '',             -- solo se enseña en colchones
  a_medida          boolean not null default false,
  plazo             text not null default '',
  destacado         boolean not null default false,       -- sale primero en la lista
  en_temporada      boolean not null default false,       -- sale también en la sección de la temporada
  orden             integer not null default 0,           -- orden de la lista (ascendente)
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),   -- lo pone el disparador; sirve de «If-Match»

  constraint productos_ref_formato       check (ref ~ '^[A-Z]{3}-[0-9]{2,4}$'),
  constraint productos_nombre            check (char_length(nombre) >= 1 and privado.es_linea(nombre, 60)),
  constraint productos_categoria         check (categoria in ('sofas', 'sillones', 'colchones', 'camas', 'accesorios', 'otros')),
  constraint productos_precio            check (precio is null or (precio > 0 and precio <= 1000000)),
  constraint productos_precio_antes      check (precio_antes is null
                                                or (precio is not null and precio_antes > precio and precio_antes <= 1000000)),
  constraint productos_etiqueta          check (etiqueta in ('', 'exposicion', 'oferta', 'ultimas')),
  constraint productos_estado            check (estado in ('disponible', 'reservado', 'vendido')),
  constraint productos_fotos             check (privado.fotos_validas(fotos, ref)),
  constraint productos_descripcion       check (privado.es_linea(descripcion, 140)),
  constraint productos_descripcion_larga check (privado.es_parrafos(descripcion_larga, 1000)),
  constraint productos_medidas           check (privado.es_linea(medidas, 120)),
  constraint productos_colores           check (privado.es_linea(colores, 160)),
  constraint productos_firmeza           check (firmeza in ('', 'blanda', 'media', 'firme', 'muy firme')),
  constraint productos_plazo             check (privado.es_linea(plazo, 60)),
  constraint productos_orden             check (orden >= 0)
);

comment on table public.productos is
  'Productos del escaparate. El público solo ve los que no están vendidos; los editores, todos. Máximo 200.';
comment on column public.productos.ref is
  'Referencia (p. ej. SOF-01): 3 letras mayúsculas, guion y 2-4 cifras. No se puede cambiar.';
comment on column public.productos.precio is 'Precio en euros; null = «Consultar». Mayor que 0.';
comment on column public.productos.precio_antes is 'Precio anterior (tachado). Solo si hay precio y es mayor.';
comment on column public.productos.fotos is
  'De 0 a 4 rutas: img/... (fotos de la web) o productos/{ref}/{uuid}.jpg del bucket «fotos».';
comment on column public.productos.actualizado_en is
  'Sellado por el disparador en cada cambio (precisión de milisegundos, siempre crece). Úsese para actualizaciones condicionales.';

-- Sin índices extra: como mucho 200 filas; la clave primaria basta para buscar por ref y
-- ordenar 200 filas por «orden» cuesta menos que mantener un índice.

create table if not exists public.ajustes (
  id             smallint primary key default 1,
  datos          jsonb not null,
  actualizado_en timestamptz not null default now(),

  constraint ajustes_una_sola_fila  check (id = 1),
  constraint ajustes_datos_validos  check (privado.ajustes_problema(datos) is null)
);

comment on table public.ajustes is
  'Ajustes de la web (una sola fila, id = 1): tienda, portada, opiniones, financiación, marcas, desde, temporada y anuncio.';
comment on column public.ajustes.datos is
  'JSON como el de js/contenido.js sin «productos». portada.destacado = ref de un producto no vendido o ''''.';

create table if not exists public.editores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null default '',
  creado_en timestamptz not null default now(),

  constraint editores_nombre check (privado.es_linea(nombre, 60))
);

comment on table public.editores is
  'Quien está aquí puede editar productos, ajustes y fotos. Altas y bajas solo desde el SQL Editor.';

-- -------------------------------------------------------------------------------------
-- 3. ¿Es editor quien hace la petición? (SECURITY DEFINER: lee editores sin pasar por su RLS)
-- -------------------------------------------------------------------------------------
create or replace function privado.es_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.editores where user_id = (select auth.uid())
  )
$$;

comment on function privado.es_editor() is
  'true si el usuario de la petición (auth.uid()) está en public.editores.';

-- -------------------------------------------------------------------------------------
-- 4. Disparadores
-- -------------------------------------------------------------------------------------

-- Sello de tiempo para el control de concurrencia (actualizado_en): en milisegundos (un Date
-- de JS lo conserva exacto) y siempre mayor que el anterior, aunque dos cambios caigan en el
-- mismo milisegundo. Va escrito dentro de cada disparador para no exponer otra función.

-- productos: fechas, referencia inmutable
create or replace function privado.productos_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.actualizado_en := date_trunc('milliseconds', clock_timestamp());
  else
    if new.ref is distinct from old.ref then
      raise exception using
        errcode = 'check_violation',
        message = 'La referencia de un producto no se puede cambiar',
        detail  = format('%s -> %s', old.ref, new.ref);
    end if;
    new.creado_en := old.creado_en;
    new.actualizado_en := greatest(date_trunc('milliseconds', clock_timestamp()),
                                   old.actualizado_en + interval '1 millisecond');
  end if;
  return new;
end
$$;

-- productos: como mucho 200. El bloqueo consultivo pone en fila las altas simultáneas para
-- que dos sesiones no cuenten 199 a la vez (en READ COMMITTED, el recuento que va después
-- del bloqueo ya ve lo que la otra confirmó).
create or replace function privado.productos_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('siestta.productos.limite'));
  if (select count(*) from public.productos) >= 200 then
    raise exception using
      errcode = 'check_violation',
      message = 'Has llegado al máximo de 200 productos. Borra alguno vendido para añadir otro.';
  end if;
  return new;
end
$$;

-- Si se vende o se borra el producto destacado en la portada, la portada se queda sin
-- destacado (como hace normalizar() en la web). Bloquea SIEMPRE la fila de ajustes antes de
-- mirarla: si otra sesión estaba poniendo este producto de destacado, esperamos a que
-- confirme y lo vemos; si llega después, su disparador ya verá el producto vendido.
create or replace function privado.quitar_de_portada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actual text;
begin
  select a.datos #>> '{portada,destacado}' into actual
    from public.ajustes a
   where a.id = 1
     for update;
  if actual = old.ref then
    update public.ajustes
       set datos = jsonb_set(datos, '{portada,destacado}', '""'::jsonb)
     where id = 1;
  end if;
  return null;
end
$$;

-- ajustes: valida (con mensaje claro), comprueba el destacado y sella la fecha.
create or replace function privado.ajustes_antes_de_guardar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  problema  text;
  v_destacado text;
begin
  problema := privado.ajustes_problema(new.datos);
  if problema is not null then
    raise exception using errcode = 'check_violation', message = 'Ajustes no válidos: ' || problema;
  end if;

  if (new.datos ->> 'desde') <> ''
     and (new.datos ->> 'desde')::integer > extract(year from (now() at time zone 'Europe/Madrid')) then
    raise exception using errcode = 'check_violation', message = 'Ajustes no válidos: desde no puede ser un año futuro';
  end if;

  -- Se lee sin bloquear (ver el orden de bloqueo arriba).
  v_destacado := new.datos #>> '{portada,destacado}';
  if v_destacado <> '' and not exists (
    select 1 from public.productos p where p.ref = v_destacado and p.estado <> 'vendido'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'El destacado de la portada tiene que ser un producto que exista y no esté vendido',
      detail  = v_destacado;
  end if;

  if tg_op = 'INSERT' then
    new.actualizado_en := date_trunc('milliseconds', clock_timestamp());
  else
    new.actualizado_en := greatest(date_trunc('milliseconds', clock_timestamp()),
                                   old.actualizado_en + interval '1 millisecond');
  end if;
  return new;
end
$$;

create or replace trigger productos_antes_de_guardar
  before insert or update on public.productos
  for each row execute function privado.productos_antes_de_guardar();

create or replace trigger productos_limite
  before insert on public.productos
  for each row execute function privado.productos_limite();

create or replace trigger productos_vendido_fuera_de_portada
  after update of estado on public.productos
  for each row
  when (new.estado = 'vendido' and old.estado is distinct from 'vendido')
  execute function privado.quitar_de_portada();

create or replace trigger productos_borrado_fuera_de_portada
  after delete on public.productos
  for each row execute function privado.quitar_de_portada();

create or replace trigger ajustes_antes_de_guardar
  before insert or update on public.ajustes
  for each row execute function privado.ajustes_antes_de_guardar();

-- -------------------------------------------------------------------------------------
-- 5. Permisos sobre funciones: nadie las ejecuta salvo lo imprescindible.
--    (Las funciones de disparador no necesitan EXECUTE para dispararse.)
-- -------------------------------------------------------------------------------------
revoke all on all functions in schema privado from public, anon, authenticated;

-- authenticated (editores) y service_role: las de los CHECK, las de las políticas y las que
-- estas llaman por dentro. anon no escribe ni evalúa políticas con funciones: no le hace falta.
grant execute on function
  privado.es_linea(text, integer),
  privado.es_lineas(text, integer, integer),
  privado.es_parrafos(text, integer),
  privado.es_ruta_img(text),
  privado.es_ruta_almacen(text),
  privado.es_foto_producto(text, text),
  privado.es_foto_portada(text),
  privado.fotos_validas(text[], text),
  privado.json_linea(jsonb, integer, integer),
  privado.es_fecha(text),
  privado.es_enlace_anuncio(text),
  privado.es_enlace_bases(text),
  privado.ajustes_problema(jsonb),
  privado.es_editor()
to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 6. Permisos sobre tablas. Supabase concede por defecto ALL (incluido TRUNCATE, que se salta
--    RLS) a anon y authenticated en todo lo de public: se quita y se da solo lo necesario.
-- -------------------------------------------------------------------------------------
revoke all on table public.productos, public.ajustes, public.editores from public, anon, authenticated;

grant select on table public.productos to anon, authenticated;
grant insert, update, delete on table public.productos to authenticated;

grant select on table public.ajustes to anon, authenticated;
grant update (datos) on table public.ajustes to authenticated;    -- id y actualizado_en, no

grant select on table public.editores to authenticated;           -- y RLS: solo su propia fila

-- Lo que se cree en adelante en public (por postgres) ya no nace abierto a la API:
-- habrá que conceder a mano lo que haga falta.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 7. RLS
-- -------------------------------------------------------------------------------------
alter table public.productos enable row level security;
alter table public.ajustes   enable row level security;
alter table public.editores  enable row level security;

-- productos
drop policy if exists "productos: el público ve los no vendidos" on public.productos;
create policy "productos: el público ve los no vendidos" on public.productos
  for select to anon, authenticated
  using (estado <> 'vendido');

drop policy if exists "productos: los editores ven todos" on public.productos;
create policy "productos: los editores ven todos" on public.productos
  for select to authenticated
  using ((select privado.es_editor()));

drop policy if exists "productos: los editores añaden" on public.productos;
create policy "productos: los editores añaden" on public.productos
  for insert to authenticated
  with check ((select privado.es_editor()));

drop policy if exists "productos: los editores cambian" on public.productos;
create policy "productos: los editores cambian" on public.productos
  for update to authenticated
  using ((select privado.es_editor()))
  with check ((select privado.es_editor()));

drop policy if exists "productos: los editores borran" on public.productos;
create policy "productos: los editores borran" on public.productos
  for delete to authenticated
  using ((select privado.es_editor()));

-- ajustes (no hay política de INSERT ni DELETE: la fila la crea 002 y no se borra)
drop policy if exists "ajustes: todos leen" on public.ajustes;
create policy "ajustes: todos leen" on public.ajustes
  for select to anon, authenticated
  using (true);

drop policy if exists "ajustes: los editores cambian" on public.ajustes;
create policy "ajustes: los editores cambian" on public.ajustes
  for update to authenticated
  using ((select privado.es_editor()))
  with check ((select privado.es_editor()));

-- editores: cada uno ve solo su fila (para que el panel sepa si es editor). Nada más.
drop policy if exists "editores: cada uno ve su fila" on public.editores;
create policy "editores: cada uno ve su fila" on public.editores
  for select to authenticated
  using (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------------------
-- 8. Storage: bucket «fotos» (lectura pública por URL; 600 KB; JPEG, WebP o PNG)
--    Si este INSERT fallase en tu proyecto, crea el bucket a mano (ver LEEME.md) y
--    comenta este bloque; las políticas de abajo funcionan igual.
-- -------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 614400, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La descarga pública (/storage/v1/object/public/fotos/...) no pasa por estas políticas.
-- No hay política de lectura para anon: nadie puede listar el bucket salvo los editores.
drop policy if exists "fotos: los editores listan" on storage.objects;
create policy "fotos: los editores listan" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and (select privado.es_editor()));

drop policy if exists "fotos: los editores suben" on storage.objects;
create policy "fotos: los editores suben" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (select privado.es_editor()) and privado.es_ruta_almacen(name));

drop policy if exists "fotos: los editores reemplazan" on storage.objects;
create policy "fotos: los editores reemplazan" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and (select privado.es_editor()))
  with check (bucket_id = 'fotos' and (select privado.es_editor()) and privado.es_ruta_almacen(name));

drop policy if exists "fotos: los editores borran" on storage.objects;
create policy "fotos: los editores borran" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (select privado.es_editor()));

commit;
