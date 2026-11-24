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
  migraciones/007_categorias_accesorios_otros.sql  categorías «Accesorios» (ACC-01…) y «Otros» (OTR-01…)
  migraciones/008_temporada.sql      temporada (banda y sección), anuncio (sorteos, eventos) y productos.en_temporada
  migraciones/009_historial.sql      historial de cambios de productos y ajustes (90 días, solo lo leen los editores)
  deshacer/001_deshacer_esquema.sql  vuelta atrás de 001 (borra todo)
  deshacer/002_deshacer_datos_ejemplo.sql  vuelta atrás de 002 (solo antes de usar la web)
  deshacer/009_deshacer_historial.sql      vuelta atrás de 009 (borra el historial)
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
  medidas 120, colores 160, plazo 60), categorías (sofás, sillones, colchones, camas, accesorios y
  otros; las dos últimas llegan con la 007), etiquetas, estados y firmezas válidas, precio > 0
  o vacío («Consultar»), precio anterior solo si es mayor que el precio, de 0 a 4 fotos sin
  repetir, y como mucho 200 productos. Textos de una línea sin espacios dobles ni en los bordes,
  como los deja la web. El público no ve los vendidos; los editores, sí.
- **`ajustes`**: una sola fila (`id = 1`) con un JSON `datos`: `tienda`, `portada`, `opiniones`,
  `financiacion`, `marcas`, `desde` y, desde la 008, `temporada` y `anuncio` (lo mismo que en `contenido.js`, sin
  `productos`). Se revisan tipos, largos principales, el WhatsApp (`34` + 9 cifras), las rutas de fotos, tamaños de
  listas y 32 KB como máximo. En el anuncio, los enlaces solo de Instagram, Facebook, TikTok o wa.me (las bases,
  también eduardolar.github.io), con el dominio anclado, y las fechas «hasta» que existan (AAAA-MM-DD); que hayan
  pasado no se revisa: la web deja de enseñarlos sola. La foto del anuncio va en `portada/` del bucket (no hace
  falta tocar las políticas de Storage). Los productos tienen `en_temporada` (desde la 008).
- **`editores`**: quién puede editar. Cada editor solo puede leer su propia fila (así el panel sabe
  si es editor); nadie la cambia desde la web.
- **Portada sin producto fantasma**: si se vende o se borra el producto destacado en la portada, la
  portada se queda sin destacado automáticamente; y no se puede poner de destacado uno vendido o
  inexistente.
- **`historial`** (desde la 009): una fila por cada alta, cambio o borrado de un producto o de los ajustes,
  con cuándo, quién (`quien` = su UID, `correo` = el de su sesión, `origen` = `authenticated` si fue desde
  el panel, `service_role` con la clave secreta o `postgres` desde el SQL Editor; en estos dos últimos
  `quien` queda vacío), qué fila (`registro`: la ref o `ajustes`), `accion` (`crear`, `cambiar`, `borrar`),
  un `resumen` corto y **solo lo que cambió** en `cambios`: `{"precio": {"antes": 699, "despues": 650}}`.
  - Productos: por columna (no cuentan `creado_en` ni `actualizado_en`). Al crear salen todas con
    `antes: null`; al borrar, todas con `despues: null` (sirve para rehacer un producto borrado por error).
  - Ajustes: dentro de `datos`, por claves de primer y segundo nivel: `portada.titular`, `tienda.telefono`,
    `marcas`, `opiniones.lista` (la lista entera, que es pequeña)… Un cambio más hondo se guarda en su clave
    de segundo nivel (`tienda.aviso` con su `activo` y su `texto`). Nunca se copia `datos` entero al cambiar.
  - Guardar sin cambiar nada (mismo contenido; `650` y `650.00` son lo mismo) **no** se anota.
  - Lo escriben solo los disparadores. Lo **leen solo los editores**; el público no. Nadie puede añadir,
    cambiar, borrar ni vaciar a mano: ni el panel, ni la clave secreta, ni el SQL Editor (este solo puede
    borrar lo de más de 90 días; quitarlo entero, con `deshacer/009_deshacer_historial.sql`).
  - Se guarda **90 días**: cada vez que se anota algo, la base de datos borra lo de más de 90 días (con el
    índice por fecha cuesta una lectura; si otra sesión está limpiando en ese momento, lo salta y se borra
    en la siguiente: nunca hace esperar a nadie). Si no hay cambios en meses, lo viejo sigue guardado hasta
    el siguiente cambio, aunque **ya no se puede leer**: la regla de lectura solo deja ver los últimos 90 días.
  - **Datos personales**: se guarda el **correo de quien edita** (90 días) y, en `cambios`, lo que se cambió,
    que puede incluir nombres de terceros (autores de las opiniones). Para que lo viejo se borre puntualmente
    aunque no haya cambios, se recomienda programar la limpieza diaria con `pg_cron` (sección 8). Para borrar
    o anonimizar antes de tiempo (p. ej. si alguien lo pide), ver «Borrado de emergencia» en la sección 8.
  - Tope de tamaño: si lo cambiado en una vez pasa de 8 KB, los campos de más de 2 KB se guardan solo con su
    tamaño: `{"antes": {"omitido": 2300}, "despues": {"omitido": 2410}}`.
  - Reordenar la lista anota una fila por cada producto que cambia de `orden`.

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

### Historial (desde la 009)

Solo para quien ha entrado y está en `editores` (otra cuenta recibe `[]`; sin entrar, error `42501`):

```js
// lo último primero (los últimos 90 días)
const { data } = await sb.from('historial')
  .select('cuando, correo, origen, tabla, registro, accion, resumen, cambios')
  .gte('cuando', new Date(Date.now() - 90 * 864e5).toISOString())
  .order('cuando', { ascending: false }).order('id', { ascending: false })
  .limit(50);
// lo de un producto: añadir .eq('tabla', 'productos').eq('registro', 'SOF-01')
```

**Pintarlo siempre como texto** (`textContent`, nunca `innerHTML` ni plantillas con HTML): `resumen` sale ya
sin caracteres de control ni de dirección, pero `cambios` lleva tal cual lo que se escribió (nombres,
descripciones, claves de los ajustes) y `correo` viene de la sesión.

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
- `deshacer/009_deshacer_historial.sql`: quita el historial (tabla, disparadores y funciones). Productos y
  ajustes no se tocan. Lo guardado se pierde (exportarlo antes si se quiere).
- `deshacer/001_deshacer_esquema.sql`: **borra todo** (productos, ajustes, editores, reglas). Antes,
  exporta los datos. El bucket se vacía en *Storage* y luego se borra (por SQL no se puede vaciar).

## 8. Migración 009: historial de cambios

**Cómo ejecutarla.** *SQL Editor* → *New query* → pega **todo** `migraciones/009_historial.sql` → *Run*.
Termina con una fila de comprobación: `rls_historial = true`, los cuatro disparadores
(`historial_ajustes en ajustes, historial_intocable en historial, historial_productos en productos,
historial_sin_vaciar en historial`) y
`politicas = 1`. Si el editor avisa de operaciones «destructivas», confirma: son los `revoke` y el
`drop policy if exists` del script. Se puede volver a ejecutar (no borra el historial guardado). No cambia
productos ni ajustes; desde ese momento se anota cada cambio (lo anterior no quedó registrado).

**Prueba a mano** (SQL Editor, después de ejecutarla; cada bloque en una consulta nueva). Desde el SQL Editor
las filas salen con `origen = postgres` y `quien`/`correo` vacíos: es lo esperado.

```sql
-- 1) Un cambio real y otro sin diferencias: solo sale UNA fila nueva, con solo «orden».
update public.productos set orden = orden + 1 where ref = (select min(ref) from public.productos);
update public.productos set orden = orden     where ref = (select min(ref) from public.productos);  -- no anota
select id, cuando, origen, accion, registro, resumen, cambios from public.historial order by id desc limit 3;

-- 2) Volver a dejarlo como estaba (anota otra fila, con antes/despues al revés).
update public.productos set orden = orden - 1 where ref = (select min(ref) from public.productos);

-- 3) Un ajuste de segundo nivel: sale «tienda.zonaEntrega», no «datos» entero.
update public.ajustes set datos = jsonb_set(datos, '{tienda,zonaEntrega}', '"Prueba del historial"') where id = 1;
select registro, resumen, cambios from public.historial order by id desc limit 1;

-- 4) Y se deshace con el «antes» guardado en el propio historial:
update public.ajustes
   set datos = jsonb_set(datos, '{tienda,zonaEntrega}',
                 (select h.cambios #> '{tienda.zonaEntrega,antes}' from public.historial h
                   where h.registro = 'ajustes' and h.cambios ? 'tienda.zonaEntrega' order by h.id desc limit 1))
 where id = 1;
select datos #>> '{tienda,zonaEntrega}' as zona_entrega from public.ajustes;   -- la de antes

-- 5) Nadie lo cambia a mano (cada línea, sola, debe dar error):
update public.historial set resumen = 'x';    -- «El historial no se puede cambiar»
delete from public.historial;                 -- «El historial de los últimos 90 días no se puede borrar»
truncate public.historial;                    -- «El historial no se puede vaciar»

-- 6) Permisos: solo SELECT para authenticated y service_role; nada para anon (postgres, el dueño, sale con todo).
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'historial' order by grantee;

-- 7) El historial no se emite por Realtime: tiene que salir VACÍO.
select * from pg_publication_tables where tablename = 'historial';
```

Después, en el panel con la cuenta de la editora, cambia algo y mira en *Table Editor* → `historial` que la
fila nueva lleva `origen = authenticated` y su correo. Que el público **no** lo lee (cambia `URL_PROYECTO`
y `CLAVE_PUBLICA`; debe responder un error de permiso `42501`, no una lista):

```sh
curl "URL_PROYECTO/rest/v1/historial?select=id&limit=1" -H "apikey: CLAVE_PUBLICA"
```

**Limpieza diaria (recomendada).** El disparador ya borra lo viejo en cada cambio, pero si pasan semanas sin
cambios el correo de la editora seguiría guardado más de 90 días (aunque nadie pueda leerlo). Para que se
borre a diario: *Database* → *Extensions* → activar `pg_cron`, y en el SQL Editor:

```sql
select cron.schedule('historial-90-dias', '17 4 * * *', 'select privado.historial_limpiar()');
select jobid, jobname, schedule, command from cron.job where jobname = 'historial-90-dias';  -- comprobar
```

(Hora del servidor, UTC: las 4:17 son las 5:17 o 6:17 en Madrid. `deshacer/009_deshacer_historial.sql` quita
la tarea si existe.)

**Borrado de emergencia** (p. ej. alguien pide que se borren sus datos, o se guardó algo que no debía).
Desactiva la protección **solo dentro de la transacción**: si algo falla, no queda desactivada. Cambia el
correo o el filtro y ejecuta el bloque entero:

```sql
begin;
alter table public.historial disable trigger historial_intocable;
-- Borrar lo de una persona…
delete from public.historial where correo = 'correo@ejemplo.com';
-- …o, en su lugar, anonimizar (se conserva qué se cambió, sin quién):
-- update public.historial set correo = null, quien = null where correo = 'correo@ejemplo.com';
-- …o quitar una fila concreta: delete from public.historial where id = 123;
alter table public.historial enable trigger historial_intocable;
commit;
-- Comprobación: tiene que salir «O» (activado).
select tgenabled from pg_trigger where tgname = 'historial_intocable';
```

Los textos de terceros dentro de `cambios` (p. ej. el autor de una opinión) se buscan con
`where cambios::text ilike '%Nombre%'` en el mismo bloque.
