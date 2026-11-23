begin;  -- todo o nada

-- =====================================================================================
-- 007_categorias_accesorios_otros.sql — Dos categorías nuevas de productos:
--   · «accesorios» (almohadas, edredones, nórdicos, protectores, sábanas…), referencias ACC-01…
--   · «otros» (lo que no encaja en ninguna: una mesita, una lámpara, un mueble…), referencias OTR-01…
-- Solo cambia la regla productos_categoria. Nada más depende de la lista de categorías: la
-- referencia ya admite cualquier prefijo de 3 letras (^[A-Z]{3}-[0-9]{2,4}$), igual que las rutas
-- de las fotos (productos/{ref}/…), el destacado de la portada y las políticas del bucket.
-- No toca ningún producto. Se puede volver a ejecutar.
-- Hasta que se ejecute, la web sigue funcionando y el panel avisa al guardar uno de estos.
-- =====================================================================================

alter table public.productos drop constraint if exists productos_categoria;
alter table public.productos add constraint productos_categoria
  check (categoria in ('sofas', 'sillones', 'colchones', 'camas', 'accesorios', 'otros'));

-- Comprobación: la regla nueva (tiene que salir con 'accesorios' y 'otros')
select conname as regla, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.productos'::regclass
   and conname = 'productos_categoria';

commit;
