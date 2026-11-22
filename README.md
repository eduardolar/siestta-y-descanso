# Siestta y Descanso · página de presentación

Landing de una sola página para la tienda de sofás y colchones **Siestta y Descanso**
(Calle Herradores 65, Tomelloso). HTML, CSS y un poco de JavaScript, sin dependencias
ni cookies.

## Verla en local

```bash
python -m http.server 8091 --bind 127.0.0.1
```

y abrir http://127.0.0.1:8091/

## Estructura

Arriba, una barra roja fina con la dirección, «abierto / cerrado» y «Cómo llegar». Después:
**portada** roja (titular, «Desde 2003», WhatsApp y «Pide cita para probar», la foto de la tienda con la
oferta destacada encima), **ventajas** (pruébalo en tienda, a tu medida, entrega, financiación), **banda de
exposición** a todo el ancho, **escaparate** (filtros, 3 productos en escritorio y 4 en el móvil con «Ver
los N productos», y una franja para mayores y familias), **banda «Un colchón online no se prueba. Este
sí.»** con los 4 pasos de «A tu medida», **opiniones de Google** (y las marcas, si las hay), **Visítanos**
y el **pie** con redes y «Acceso tienda». Lo que el panel deja vacío no se enseña.

Diseño «tienda de oferta», con los colores de su logo y de sus carteles de redes: fondo blanco/gris claro
para que luzcan las fotos, rojo Siestta en barras, portada, bandas y botones, y amarillo solo en las
etiquetas de precio y de exposición. Titulares y precios en Inter Display (800–900) y texto en Inter,
servidas desde `fonts/` (licencia OFL al lado, sin CDNs), con `font-display: swap` y precarga. Fotos a sangre
en las tarjetas, sin marcos ni giros; como son pequeñas, no se muestran a más de ~1,4× su tamaño. Verde solo
en los botones de WhatsApp. La oferta de la portada es la primera pieza de exposición con precio, en el
orden del panel; si no hay ninguna, no sale.

- `index.html`: la página (con los datos de la tienda en `application/ld+json` para Google).
  Lleva escritos los valores por defecto (textos, horario y productos de ejemplo), así se ve bien
  sin JavaScript y para los buscadores; el JavaScript los sustituye por lo guardado en el panel.
- `admin.html`: el panel de la tienda (enlace discreto «Acceso tienda» en el pie). Sin contraseña: es un prototipo.
- `css/estilos.css`: estilos de la web (60 % blanco, 30 % rojo Siestta, 10 % amarillo en precios y ofertas).
- `css/admin.css`: estilos del panel, pensados primero para el móvil.
- `js/contenido.js`: los datos (`CONTENIDO_EJEMPLO`), y `cargarContenido()`, `guardarContenido()` y
  `restaurarEjemplo()`. Guarda en `localStorage` con la clave `siestta-contenido-v1`; el campo `version`
  permite migrar si cambia el formato (versión 2: llegan opiniones, financiación, marcas y «desde»; los datos
  de la versión 1 se completan con los del ejemplo). Todo lo que se lee se revisa (textos, precios, fotos solo `img/…`
  o JPEG/PNG/WebP incrustadas, WhatsApp `34` + 9 cifras).
- `js/escaparate.js`: el escaparate (tarjetas, filtros, sello «Reservado», botón «Reservar» por WhatsApp
  con el mensaje ya escrito, «Ver los N productos», la tarjeta para mayores y la tira de exposición, que
  solo sale si hay piezas de exposición a la venta y cuyo botón activa el filtro «Ofertas»).
- `js/main.js`: aviso, titular, contacto, horario y el «Abierto ahora / abrimos el lunes a las…» con la hora
  de Madrid. También pone el teléfono del panel en los datos para Google (`application/ld+json`); el resto de
  esos datos (dirección, horario) sigue fijo en el HTML: si cambian, hay que tocarlos a mano.
- `js/admin.js`: el panel.
- `fonts/`: Inter e Inter Display (variables), en woff2 con solo los caracteres del español, y su licencia OFL.
- `img/`: el logo y las fotos de la tienda (sacadas de sus vídeos de TikTok y de Instagram).

Al cambiar CSS o JS, sube el `?v=` de todos los enlaces y las constantes de versión de `js/admin.js` y
`js/escaparate.js`.

## Cómo usar el panel

Abre `admin.html` (o «Acceso tienda» al pie de la web). Todo se guarda solo: arriba sale «Guardado ✓» y
abajo aparece un aviso flotante con lo que se ha hecho («Reservado: …», «Añadido a la web», «Guardado»).
Los errores salen junto al campo que hay que corregir.

- **Productos**: «+ Añadir producto» abre una ficha: foto (tocar el cuadrado hace una foto; «Elegir de la
  galería» coge una ya hecha), nombre, qué es, precio (vacío o 0 = «Consultar»), «Poner precio rebajado»,
  etiqueta en la foto (Exposición, Oferta, Últimas unidades), «Mostrarlo el primero en la web» y una
  descripción corta. Al lado (abajo en el móvil) se ve cómo quedará. Si no tiene foto, pregunta antes de
  añadirlo; si se cierra una ficha nueva con datos, pregunta «¿Descartar este producto?».
  En la lista: «Marcar reservado» / «Quitar reserva», «Marcar vendido» (deja de verse en la web, con
  «Deshacer» unos segundos; se recupera en «Vendidos») y «Editar». «Borrar este producto» está dentro de
  la ficha, con confirmación. Como mucho 200 productos.
- **Horario y avisos**: el texto del aviso (con botones rápidos «Cerrado por vacaciones», «Cerrado por
  feria», «Hoy cerramos antes») y el botón «Poner el aviso en la web» / «Quitar el aviso». El horario:
  días y horas de cada horario (con o sin cierre a mediodía) o «Cerrado esos días».
- **Textos de la portada**: el titular (hasta 3 líneas; la última sale en rojo) y la frase de debajo.
- **Confianza**: nota y número de opiniones de Google, hasta 6 opiniones (texto y nombre), financiación
  (casilla y condiciones opcionales; no pongas condiciones que no sean seguras), marcas (hasta 12) y el año
  «Desde». Lo que se deja vacío desaparece de la web.
- **Contacto**: teléfono, móvil de WhatsApp (vale «621 23 05 88», con +34, 0034, espacios o guiones: se
  guarda como 34621230588) y dirección (hasta 3 líneas).
- **Restaurar ejemplo**, al final: vuelve a los datos de ejemplo.

Las fotos se reducen a 900 px de lado en JPEG antes de guardarlas. Si el panel está abierto en dos
pestañas, cada una guarda solo lo que cambia (un producto o un campo) sobre lo último guardado, y la otra
se actualiza sola sin tocar lo que se está escribiendo.

## Límite importante: se guarda solo en ese navegador

Los cambios del panel viven en el `localStorage` del navegador donde se hacen. **Los clientes no los ven**:
ven el contenido de ejemplo que va en los archivos. Además caben unos 5 MB (unas 25-40 fotos); si se
llena, el panel avisa: «No cabe más: borra productos vendidos o usa fotos más pequeñas».

Para la versión real hace falta guardar el contenido en un **servicio común** que lean todos:
un pequeño servidor o servicio de datos (por ejemplo una API con base de datos, o un CMS sencillo) con
`GET` del contenido para la web y `PUT` protegido por usuario y contraseña para el panel, y las fotos
en un almacenamiento de archivos. `js/contenido.js` ya concentra la lectura y el guardado: bastaría con
cambiar `cargarContenido()` y `guardarContenido()` por llamadas a ese servicio. También habría que poner
acceso con contraseña al panel y una copia de seguridad.

## Publicar en GitHub Pages

Todas las rutas son relativas y no hay nada que compilar: basta con subir la carpeta a un repositorio y,
en *Settings → Pages*, servir la rama principal desde la raíz. Pesa unos 600 KB.

Ojo: al estar publicada, `admin.html` también es accesible por cualquiera (sin contraseña), pero lo que se
cambie ahí solo se guarda en el navegador de quien lo cambia: no altera lo que ven los demás.

## De dónde salen los datos

De sus perfiles públicos de Facebook, Instagram y TikTok y de su ficha de Google:
dirección, teléfono/WhatsApp, qué venden y servicios (entrega a domicilio, entrada accesible,
pago con tarjeta o móvil). La nota (4,4 con 28 opiniones) y las tres opiniones son reseñas públicas de su
ficha de Google (noviembre de 2026). «Desde 2003» es la fecha de constitución de Siestta y Descanso, S.L.

## Es un prototipo: qué hay que confirmar con la tienda

- **Horario del sábado** (10:00–13:30): es una suposición; no aparece en sus redes ni en Google.
  El de lunes a viernes sí sale en su ficha.
- **Fotos**: son capturas de las portadas de sus vídeos, con poca resolución. Para publicarla de
  verdad, mejor fotos originales de la tienda. La de colchones y la de camas son la misma cama.
- **Correo**: no se pone a propósito (evita spam); se contacta por WhatsApp y teléfono.
- **Productos de ejemplo**: los precios 699 € (sofás 3+2), 299 € (colchón 150×190) y 99 € (sillón de
  exposición) son los publicados en sus redes; el resto va como «Consultar». Los que no tienen foto
  propia salen con un cartel con dibujo. Hay que cambiarlos por los reales desde el panel.
