-- =====================================================================================
-- Deshace 002_datos_ejemplo.sql: quita los 7 productos de ejemplo y la fila de ajustes.
-- Pensado para ANTES de empezar a usar la web: después borraría contenido real de la dueña
-- (por eso solo quita los productos de ejemplo que nadie ha tocado).
-- =====================================================================================

begin;

-- «Sin tocar»: su última modificación es la del alta (menos de 1 segundo después).
delete from public.productos
 where ref in ('SOF-01', 'COL-01', 'SIL-01', 'SOF-02', 'SOF-03', 'SIL-02', 'CAM-01')
   and actualizado_en - creado_en < interval '1 second';

delete from public.ajustes where id = 1;

commit;
