begin;  -- todo o nada

-- =====================================================================================
-- 006_opiniones_iniciales.sql — Las opiniones de Google se publican con el nombre y la inicial del
-- apellido: «Brian L.», «Rubén C.», «Sara Victoria M.».
-- Solo cambia el autor de las opiniones que SIGUEN con el nombre completo original (fila id = 1);
-- el resto de la lista y de los ajustes no se toca (ni el orden, ni opiniones añadidas o cambiadas
-- desde el panel). Si ya no queda ninguno de esos nombres, no hace nada. Se puede volver a ejecutar.
-- El disparador de ajustes revisa los datos y sella actualizado_en (un panel abierto lo recargará).
-- =====================================================================================

update public.ajustes a
   set datos = jsonb_set(a.datos, '{opiniones,lista}', (
         select coalesce(jsonb_agg(
                  case x.e ->> 'autor'
                    when 'Brian Lara'           then jsonb_set(x.e, '{autor}', '"Brian L."')
                    when 'Rubén Chamorro'       then jsonb_set(x.e, '{autor}', '"Rubén C."')
                    when 'Sara Victoria Moreno' then jsonb_set(x.e, '{autor}', '"Sara Victoria M."')
                    else x.e
                  end order by x.i), '[]'::jsonb)
           from jsonb_array_elements(a.datos -> 'opiniones' -> 'lista') with ordinality as x(e, i)))
 where a.id = 1
   and jsonb_typeof(a.datos -> 'opiniones' -> 'lista') = 'array'
   and exists (
         select 1
           from jsonb_array_elements(a.datos -> 'opiniones' -> 'lista') as y(e)
          where y.e ->> 'autor' in ('Brian Lara', 'Rubén Chamorro', 'Sara Victoria Moreno'));

-- Comprobación: los autores que quedan
select o ->> 'autor' as autor
  from public.ajustes, jsonb_array_elements(datos -> 'opiniones' -> 'lista') as o
 where id = 1;

commit;
