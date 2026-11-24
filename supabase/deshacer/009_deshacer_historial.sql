-- =====================================================================================
-- Deshace 009_historial.sql: quita la tarea de pg_cron (si se programó), los disparadores, las
-- funciones y la tabla del historial.
-- BORRA el historial guardado (si lo quieres, antes: Table Editor → historial → Export to CSV).
-- No toca productos ni ajustes.
-- =====================================================================================
begin;

-- Tarea «historial-90-dias» de pg_cron (LEEME, sección 8). Sin pg_cron o sin la tarea, no hace
-- nada: el SQL es dinámico para no fallar aunque no exista el esquema cron.
do $$
begin
  if to_regclass('cron.job') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''historial-90-dias''';
  end if;
end
$$;

drop trigger if exists historial_productos on public.productos;
drop trigger if exists historial_ajustes   on public.ajustes;

drop table if exists public.historial;  -- se lleva su política, sus índices, su secuencia y sus disparadores

drop function if exists privado.historial_anotar();
drop function if exists privado.historial_intocable();
drop function if exists privado.historial_limpiar();
drop function if exists privado.historial_diferencias(jsonb, jsonb, boolean);
drop function if exists privado.historial_texto_limpio(text);

commit;
