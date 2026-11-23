-- Arreglo de 001: la variable «destacado» chocaba con la columna productos.destacado.
-- Solo reemplaza la función; no toca tablas ni datos.
begin;

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

commit;
