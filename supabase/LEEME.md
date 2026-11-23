# Base de datos en Supabase

La web lee de Supabase los productos, los ajustes (tienda, portada, opiniones…) y las fotos, y el
panel guarda ahí lo que cambia la dueña. Todos ven lo mismo, desde cualquier dispositivo.

```
supabase/
  migraciones/001_esquema.sql        tablas, reglas, permisos, RLS, bucket de fotos
  migraciones/002_datos_ejemplo.sql  los 7 productos y los ajustes del ejemplo actual
  migraciones/004_alta_editor.sql    plantilla para dar de alta a quien edita (pon el UID en el SQL Editor)
  migraciones/005_enlace_opiniones.sql  el enlace de opiniones, solo de Google Maps (dominio anclado)
  migraciones/006_opiniones_iniciales.sql  autores de las opiniones con la inicial del apellido
  deshacer/001_deshacer_esquema.sql  vuelta atrás de 001 (borra todo)
  deshacer/002_deshacer_datos_ejemplo.sql  vuelta atrás de 002 (solo antes de usar la web)
```

## 1. Pasos en el panel de Supabase (una sola vez)

1. **Crear el proyecto** en <https://supabase.com/dashboard> → *New project*. Región en Europa
   (p. ej. *West EU (Paris)* o *Central EU (Frankfurt)*). Guarda la contraseña de la base de datos en
   un sitio seguro: no va en la web.
2. **Ejecutar los SQL, en orden.** Menú *SQL Editor* → *New query* → pega **todo** el contenido de
   `migraciones/001_esquema.sql` → *Run*. Debe terminar en «Success. No rows returned».
   Después, en otra consulta nueva, lo mismo con `migraciones/002_datos_ejemplo.sql`.
   - Se pueden volver a ejecutar sin miedo: no duplican nada ni pisan lo que ya se haya cambiado.
   - Si el editor avisa de que la consulta contiene operaciones «destructivas» o pide confirmar,
     confirma: son los `revoke` y `drop policy if exists` del propio script.
3. **Comprobar el bucket de fotos.** Menú *Storage*: tiene que aparecer el bucket `fotos` marcado
   como *Public*. Si el paso 2 falló con un error que menciona `storage.buckets`, créalo a mano:
   *New bucket* → nombre `fotos` → activa *Public bucket* → *Restrict file upload size*: `600 KB`
   → *Allowed MIME types*: `image/jpeg, image/webp, image/png` → *Save*. Luego borra del script
   001 el bloque `insert into storage.buckets … ;` (sección 8) y vuelve a ejecutarlo.
4. **Desactivar el registro libre** (importante). *Authentication* → *Sign In / Providers*
   (en algunas versiones: *Authentication* → *Providers* / *Settings*):
   - desactiva **Allow new users to sign up**;
   - deja desactivado **Allow anonymous sign-ins**;
   - deja solo el proveedor *Email* (sin Google ni otros si no se usan).
   Aunque alguien consiguiera registrarse, no podría editar nada (no estaría en `editores`), pero así
   no se llena la lista de usuarios de desconocidos.
5. **Dirección del panel** (para el enlace de «¿Has olvidado la contraseña?»). *Authentication* →
   *URL Configuration*:
   - *Site URL*: `https://eduardolar.github.io/siestta-y-descanso/admin.html`
   - *Redirect URLs*: esa misma dirección, **y nada más** (ni `localhost` ni comodines `*`). Supabase solo
     manda de vuelta a direcciones de esta lista: así un enlace de recuperación no puede acabar en otra web.
6. **No publicar el esquema privado.** *Project Settings* → *Data API* → *Exposed schemas*: deja
   `public` (y `graphql_public` si viene). **No añadas `privado`.**
7. **Duración de la sesión** (recomendado, si el plan lo permite: en el gratuito puede no estar).
   *Authentication* → *Sessions*: pon un **tiempo máximo de inactividad** (*Inactivity timeout*, p. ej. 30
   días) y, si quieres, una duración máxima (*Time-box user sessions*). La sesión del panel se queda abierta
   en el móvil de la dueña (a propósito); con esto, una sesión olvidada en otro dispositivo caduca sola.

### Contraseña olvidada

En la pantalla de entrar del panel, «¿Has olvidado la contraseña?» pide el correo y Supabase envía un
enlace (el panel dice siempre «Si el correo existe, te llegará un enlace», exista o no, para no revelar
qué correos hay). El enlace abre `admin.html`; el panel lo detecta, borra los datos del enlace de la
barra de direcciones y pide la **contraseña nueva** dos veces (mínimo 8 caracteres); al guardarla, entra.
El enlace sirve una sola vez y caduca (1 hora por defecto). Si no llega: mirar «correo no deseado»; el
servidor de correo incluido en Supabase manda pocos correos por hora (para más, *Authentication* → *Emails*
→ *SMTP Settings* con un servidor propio). También se puede cambiar la contraseña a mano en
*Authentication* → *Users* → la cuenta → *Send password recovery* (o borrar y volver a crear el usuario).

## 2. Dar de alta a quien puede editar

Solo se hace desde el panel; la web no permite darse de alta.

1. *Authentication* → *Users* → *Add user* → *Create new user*: correo y contraseña, y marca
   **Auto Confirm User**. (Para que elija ella la contraseña: *Send invitation*.)
2. *SQL Editor* → nueva consulta (cambia el correo y el nombre):

   ```sql
   insert into public.editores (user_id, nombre)
   select id, 'Nombre de la persona' from auth.users where email = 'correo@ejemplo.com';
   ```

   Debe decir «1 row affected». Si dice 0, el correo no coincide con el del usuario creado.
   (También vale copiar el *User UID* de la lista de usuarios: `insert into public.editores
   (user_id, nombre) values ('uuid-copiado', 'Nombre');`.)
3. Ver quién puede editar:

   ```sql
   select e.nombre, u.email, e.creado_en
     from public.editores e join auth.users u on u.id = e.user_id;
   ```

**Quitar a alguien:** `delete from public.editores where user_id = (select id from auth.users where
email = 'correo@ejemplo.com');`. Deja de poder editar en la siguiente petición. Para que tampoco pueda
entrar, bórralo además en *Authentication* → *Users*.

## 3. Qué clave va en la web y cuál nunca

En *Project Settings* → *API Keys* (o el botón *Connect*):

| Va en la web (es pública, la ve cualquiera) | **Nunca** en la web, en GitHub ni en un correo |
| --- | --- |
| *Project URL* (`https://xxxx.supabase.co`) | *secret key* (`sb_secret_…`) o la antigua **`service_role`**: se salta todas las reglas |
| *Publishable key* (`sb_publishable_…`) o la antigua **`anon`** | contraseña de la base de datos y cadena de conexión |
| | *JWT secret* |

La clave pública solo deja hacer lo que permiten las reglas de este esquema: leer productos no
vendidos y ajustes. Para editar hace falta además entrar con un usuario que esté en `editores`.
Si alguna vez se filtra la clave secreta: *API Keys* → rotarla/revocarla en el momento.

## 4. Qué hay en la base de datos

- **`productos`**: una fila por producto (`ref` tipo `SOF-01`, no se puede cambiar). Las reglas de
  `js/contenido.js` están como restricciones: largos máximos (nombre 60, descripción 140, larga 1000,
  medidas 120, colores 160, plazo 60), categorías, etiquetas, estados y firmezas válidas, precio > 0
  o vacío («Consultar»), precio anterior solo si es mayor que el precio, de 0 a 4 fotos sin
  repetir, y como mucho 200 productos. Textos de una línea sin espacios dobles ni en los bordes,
  como los deja la web. El público no ve los vendidos; los editores, sí.
- **`ajustes`**: una sola fila (`id = 1`) con un JSON `datos`: `tienda`, `portada`, `opiniones`,
  `financiacion`, `marcas` y `desde` (lo mismo que en `contenido.js`, sin `productos`). Se revisan
  tipos, largos principales, el WhatsApp (`34` + 9 cifras), las rutas de fotos, tamaños de listas y
  32 KB como máximo.
- **`editores`**: quién puede editar. Cada editor solo puede leer su propia fila (así el panel sabe
  si es editor); nadie la cambia desde la web.
- **Portada sin producto fantasma**: si se vende o se borra el producto destacado en la portada, la
  portada se queda sin destacado automáticamente; y no se puede poner de destacado uno vendido o
  inexistente.

## 5. Para el desarrollo de la web (contrato con el frontend)

### Leer

```js
const sb = supabase.createClient(URL_PROYECTO, CLAVE_PUBLICA);
const { data: productos } = await sb.from('productos').select('*').order('orden').order('ref');
const { data: ajustes } = await sb.from('ajustes').select('datos, actualizado_en').eq('id', 1).single();
```

Nombres de columnas en la BD → en `contenido.js`: `ref`→`id`, `precio_antes`→`precioAntes`,
`descripcion_larga`→`descripcionLarga`, `a_medida`→`aMedida`; `orden` es la posición en la lista.

### Fotos

- En `productos.fotos` y `ajustes.datos.portada.foto` se guarda la **ruta**, no la URL:
  `img/...` (fotos que van con la web) o una ruta del bucket:
  `productos/{ref}/{uuid}.jpg` (de su propio producto) y `portada/{uuid}.jpg`. También valen `.webp`
  y `.png`. El uuid, en minúsculas (`crypto.randomUUID()`). Las fotos incrustadas `data:image/…` del
  prototipo **no** se aceptan: se suben al bucket.
- URL pública de una ruta del bucket: `URL_PROYECTO + '/storage/v1/object/public/fotos/' + ruta`
  (o `sb.storage.from('fotos').getPublicUrl(ruta)`).
- Subir: `sb.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl:
  '31536000', upsert: false })`. Máximo 600 KB (la foto de 900 px al 80 % que hace hoy el panel ocupa
  bastante menos). Como el nombre es un uuid nuevo cada vez, se puede guardar en caché un año.
- Orden seguro: **subir la foto y después** guardar la ruta en el producto; al quitarla, **primero**
  guardar el producto sin ella y **después** borrar el archivo. Al borrar un producto, borrar después
  sus archivos (`list('productos/REF')` y `remove([...])`). Supabase no deja borrar archivos por SQL.
  Si algo falla a medias queda como mucho un archivo huérfano, que no se ve en la web.

### Guardar sin pisar cambios de otro dispositivo (actualización condicional)

Cada fila trae `actualizado_en`, que la base de datos cambia en **cada** modificación (con precisión
de milisegundos, así que un `Date` de JavaScript lo conserva exacto, y siempre aumenta). Funciona como
un *If-Match*: se guarda **solo si nadie lo ha cambiado desde que lo leíste**, filtrando por el valor
que leíste:

```js
const { data, error } = await sb.from('productos')
  .update({ precio: 650 })                // solo los campos que cambian
  .eq('ref', 'SOF-01')
  .eq('actualizado_en', leido.actualizado_en)
  .select();                              // devuelve la fila nueva (con su nuevo actualizado_en)
if (error) { /* regla incumplida o sin permiso: error.message va en español */ }
else if (data.length === 0) { /* otro dispositivo lo cambió (o lo borró): recargar y avisar */ }
else { leido = data[0]; }
```

Con la API REST directa es lo mismo: `PATCH /rest/v1/productos?ref=eq.SOF-01&actualizado_en=eq.<valor>`
con la cabecera `Prefer: return=representation`; el valor **codificado** en la URL
(`encodeURIComponent`: el `+` de `+00:00` debe ir como `%2B`). Respuesta `[]` = conflicto.
Igual para borrar (`.delete().eq('ref', …).eq('actualizado_en', …).select()`).

Ajustes: igual con `.eq('id', 1).eq('actualizado_en', …)`. `datos` se guarda **entero**: ante un
conflicto, recargar, volver a aplicar solo los campos que tocó el usuario y reintentar (como hace hoy
el panel entre pestañas). Ojo: **vender o borrar el producto destacado cambia también los ajustes**
(la base de datos vacía `portada.destacado`), así que después de eso hay que recargar los ajustes.

Altas: si dos dispositivos crean a la vez la misma `ref`, el segundo recibe el error `23505`
(duplicado): calcular otra con `nuevoId()` y reintentar.

### Errores que puede devolver

| Código | Significa |
| --- | --- |
| `23514` | Incumple una regla (largo, categoría, foto, máximo de 200, destacado vendido…). El mensaje está en español. |
| `23505` | Ya existe un producto con esa `ref`. |
| `42501` | Sin permiso: no ha entrado o no está en `editores`. |
| respuesta `[]` en un update/delete condicional | Conflicto: otro dispositivo lo cambió antes. |

## 6. Copias y avisos

- **Copia de seguridad**: en el plan gratuito no hay copias que puedas restaurar tú. Lo mínimo:
  de vez en cuando, *Table Editor* → `productos` y `ajustes` → *Export to CSV*, y guardar las
  fotos importantes. Con acceso técnico: `pg_dump` con la cadena de conexión del botón *Connect*.
  El plan Pro incluye copias diarias.
- Los proyectos gratuitos se **pausan** tras una semana sin actividad; si la web dejara de cargar
  productos, entra en el panel y pulsa *Restore project*.
- Opcional: si no se usa GraphQL, *Database* → *Extensions* → desactivar `pg_graphql` (una puerta
  menos abierta; la web solo usa la API REST).
- Lo que se cree más adelante en `public` ya **no** queda abierto a la API por defecto (el script lo
  cambia): habrá que dar permisos y RLS a mano, tabla por tabla.

## 7. Vuelta atrás

- `deshacer/002_deshacer_datos_ejemplo.sql`: quita los productos de ejemplo no tocados y la fila de
  ajustes. Solo tiene sentido **antes** de empezar a usar la web.
- `deshacer/001_deshacer_esquema.sql`: **borra todo** (productos, ajustes, editores, reglas). Antes,
  exporta los datos. El bucket se vacía en *Storage* y luego se borra (por SQL no se puede vaciar).
