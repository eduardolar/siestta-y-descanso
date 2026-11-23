begin;  -- todo o nada

-- =====================================================================================
-- 005_enlace_opiniones.sql — El enlace de las opiniones solo puede ser de Google Maps, con el
-- dominio ANCLADO (antes valía cualquier «google.<algo>/maps»):
--   https://(www.)google.com/maps…  https://(www.)google.es/maps…  https://maps.app.goo.gl/…  https://g.page/…
-- Igual que js/contenido.js. Solo reemplaza privado.ajustes_problema (copiada de 001 cambiando esa
-- línea); no toca tablas ni datos. La fila actual (enlace de google.com/maps) la cumple.
-- Se puede volver a ejecutar.
-- =====================================================================================

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
    if clave not in ('tienda', 'portada', 'opiniones', 'financiacion', 'marcas', 'desde', 'version') then
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

  return null;
end
$$;

-- Los permisos de la función se conservan con «create or replace»; por si acaso, los mismos que en 001:
revoke all on function privado.ajustes_problema(jsonb) from public, anon, authenticated;
grant execute on function privado.ajustes_problema(jsonb) to authenticated, service_role;

-- Comprobación: la fila de ajustes sigue siendo válida con la regla nueva (debe salir NULL)
select privado.ajustes_problema(datos) as problema from public.ajustes where id = 1;

commit;
