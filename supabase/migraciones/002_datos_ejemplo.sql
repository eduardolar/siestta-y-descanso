begin;  -- todo o nada: si algo falla, no queda nada a medias

-- =====================================================================================
-- 002_datos_ejemplo.sql — Contenido inicial: el ejemplo de js/contenido.js (CONTENIDO_EJEMPLO, v3)
--
-- Ejecutar DESPUÉS de 001_esquema.sql. Se puede volver a ejecutar: no pisa nada que ya exista
-- (ON CONFLICT DO NOTHING), así que no deshace lo que la dueña haya cambiado en el panel.
-- Las fotos apuntan a las rutas actuales de la web (img/...); las nuevas irán al bucket «fotos».
-- Los productos van primero: el destacado de la portada (COL-01) tiene que existir.
-- Vuelta atrás: supabase/deshacer/002_deshacer_datos_ejemplo.sql
-- =====================================================================================

insert into public.productos
  (ref, nombre, categoria, precio, precio_antes, etiqueta, estado, fotos,
   descripcion, descripcion_larga, colores, a_medida, destacado, orden)
values
  ('SOF-01', 'Conjunto de sofás 3+2', 'sofas', 699, null, 'exposicion', 'disponible',
   '{}',
   'Sofá de tres plazas y otro de dos. Pieza de exposición: se vende tal cual la ves.',
   'Un sofá de tres plazas y otro de dos, de la exposición de la tienda. Se vende tal cual lo ves.',
   '', false, false, 1),

  ('COL-01', 'Colchón 150×190', 'colchones', 299, null, 'exposicion', 'disponible',
   array['img/colchon-detalle.jpg'],
   'Túmbate en él en la tienda antes de llevártelo. Con su almohada a juego.',
   'Colchón de 150×190 de la exposición, con su almohada a juego.',
   '', false, true, 2),

  ('SIL-01', 'Sillón de exposición', 'sillones', 99, null, 'exposicion', 'disponible',
   '{}',
   'Pieza de exposición con descuento. Cuando se acaba, se acaba.',
   '',
   '', false, false, 3),

  ('SOF-02', 'Sofá chaiselongue azul', 'sofas', null, null, '', 'disponible',
   array['img/sofa-chaiselongue.jpg'],
   'Chaiselongue con arcón. Te lo pedimos con tu medida, tela y color.',
   'Chaiselongue con arcón para guardar mantas y cojines.',
   'Varias telas y colores en tienda', true, true, 4),

  ('SOF-03', 'Sofá chaiselongue blanco', 'sofas', null, null, 'ultimas', 'reservado',
   array['img/tienda-sofa-blanco.jpg'],
   'El de la entrada de la tienda. Tela clara y asientos amplios.',
   '',
   'Varias telas y colores en tienda', true, true, 5),

  ('SIL-02', 'Sillón relax camel', 'sillones', null, null, '', 'disponible',
   array['img/sillon-relax.jpg'],
   'Respaldo alto y reposapiés, para sentarse y levantarse sin esfuerzo.',
   '',
   '', false, true, 6),

  ('CAM-01', 'Cama con canapé y cabecero', 'camas', null, null, '', 'disponible',
   array['img/colchon-cabecero.jpg', 'img/colchon-detalle.jpg'],
   'Canapé abatible de madera clara y cabecero tapizado con tachuelas.',
   'Canapé abatible de madera clara, con hueco para guardar, y cabecero tapizado con tachuelas.',
   '', false, false, 7)
on conflict (ref) do nothing;

insert into public.ajustes (id, datos)
values (1, $json$
{
  "tienda": {
    "telefono": "621 23 05 88",
    "whatsapp": "34621230588",
    "direccion": "Calle Herradores 65, esquina vía de servicio\n13700 Tomelloso (Ciudad Real)",
    "horario": [
      { "dias": "Lunes a viernes", "horas": "10:00–13:30 y 17:00–20:30" },
      { "dias": "Sábados", "horas": "10:00–13:30" }
    ],
    "aviso": { "activo": false, "texto": "En feria abrimos de 10:00 a 14:00" },
    "zonaEntrega": "Tomelloso y pueblos cercanos"
  },
  "portada": {
    "titular": "Siéntate. Túmbate.\nLuego decides.",
    "entradilla": "Pruébalo en la tienda y elige con nosotros medida, tela y color.",
    "destacado": "COL-01",
    "foto": "img/tienda-sofa-blanco.jpg"
  },
  "desde": "2003",
  "opiniones": {
    "nota": 4.4,
    "total": 28,
    "enlace": "https://www.google.com/maps/search/?api=1&query=Siestta%20y%20Descanso%20Tomelloso",
    "lista": [
      { "texto": "Super contentos con la compra que hemos hecho con ellos… super amables y muy profesionales.", "autor": "Brian L." },
      { "texto": "Buen trato, personal muy cercano y atento a escuchar nuestras necesidades… mejor calidad precio de todos los que habíamos visto.", "autor": "Rubén C." },
      { "texto": "Calidad-precio inmejorable. He buscado por toda la provincia y no he encontrado nada mejor.", "autor": "Sara Victoria M." }
    ]
  },
  "financiacion": { "activa": true, "texto": "" },
  "marcas": []
}
$json$::jsonb)
on conflict (id) do nothing;

commit;
