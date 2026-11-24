begin;  -- todo o nada

-- =====================================================================================
-- 009_historial.sql — Historial de cambios de productos y ajustes (los últimos 90 días).
--
-- Qué crea:
--   · tabla public.historial: una fila por alta, cambio o borrado, con quién lo hizo (uuid y
--     correo de su sesión), qué fila (ref del producto o 'ajustes') y SOLO lo que cambió:
--       cambios = { "campo": { "antes": …, "despues": … }, … }
--     En productos, por columna (sin creado_en ni actualizado_en). En ajustes, dentro de «datos»
--     por claves de primer y segundo nivel («portada.titular», «tienda.horario», «marcas»…): si
--     cambia una opinión se guarda opiniones.lista, no los 32 KB de datos.
--     Un guardado sin diferencias reales (mismo contenido, solo cambia actualizado_en) no se anota.
--   · disparadores AFTER INSERT/UPDATE/DELETE en productos y ajustes (SECURITY DEFINER, en privado);
--   · RLS: solo los editores leen el historial; nadie lo escribe a mano (ni la API ni la clave
--     secreta): solo los disparadores. El público (anon) no lo ve.
--   · retención: lo de más de 90 días se borra solo, en el mismo disparador (ver privado.historial_limpiar).
--
-- No toca productos, ajustes ni sus reglas. Se puede volver a ejecutar (no borra el historial ya guardado).
-- Vuelta atrás: supabase/deshacer/009_deshacer_historial.sql
--
-- Orden de bloqueo: el historial va SIEMPRE el último (productos -> ajustes -> historial). La
-- limpieza no espera nunca por nadie (bloqueo consultivo «try» + SKIP LOCKED): no puede crear ciclos.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Tabla
-- -------------------------------------------------------------------------------------
create table if not exists public.historial (
  id        bigint generated always as identity primary key,
  cuando    timestamptz not null default now(),
  quien     uuid default auth.uid(),                          -- null = SQL Editor o clave secreta
  correo    text default (auth.jwt() ->> 'email'),            -- el de la sesión (JWT firmado por Supabase)
  origen    text default coalesce(auth.jwt() ->> 'role', session_user::text),
                                                              -- authenticated (panel), service_role, postgres (SQL Editor)
  tabla     text not null,
  registro  text not null,                                    -- ref del producto o 'ajustes'
  accion    text not null,
  cambios   jsonb not null default '{}'::jsonb,
  resumen   text,

  constraint historial_tabla   check (tabla in ('productos', 'ajustes')),
  constraint historial_accion  check (accion in ('crear', 'cambiar', 'borrar')),
  constraint historial_cambios check (jsonb_typeof(cambios) = 'object'),
  constraint historial_resumen check (resumen is null or char_length(resumen) <= 300)
);

comment on table public.historial is
  'Historial de cambios de productos y ajustes (90 días). Lo escriben solo los disparadores; lo leen solo los editores.';
comment on column public.historial.quien is 'auth.uid() de quien hizo el cambio; null si fue desde el SQL Editor o con la clave secreta.';
comment on column public.historial.correo is 'Correo de la sesión (claim email del JWT) en el momento del cambio.';
comment on column public.historial.origen is 'Rol de la petición: authenticated (panel), service_role (clave secreta) o el usuario de la base (SQL Editor).';
comment on column public.historial.registro is 'Referencia del producto (SOF-01…) o ''ajustes''.';
comment on column public.historial.cambios is
  'Solo lo que cambió: {campo: {antes, despues}}. En ajustes, claves de datos de primer y segundo nivel (portada.titular).';

-- Lo que pide el panel: lo último primero, y lo de un producto concreto.
create index if not exists historial_cuando   on public.historial (cuando desc);
create index if not exists historial_registro on public.historial (tabla, registro, cuando desc);

-- -------------------------------------------------------------------------------------
-- 2. Diferencias entre dos objetos JSON: {clave: {antes, despues}} solo de lo que cambia.
--    Con «profundo», si las dos versiones de una clave son objetos, se baja un nivel más
--    («portada.titular»). Igualdad de jsonb: no cuenta el orden de las claves y 650 = 650.00.
--    Una clave que aparece o desaparece sale con antes o despues a null.
-- -------------------------------------------------------------------------------------
create or replace function privado.historial_diferencias(a jsonb, b jsonb, profundo boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with claves as (
    select k.clave,
           a -> k.clave as va,
           b -> k.clave as vb
      from (select jsonb_object_keys(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end)
            union
            select jsonb_object_keys(case when jsonb_typeof(b) = 'object' then b else '{}'::jsonb end)) as k(clave)
  ),
  distintas as (
    select c.clave, c.va, c.vb,
           -- coalesce: si falta una de las dos versiones, jsonb_typeof da null y, sin él, la clave se perdería
           coalesce(profundo and jsonb_typeof(c.va) = 'object' and jsonb_typeof(c.vb) = 'object', false) as bajar
      from claves c
     where c.va is distinct from c.vb
  ),
  cambios as (
    select d.clave as campo, jsonb_build_object('antes', d.va, 'despues', d.vb) as cambio
      from distintas d
     where not d.bajar
    union all
    select d.clave || '.' || s.sub, jsonb_build_object('antes', d.va -> s.sub, 'despues', d.vb -> s.sub)
      from distintas d
     cross join lateral (select jsonb_object_keys(case when d.bajar then d.va else '{}'::jsonb end)
                         union
                         select jsonb_object_keys(case when d.bajar then d.vb else '{}'::jsonb end)) as s(sub)
     where d.bajar
       and (d.va -> s.sub) is distinct from (d.vb -> s.sub)
  )
  select coalesce(jsonb_object_agg(campo, cambio), '{}'::jsonb) from cambios
$$;

comment on function privado.historial_diferencias(jsonb, jsonb, boolean) is
  'Diferencias {clave: {antes, despues}} entre dos objetos; con profundo, baja un nivel en los objetos.';

-- Texto para el resumen sin caracteres que puedan engañar al pintarlo: los de control (C0 y C1),
-- los saltos U+2028/U+2029, las marcas y anulaciones de dirección (U+061C, U+200E, U+200F,
-- U+202A-U+202E, U+2066-U+2069) y U+FEFF. Se cambian por «?».
create or replace function privado.historial_texto_limpio(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(t, '[\x01-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]', '?', 'g')
$$;

-- -------------------------------------------------------------------------------------
-- 3. Retención: borra lo de más de 90 días. Nunca espera: si otra sesión está limpiando
--    (bloqueo consultivo ocupado) o tiene alguna de esas filas bloqueada, la salta; ya se
--    borrará en la próxima. Con el índice por «cuando», cuando no hay nada viejo cuesta
--    una lectura de índice: se puede llamar en cada cambio.
-- -------------------------------------------------------------------------------------
create or replace function privado.historial_limpiar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas integer := 0;
begin
  if pg_try_advisory_xact_lock(hashtext('siestta.historial.limpiar')) then
    delete from public.historial h
     where h.id in (select v.id
                      from public.historial v
                     where v.cuando < now() - interval '90 days'
                     order by v.cuando
                     limit 1000
                       for update skip locked);
    get diagnostics v_borradas = row_count;
  end if;
  return v_borradas;
end
$$;

comment on function privado.historial_limpiar() is
  'Borra el historial de más de 90 días (hasta 1000 filas por llamada, sin esperar bloqueos). La llama el disparador.';

-- -------------------------------------------------------------------------------------
-- 4. Disparador que anota (uno para las dos tablas). Variables con «v_» para no chocar con
--    columnas (tabla, registro, accion, cambios, resumen…).
-- -------------------------------------------------------------------------------------
create or replace function privado.historial_anotar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viejo    jsonb;
  v_nuevo    jsonb;
  v_cambios  jsonb;
  v_registro text;
  v_accion   text;
  v_nombre   text;
  v_campos   text;
  v_resumen  text;
begin
  v_accion := case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'cambiar' else 'borrar' end;
  -- to_jsonb de la fila entera: así la función sirve para las dos tablas sin nombrar sus columnas.
  if tg_op <> 'INSERT' then
    v_viejo := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_nuevo := to_jsonb(new);
  end if;

  if tg_table_name = 'productos' then
    v_registro := coalesce(v_nuevo ->> 'ref', v_viejo ->> 'ref');
    v_nombre   := coalesce(v_nuevo ->> 'nombre', v_viejo ->> 'nombre');
    v_cambios  := privado.historial_diferencias(
                    v_viejo - array['creado_en', 'actualizado_en'],
                    v_nuevo - array['creado_en', 'actualizado_en'],
                    false);
  elsif tg_table_name = 'ajustes' then
    v_registro := 'ajustes';
    v_cambios  := privado.historial_diferencias(v_viejo -> 'datos', v_nuevo -> 'datos', true);
  else
    raise exception 'historial_anotar: tabla no prevista (%)', tg_table_name;
  end if;

  if v_accion = 'cambiar' and v_cambios = '{}'::jsonb then
    return null;  -- guardado sin diferencias reales: no se anota
  end if;

  -- Tope de tamaño: si lo cambiado pasa de 8 KB, los campos de más de 2 KB se guardan solo con
  -- su tamaño ({antes: {omitido: bytes}, despues: {omitido: bytes}}), no con su contenido.
  if octet_length(v_cambios::text) > 8192 then
    select jsonb_object_agg(c.key,
             case when octet_length(c.value::text) > 2048
                  then jsonb_build_object(
                         'antes',   jsonb_build_object('omitido', coalesce(octet_length((c.value -> 'antes')::text), 0)),
                         'despues', jsonb_build_object('omitido', coalesce(octet_length((c.value -> 'despues')::text), 0)))
                  else c.value
             end)
      into v_cambios
      from jsonb_each(v_cambios) as c;
  end if;

  -- Nombres de campo en el resumen: solo letras, cifras, «.», «_», «-» y espacios (las claves de
  -- segundo nivel de ajustes no están cerradas y podrían traer cualquier cosa).
  select string_agg(c.campo, ', ' order by c.campo) into v_campos
    from jsonb_object_keys(v_cambios) as c(campo);
  v_campos := regexp_replace(v_campos, '[^[:alnum:]._, -]', '?', 'g');
  -- El nombre del producto se deja legible (ya lo limitan las reglas a 60 caracteres en una línea),
  -- pero sin caracteres de control ni de dirección. La ref y el estado ya los cierran sus CHECK.
  v_nombre := privado.historial_texto_limpio(v_nombre);

  v_resumen := case
    when v_registro = 'ajustes' and v_accion = 'cambiar' then 'Ajustes: cambia ' || v_campos
    when v_registro = 'ajustes' and v_accion = 'crear' then 'Alta de los ajustes'
    when v_registro = 'ajustes' then 'Borrado de los ajustes'
    when v_accion = 'crear'     then format('Alta de %s «%s»', v_registro, v_nombre)
    when v_accion = 'borrar'    then format('Borrado de %s «%s»', v_registro, v_nombre)
    when v_cambios ? 'estado'   then format('%s «%s»: %s (%s)', v_registro, v_nombre,
                                            v_nuevo ->> 'estado', v_campos)
    else format('%s «%s»: cambia %s', v_registro, v_nombre, v_campos)
  end;
  if char_length(v_resumen) > 300 then
    v_resumen := left(v_resumen, 299) || '…';
  end if;

  -- quien, correo, origen y cuando: los pone la tabla (valores por defecto de la sesión).
  insert into public.historial (tabla, registro, accion, cambios, resumen)
  values (tg_table_name, v_registro, v_accion, v_cambios, v_resumen);

  perform privado.historial_limpiar();
  return null;
end
$$;

-- Nadie puede cambiar una fila del historial, borrar una de los últimos 90 días ni vaciarlo
-- (TRUNCATE), ni siquiera desde el SQL Editor (salvo desactivando estos disparadores a propósito).
create or replace function privado.historial_intocable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = 'insufficient_privilege', message = 'El historial no se puede vaciar';
  end if;
  if tg_op = 'UPDATE' then
    raise exception using errcode = 'insufficient_privilege', message = 'El historial no se puede cambiar';
  end if;
  if old.cuando >= now() - interval '90 days' then
    raise exception using errcode = 'insufficient_privilege',
      message = 'El historial de los últimos 90 días no se puede borrar';
  end if;
  return old;
end
$$;

-- Los nombres empiezan por «historial_» para que se disparen antes que los demás AFTER de la
-- tabla (van por orden alfabético): vender el destacado anota primero el producto y después
-- el cambio de la portada.
create or replace trigger historial_productos
  after insert or update or delete on public.productos
  for each row execute function privado.historial_anotar();

create or replace trigger historial_ajustes
  after insert or update or delete on public.ajustes
  for each row execute function privado.historial_anotar();

create or replace trigger historial_intocable
  before update or delete on public.historial
  for each row execute function privado.historial_intocable();

create or replace trigger historial_sin_vaciar
  before truncate on public.historial
  for each statement execute function privado.historial_intocable();

-- -------------------------------------------------------------------------------------
-- 5. Permisos y RLS
-- -------------------------------------------------------------------------------------
-- Funciones: nadie las ejecuta a mano (los disparadores no necesitan EXECUTE).
revoke all on function privado.historial_diferencias(jsonb, jsonb, boolean),
                       privado.historial_limpiar(),
                       privado.historial_anotar(),
                       privado.historial_intocable(),
                       privado.historial_texto_limpio(text)
  from public, anon, authenticated, service_role;

-- Tabla: solo lectura, y solo para quien entra (y la RLS lo deja en los editores).
-- Sin INSERT/UPDATE/DELETE/TRUNCATE para nadie de la API, tampoco service_role (que se salta la RLS).
revoke all on table public.historial from public, anon, authenticated, service_role;
grant select on table public.historial to authenticated, service_role;
revoke all on sequence public.historial_id_seq from public, anon, authenticated, service_role;

alter table public.historial enable row level security;

drop policy if exists "historial: los editores leen" on public.historial;
create policy "historial: los editores leen" on public.historial
  for select to authenticated
  using ((select privado.es_editor()) and cuando >= now() - interval '90 days');  -- lo viejo no se ve aunque siga

-- (Una política se reemplaza entera: si ya existía de una ejecución anterior, queda la nueva.)

-- Comprobación: tabla con RLS, sus disparadores y la política
select (select c.relrowsecurity from pg_class c where c.oid = 'public.historial'::regclass) as rls_historial,
       (select string_agg(t.tgname || ' en ' || t.tgrelid::regclass::text, ', ' order by t.tgname)
          from pg_trigger t
         where t.tgname in ('historial_productos', 'historial_ajustes', 'historial_intocable', 'historial_sin_vaciar')) as disparadores,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'historial') as politicas;

commit;
