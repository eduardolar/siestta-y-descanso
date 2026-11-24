# Siestta y Descanso · página de presentación

Landing de una sola página para la tienda de sofás y colchones **Siestta y Descanso**
(Calle Herradores 65, Tomelloso), con un panel para que la tienda cambie productos, horario y textos.
HTML, CSS y JavaScript sin librerías ni cookies. Los datos y las fotos están en **Supabase** (base de
datos, inicio de sesión y almacén de fotos), al que se habla con `fetch` contra sus API REST.

## Verla en local

```bash
python -m http.server 8091 --bind 127.0.0.1
```

y abrir http://127.0.0.1:8091/ (lee los datos reales de Supabase; el panel, en http://127.0.0.1:8091/admin.html).

## Estructura

Arriba, una barra roja fina con la dirección, «abierto / cerrado» y «Cómo llegar» (y, encima, si hay una
**temporada** encendida —Navidad, Black Friday, Rebajas o Feria—, una banda fina con su color, su pictograma y su
texto). Después:
**portada** roja (titular, «Desde 2003», WhatsApp y una foto grande: la del **producto destacado**, con una
tarjeta de nombre y precio que abre su ficha, o, si no hay destacado, solo la de la tienda),
**ventajas** (pruébalo en tienda, a tu medida, entrega con su zona —«Entrega en Tomelloso y pueblos
cercanos», o «consulta zona» si se deja vacía—, financiación). Justo tras la portada, si están encendidos: el
**anuncio** (sorteo, evento… con pastilla, título, texto, foto, botón a Instagram/Facebook/TikTok/WhatsApp en
pestaña nueva, «Hasta el 6 de enero» y «Bases del sorteo»; con el color de la temporada o, si no hay, el rojo) y
la **sección de la temporada** («Ofertas de Navidad», «Black Friday», «Rebajas», «Ofertas de feria» o el texto
propio si es corto) con los productos marcados «En la temporada» en el mismo carrusel que «Ahora en tienda» (y
un enlace en el menú); la tarjeta de la portada lleva un sello discreto de la temporada. Con fecha «Hasta», al
día siguiente (hora de Madrid) desaparecen solos. Sin JavaScript no salen. Después, **banda de exposición** a todo el ancho
(titular, «Pocas unidades» debajo y «Ver ofertas»), **«Ahora en tienda»** (filtros —Todo, Sofás, Sillones, Colchones, Camas, Accesorios, Otros y Ofertas— y un **carrusel**: una sola
fila deslizable con *scroll-snap* con todos los productos del filtro —se ven ~3 en escritorio, ~2 en tableta y
~1,3 en el móvil, para que asome el siguiente—, flechas ‹ › de 48 px en escritorio que desaparecen en los
extremos, «1–3 de 7» debajo y, para lectores de pantalla, «7 productos»; sin autoplay y, con «reducir
movimiento», sin animación; al cambiar de filtro vuelve al principio; con el teclado, la tarjeta enfocada se
pone a la vista; toda la tarjeta abre la ficha, con «›» junto al nombre, pero un arrastre no la abre. Debajo,
la franja para mayores y familias), **banda «Un colchón online no se prueba. Este sí.»** (titular en una línea y los 4
pasos en una fila: número, pictograma y texto), **opiniones de Google** (y las marcas, si las hay), y el **pie** con el contacto, el horario y las redes (el menú «Visítanos» lleva a él).
Lo que el panel deja vacío no se enseña. Textos mínimos: sin antetítulos ni frases que
repitan el título. En las tarjetas y en la ficha solo hay dos acciones: «Reservar» (o «Avisadme si queda
libre») y «Preguntar».

### Ficha de producto

Tocar una tarjeta (menos sus botones) o la tarjeta de la portada abre su **ficha** (`<dialog>`): a
pantalla completa en el móvil y, en escritorio y tableta, centrada, en dos columnas y del alto de su contenido
(como mucho el de la ventana; si no cabe, la columna de la derecha hace scroll por dentro). Lleva galería de
hasta 4 fotos (deslizable, con miniaturas, «2/4» y, en escritorio, flechas), etiqueta, nombre (hasta 3
líneas), precio, sello «Reservado» si lo está, descripción larga, los detalles que haya (Medidas, Telas,
Firmeza —solo colchones—, A medida, Plazo) y «Más {categoría}» (hasta 3 productos; si no hay bastantes, se
completa con otros y pasa a «Más»; en «Otros», «Más productos»). Abajo, siempre a la vista, la barra de acciones: «Reservar» (o «Avisadme si
queda libre»), «Preguntar» y un icono para compartir. Se cierra con la X, Esc, tocando fuera o con «atrás».

Cada ficha tiene **enlace propio**: `index.html#p/SOF-02` (vale en minúsculas). Al abrirla desde la web se
añade al historial y «atrás» la cierra; si se carga (o se recarga) la página con ese enlace, se abre sin añadir
entradas. Si la referencia no existe o está vendida, no se abre y se limpia el enlace. «Compartir» usa el menú
del sistema o, si no hay, copia el enlace («Enlace copiado»).

Diseño «tienda de oferta», con los colores de su logo y de sus carteles de redes: fondo blanco/gris claro
para que luzcan las fotos, rojo Siestta en barras, portada, bandas y botones, y amarillo solo en las
etiquetas de precio y de exposición. Titulares y precios en Inter Display (800–900) y texto en Inter,
servidas desde `fonts/` (licencia OFL al lado, sin CDNs), con `font-display: swap` y precarga. Fotos a sangre
en las tarjetas, sin marcos ni giros; como son pequeñas, no se muestran a más de ~1,4× su tamaño. Verde solo
en los botones de WhatsApp. El producto destacado de la portada lo elige el panel (en el ejemplo, el
colchón de 299 €, para que la foto y el precio sean del mismo producto).

- `index.html`: la página (con los datos de la tienda en `application/ld+json` para Google).
  Lleva escritos los valores por defecto (textos, horario y productos de ejemplo), así se ve bien
  sin JavaScript y para los buscadores; el JavaScript los sustituye por lo que hay en la base de datos.
- `admin.html`: el panel de la tienda, con correo y contraseña (ver «Cómo usar el panel»). No hay enlace
  visible desde la web.
- `css/estilos.css`: estilos de la web (60 % blanco, 30 % rojo Siestta, 10 % amarillo en precios y ofertas).
- `css/admin.css`: estilos del panel, pensados primero para el móvil.
- `js/config.js`: la dirección del proyecto de Supabase y su clave **publishable** (`sb_publishable_…`).
  Son públicas por diseño: solo dejan leer lo que permiten las reglas de la base de datos (productos no
  vendidos y ajustes). **Nunca** pongas aquí la clave secreta (`sb_secret_…` / `service_role`).
- `js/datos.js`: la conexión con Supabase por `fetch` (sin supabase-js): `/rest/v1` (productos, ajustes,
  editores), `/auth/v1` (entrar, renovar la sesión, salir) y `/storage/v1` (fotos del bucket `fotos`).
  Pasa las filas de la base de datos (`ref`, `precio_antes`, `descripcion_larga`, `a_medida`…) al mismo
  objeto de siempre (`id`, `precioAntes`, `descripcionLarga`, `aMedida`…) y por la normalización de
  `contenido.js`. Cada petición tiene un tiempo máximo (8 s, `espera` en `config.js`).
- `js/contenido.js`: el modelo, el ejemplo (`CONTENIDO_EJEMPLO`), la revisión de todo lo que llega
  (`normalizar`) y la **caché** de este navegador: `cargarContenido()` / `guardarContenido()` guardan en
  `localStorage` (clave `siestta-contenido-v1`) el último contenido bueno que llegó del servidor; el campo
  `version` permite migrar si cambia el formato (versión 2: llegan opiniones, financiación, marcas y «desde»; los datos
  de la versión 1 se completan con los del ejemplo. Versión 3: cada producto pasa de `foto` a `fotos` —hasta
  4, la primera es la principal; úsese `Contenido.fotoPrincipal(p)`— y llegan `descripcionLarga`, `medidas`,
  `colores`, `firmeza`, `aMedida` y `plazo`, vacíos al migrar; la tienda gana `zonaEntrega` y la portada
  `destacado` y `foto`). Todo lo que se lee se revisa (textos, precios, fotos solo `img/…` o rutas del
  bucket —`productos/{ref}/{uuid}.jpg` de su propio producto y `portada/{uuid}.jpg`—, WhatsApp `34` + 9
  cifras; el destacado solo vale si el producto se ve en la web). Las fotos incrustadas (`data:`) ya no valen.
  `Contenido.urlFoto(ruta)` da la dirección de una foto: las de `img/` son relativas y las del bucket, su URL
  pública (`…/storage/v1/object/public/fotos/{ruta}`).
- `js/escaparate.js`: «Ahora en tienda» (tarjetas, filtros, sello «Reservado», botón «Reservar» por WhatsApp
  con el mensaje ya escrito, el carrusel y la tira de exposición, que
  solo sale si hay piezas de exposición a la venta y cuyo botón activa el filtro «Ofertas») y la foto y la
  tarjeta del producto destacado de la portada.
- `js/ficha.js`: la ficha de producto y su enlace `#p/{ref}`.
- `js/main.js`: aviso, titular, contacto, horario y el «Abierto ahora / abrimos el lunes a las…» con la hora
  de Madrid. También pone el teléfono del panel en los datos para Google (`application/ld+json`); el resto de
  esos datos (dirección, horario) sigue fijo en el HTML: si cambian, hay que tocarlos a mano. Y el acceso
  escondido al panel (5 toques en el logo).
- `js/admin.js`: el panel (entrada, guardado por producto y por campo, fotos al bucket, conflictos).
- `supabase/`: el esquema de la base de datos, los datos de ejemplo y cómo dar de alta a quien edita
  (`supabase/LEEME.md`).
- `fonts/`: Inter e Inter Display (variables), en woff2 con solo los caracteres del español, y su licencia OFL.
- `img/`: el logo y las fotos de la tienda (sacadas de sus vídeos de TikTok y de Instagram).

`js/tema.js` (sin `defer`, en el `<head>` de la web): pone la «piel» de la temporada (`skin tema--…` en `<html>`)
leyendo la caché antes de pintar, para que no parpadee; `js/escaparate.js` la corrige con lo del servidor.

Al cambiar CSS o JS, sube el `?v=` de todos los enlaces y las constantes de versión de `js/admin.js` y
`js/escaparate.js` (ahora `20261123-34`).

Opiniones de Google: se publican con el nombre y la inicial del apellido («Brian L.»).

## Cómo funcionan los datos

- **La web** pinta primero lo que trae el HTML (sin JavaScript y para los buscadores), enseguida lo de la
  caché de ese navegador (el último contenido bueno, para que cargue al instante) y, en cuanto llega, lo
  del servidor (que guarda en la caché). Si el servidor no contesta en 8 s o falla, se queda con la caché o
  con el ejemplo, sin enseñar ningún error. Un enlace `#p/{ref}` de un producto que aún no está en la caché
  espera a lo del servidor antes de darse por malo. Al volver a la pestaña (pasado un minuto) y al volver
  la conexión se vuelve a pedir. El público solo recibe los productos no vendidos. Si la caché está
  estropeada (no se puede leer o algún producto no es válido), se descarta y se usa el ejemplo. Si una foto
  no carga (p. ej. se borró del bucket), sale el cartel de «sin foto» (en la portada, la foto de la tienda).
- **El panel** guarda **por producto y por campo** (`PATCH` solo de lo cambiado; `POST` para dar de alta y
  `DELETE` para borrar) y los ajustes (tienda, portada, opiniones…) en la fila única de `ajustes`. Cada
  guardado es condicional (`actualizado_en`): si otra persona lo ha cambiado desde que se leyó, no se pisa
  nada, se recarga ese producto o los ajustes y se avisa «Lo ha cambiado otra persona; se ha recargado» (el
  campo que se estaba escribiendo se respeta y se guarda al seguir escribiendo). En los ajustes, como cada
  cambio es de un campo, se recargan y se vuelve a guardar solo ese campo encima, avisando. Los guardados van de uno en
  uno. Al vender o borrar el destacado de la portada (la base de datos lo quita sola), se recargan los
  ajustes. Los errores de la base de datos se traducen a mensajes claros (reglas incumplidas, sin permiso,
  sesión caducada, sin conexión).
- **Fotos**: se reducen a 900 px en JPEG al 80 % (si pasan de ~590 KB se baja la calidad; el bucket admite
  600 KB) y se suben al bucket `fotos` en `productos/{ref}/{uuid}.jpg` (o `portada/{uuid}.jpg`); en la base
  de datos se guarda la **ruta**, no la URL. Al quitar una foto se guarda primero el producto sin ella y el
  archivo se borra del bucket pasados unos segundos (por si se pulsa «Deshacer»); al borrar un producto, sus
  fotos; al cambiar la foto de la tienda, la anterior. Si un borrado del bucket falla, no bloquea nada (como
  mucho queda un archivo que no se ve). En un producto nuevo las fotos se suben con su ref; si al añadirlo
  la ref cambia (otra categoría, u otra persona cogió esa ref a la vez), se vuelven a subir con la buena.
- **Refs nuevas**: la siguiente libre de su categoría (`SOF-04`…; los accesorios `ACC-01`… y los otros `OTR-01`…, que necesitan la migración
  `007_categorias_accesorios_otros.sql`: hasta ejecutarla, el panel avisa al guardarlos y no se guardan), contando también las vendidas; si otra
  persona la crea justo a la vez, se prueba con la siguiente.
- **Dos pestañas o dos dispositivos**: cada pestaña avisa a las demás de este navegador por la caché
  (evento `storage`); el panel, además, recarga del servidor cada minuto y al volver a la pestaña todo lo que
  no se esté editando (la ficha abierta y el campo que se escribe no se tocan), y también al volver la conexión.

## Cómo usar el panel

Se entra de dos formas: con la dirección directa `admin.html` (p. ej.
`https://eduardolar.github.io/siestta-y-descanso/admin.html`) o, desde la web, **tocando 5 veces seguidas el
logo de la cabecera** (en menos de 3 s entre el primer toque y el quinto). No hay ninguna pista visible. Los
toques 1 a 4 hacen lo de siempre (subir arriba); vale con el dedo, el ratón o Enter sobre el logo (cada Enter
cuenta como un toque); un doble clic no basta.

El panel pide **correo y contraseña** de una cuenta dada de alta en Supabase y en la tabla `editores` (cómo
darla de alta: `supabase/LEEME.md`, apartado 2; no hay registro libre). Si la cuenta no está en `editores`:
«Esta cuenta no tiene permiso para editar». La sesión se queda abierta en ese móvil o navegador (se renueva
sola antes de caducar y al volver a la pestaña); si aun así caduca, el panel vuelve a pedir la contraseña sin
perder lo que se estaba escribiendo, y lo guarda al entrar. Abajo del todo, «Has entrado como …» y
**«Cerrar sesión»** (cierra solo la de ese dispositivo). Antes de cerrarla guarda lo que quedara a medio
guardar; si algo no se puede guardar, lo avisa y no la cierra.

**¿Has olvidado la contraseña?**, en la pantalla de entrar: se escribe el correo y llega un enlace (el panel
dice siempre «Si el correo existe, te llegará un enlace»). El enlace abre el panel, que pide la contraseña
nueva dos veces (mínimo 8 caracteres) y entra. Lo que hay que configurar en Supabase para que funcione:
`supabase/LEEME.md` (paso 5 y «Contraseña olvidada»).

Todo se guarda solo: arriba sale «Guardado ✓» y
abajo aparece un aviso flotante con lo que se ha hecho («Reservado: …», «Añadido a la web», «Guardado»): los
informativos se van solos a los 3 s y no tapan los toques; los que llevan «Deshacer» duran 5 s; los de error
se quedan hasta «Cerrar». Los errores salen junto al campo que hay que corregir.

- **Productos**: «+ Añadir producto» abre una ficha: hasta 4 fotos (tocar el cuadrado hace una foto; «Elegir
  de la galería» coge una o varias; la primera es la principal; las demás tienen «Hacer principal» y cada una
  una papelera, con «Foto quitada · Deshacer»), nombre, qué es (sofá, sillón, colchón, cama, accesorio —almohadas, edredones, nórdicos, protectores,
  sábanas…— u otro —lo que no encaje: una mesita, una lámpara…—), precio (vacío o 0 = «Consultar»), «Poner precio
  rebajado», «Primero en la lista», «Grande en la portada» (necesita foto), «En la temporada» (con la nota «Sale
  cuando actives una temporada» si no hay ninguna; en la lista lleva «En la temporada»), etiqueta en la foto (Exposición,
  Oferta, Últimas unidades) y una descripción corta. En «Más detalles (opcional)», plegado para que el alta siga siendo rápida: descripción larga (hasta
  1000), medidas, telas y colores, firmeza (solo si es un colchón), «Se puede pedir a medida» y plazo
  orientativo. Al lado (abajo en el móvil) se ve la tarjeta y, si ya está guardado, «Ver la ficha en la web».
  Si no tiene foto, pregunta antes de añadirlo; si se cierra una ficha nueva con datos, pregunta «¿Descartar
  este producto?».
  En la lista: «Marcar reservado» / «Quitar reserva», «Marcar vendido» (deja de verse en la web, con
  «Deshacer» unos segundos; se recupera en «Vendidos») y «Editar». «Borrar este producto» está dentro de
  la ficha, con confirmación. Como mucho 200 productos.
- **Horario y avisos**: el texto del aviso (con botones rápidos «Cerrado por vacaciones», «Cerrado por
  feria», «Hoy cerramos antes») y el botón «Poner el aviso en la web» / «Quitar el aviso». El horario:
  días y horas de cada horario (con o sin cierre a mediodía) o «Cerrado esos días».
- **Portada**: el producto destacado (los que están en la web con foto; los que no tienen foto salen al final,
  atenuados, y no se pueden elegir; o «Ninguno: solo la foto de la tienda»), la
  foto de la tienda (hacer o elegir; se reduce como las demás), el titular (hasta 3 líneas; la última sale en
  amarillo), la frase de debajo y la vista previa. Si se vende o se borra el destacado, la portada se queda
  sin destacado y el panel lo avisa («Deshacer» lo devuelve). **Temporada**: Ninguna · Navidad · Black Friday ·
  Rebajas · Feria, texto de la banda (opcional; vacío = el de la temporada), fecha «Hasta» (opcional), vista previa
  y «N productos en la temporada». **Anuncio**: «Enseñarlo en la web» (necesita título), Sorteo · Evento · Anuncio
  («Un sorteo necesita bases legales.»), título (60), texto (220), foto (se guarda en `portada/` del bucket, como
  la de la tienda), botón (texto y enlace: solo Instagram, Facebook, TikTok o WhatsApp), «Hasta» y enlace a las
  bases (lo mismo o eduardolar.github.io), con vista previa. Necesitan la migración `008_temporada.sql`: hasta
  ejecutarla, el panel avisa al guardarlos y lo demás se sigue guardando.
- **Confianza**: nota y número de opiniones de Google, hasta 6 opiniones (texto y nombre), financiación
  (casilla y condiciones opcionales; no pongas condiciones que no sean seguras), marcas (hasta 12) y el año
  «Desde». Lo que se deja vacío desaparece de la web.
- **Contacto**: teléfono, móvil de WhatsApp (vale «621 23 05 88», con +34, 0034, espacios o guiones: se
  guarda como 34621230588), dirección (hasta 3 líneas) y zona de entrega (opcional, hasta 80: sale como
  «Entrega en …»; vacía, «Entrega a domicilio · consulta zona»).

No hay «Restaurar ejemplo»: el panel trabaja con los datos reales y nada en él borra todo de golpe.
Las fotos se reducen y se suben al momento (ver «Cómo funcionan los datos»); si una no se puede subir (sin
conexión, demasiado grande), el panel lo dice y no la añade. Copias de seguridad: `supabase/LEEME.md`, apartado 6.

## Publicar en GitHub Pages

Todas las rutas son relativas y no hay nada que compilar: basta con subir la carpeta a un repositorio y,
en *Settings → Pages*, servir la rama principal desde la raíz. Pesa unos 600 KB.

`admin.html` también está publicada, pero sin una cuenta de `editores` no deja ver ni cambiar nada: las
reglas de la base de datos (RLS) solo dejan escribir a los editores, aunque alguien use la clave pública
de `config.js` por su cuenta.

## Seguridad

- **Política de contenido (CSP)** en `index.html` y `admin.html` (`<meta http-equiv="Content-Security-Policy">`):
  solo scripts, estilos y fuentes de la propia web; conexiones solo a Supabase; imágenes de la web, de
  Supabase y `blob:`/`data:` (vistas previas del panel). Por eso no hay ningún `<script>` ni `style=""` dentro
  del HTML (salvo los datos para Google en `application/ld+json`, que no se ejecutan): todo va en `js/` y `css/`.
  Si cambia el proyecto de Supabase, hay que cambiar su dirección también en esas dos etiquetas.
- **Nada de marcos de otras webs** (*clickjacking*): `js/marco.js` saca la página de cualquier `<iframe>`. En
  el panel, `css/marco.css` la oculta hasta comprobarlo; en la web no se oculta (sin JavaScript se sigue viendo).
  GitHub Pages no deja poner la cabecera `frame-ancestors`; con dominio propio y un proxy, mejor ponerla.
- **Sesión del panel en `localStorage`**: se queda abierta en el móvil de la dueña, como quiere. El riesgo:
  `localStorage` es de todo el *origen*, y en GitHub Pages el origen es `https://eduardolar.github.io`,
  compartido con cualquier otra web publicada en esa misma cuenta (`eduardolar.github.io/otra-web/`): si una
  de ellas tuviera un fallo que permitiera ejecutar código, podría leer la sesión. Mientras tanto: no
  publicar en esa cuenta webs de terceros ni con código sin revisar. **Se resuelve con un dominio propio**
  (p. ej. `siesttaydescanso.es`), que es un origen solo para esta web. Además, en Supabase conviene acortar
  la sesión por inactividad (`supabase/LEEME.md`, paso 7).
- Los tokens nunca van en la dirección (al volver del correo de «contraseña olvidada» se borran en el
  acto) ni en la consola; todo lo que se pinta va con `textContent`.

## De dónde salen los datos

De sus perfiles públicos de Facebook, Instagram y TikTok y de su ficha de Google:
dirección, teléfono/WhatsApp, qué venden y servicios (entrega a domicilio, entrada accesible,
pago con tarjeta o móvil). La nota (4,4 con 28 opiniones) y las tres opiniones son reseñas públicas de su
ficha de Google (noviembre de 2026). «Desde 2003» es la fecha de constitución de Siestta y Descanso, S.L.

## Qué hay que confirmar con la tienda

- **Horario del sábado** (10:00–13:30): es una suposición; no aparece en sus redes ni en Google.
  El de lunes a viernes sí sale en su ficha.
- **Fotos**: son capturas de las portadas de sus vídeos, con poca resolución. Para publicarla de
  verdad, mejor fotos originales de la tienda. La de colchones y la de camas son la misma cama.
- **Correo**: no se pone a propósito (evita spam); se contacta por WhatsApp y teléfono.
- **Productos de ejemplo**: los precios 699 € (sofás 3+2), 299 € (colchón 150×190) y 99 € (sillón de
  exposición) son los publicados en sus redes; el resto va como «Consultar». Los que no tienen foto
  propia salen con un cartel con dibujo. Hay que cambiarlos por los reales desde el panel.
