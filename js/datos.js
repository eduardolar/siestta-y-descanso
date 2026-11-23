// Conexión con la base de datos (Supabase) por sus API REST, con fetch y sin librerías:
//   · /rest/v1     productos y ajustes (PostgREST)
//   · /auth/v1     entrar, renovar la sesión y salir (solo el panel)
//   · /storage/v1  fotos del bucket «fotos»
// Los datos de conexión están en js/config.js (públicos). Los tokens de la sesión nunca van en la
// URL ni se escriben en la consola. Todo lo que llega se pasa por Contenido.normalizar.
(function () {
  'use strict';

  var C = window.Contenido;
  var CFG = window.SIESTTA_CONFIG;
  if (!C || !CFG || !CFG.url || !CFG.clave) return;

  var BASE = String(CFG.url).replace(/\/+$/, '');
  var ESPERA = CFG.espera || 8000;
  var ESPERA_FOTO = Math.max(ESPERA * 4, 30000);
  var CLAVE_SESION = 'siestta-sesion-v1';
  var COLUMNAS = { precioAntes: 'precio_antes', descripcionLarga: 'descripcion_larga', aMedida: 'a_medida' };
  var CAMPOS = ['nombre', 'categoria', 'precio', 'precioAntes', 'etiqueta', 'estado', 'fotos', 'descripcion',
    'descripcionLarga', 'medidas', 'colores', 'firmeza', 'aMedida', 'plazo', 'destacado'];

  // ---------- Errores: un tipo y un mensaje claro en español ----------

  var MENSAJES = {
    red: 'No hay conexión con el servidor. Revisa internet y vuelve a intentarlo.',
    tiempo: 'El servidor tarda demasiado en contestar. Vuelve a intentarlo en un momento.',
    sesion: 'La sesión ha caducado. Vuelve a entrar.',
    permiso: 'Esta cuenta no tiene permiso para editar.',
    credenciales: 'Correo o contraseña incorrectos.',
    duplicado: 'Ya existe un producto con esa referencia.',
    tamano: 'La foto ocupa demasiado (como mucho 600 KB). Prueba con otra.',
    regla: 'Hay un dato que no se puede guardar. Revísalo.',
    servidor: 'El servidor ha fallado. Vuelve a intentarlo en un momento.'
  };

  // Reglas (CHECK) de la tabla productos → qué decirle a la persona
  var REGLAS = {
    productos_nombre: 'El nombre tiene que tener de 1 a 60 caracteres, en una línea.',
    productos_categoria: 'Elige qué es: sofá, sillón, colchón o cama.',
    productos_precio: 'El precio tiene que ser mayor que 0 y como mucho 1.000.000 €.',
    productos_precio_antes: 'El precio de antes tiene que ser más alto que el precio de ahora.',
    productos_etiqueta: 'Esa etiqueta no vale.',
    productos_estado: 'Ese estado no vale.',
    productos_fotos: 'Alguna foto no es válida. Quítala y vuelve a ponerla.',
    productos_descripcion: 'La descripción corta es demasiado larga (como mucho 140).',
    productos_descripcion_larga: 'La descripción larga es demasiado larga (como mucho 1000).',
    productos_medidas: 'Las medidas son demasiado largas (como mucho 120).',
    productos_colores: 'Telas y colores es demasiado largo (como mucho 160).',
    productos_firmeza: 'Esa firmeza no vale.',
    productos_plazo: 'El plazo es demasiado largo (como mucho 60).',
    productos_ref_formato: 'La referencia no es válida.',
    ajustes_datos_validos: 'Algún dato de la tienda no es válido. Revísalo.'
  };

  function crearError(tipo, extra) {
    var e = new Error(MENSAJES[tipo] || MENSAJES.servidor);
    e.tipo = tipo;
    e.mensaje = e.message;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  // Convierte una respuesta de error de PostgREST, Auth o Storage en { tipo, mensaje }
  function errorDeRespuesta(estado, cuerpo, conToken) {
    var c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
    var codigo = String(c.error_code || c.code || ''); // Auth: error_code (texto); PostgREST: code
    var texto = String(c.message || c.msg || c.error_description || c.error || '');
    var estadoStorage = String(c.statusCode || '');
    if (codigo === '23514' || codigo === '23502' || codigo === '22P02' || codigo === '22003') {
      var m = /constraint "([a-z_]+)"/.exec(texto);
      var mensaje = m && REGLAS[m[1]] ? REGLAS[m[1]]
        // Las reglas propias de la base de datos ya traen el mensaje en español
        : texto && !/^(new row|null value|invalid input|numeric field)/i.test(texto) ? texto : MENSAJES.regla;
      return crearError('regla', { estado: estado, codigo: codigo, mensaje: mensaje, message: mensaje });
    }
    if (codigo === '23505' || (estado === 409 && /duplicate/i.test(texto + c.error))) return crearError('duplicado', { estado: estado, codigo: codigo });
    if (estado === 413 || estadoStorage === '413' || /payload too large|maximum allowed size/i.test(texto)) return crearError('tamano', { estado: estado });
    if (/jwt|token is expired|invalid claim|InvalidJWT/i.test(texto + ' ' + (c.error || '')) || codigo === 'PGRST301' || codigo === 'PGRST303') {
      return crearError(conToken ? 'sesion' : 'permiso', { estado: estado, codigo: codigo });
    }
    if (estado === 401) return crearError(conToken ? 'sesion' : 'permiso', { estado: estado, codigo: codigo });
    if (estado === 403 || codigo === '42501' || estadoStorage === '403' || /row-level security|permission denied|unauthorized/i.test(texto)) {
      return crearError('permiso', { estado: estado, codigo: codigo });
    }
    if (estado === 429) return crearError('servidor', { estado: estado, mensaje: 'Demasiados intentos seguidos. Espera un poco y vuelve a probar.', message: 'Demasiados intentos seguidos. Espera un poco y vuelve a probar.' });
    return crearError('servidor', { estado: estado, codigo: codigo });
  }

  // ---------- Petición con tiempo máximo ----------

  // o: { metodo, ruta, cuerpo (objeto → JSON, o Blob), token, cabeceras, espera }
  // Resuelve { estado, datos } (2xx) o rechaza con un error con .tipo y .mensaje
  function peticion(o) {
    var cabeceras = { apikey: CFG.clave };
    if (o.token) cabeceras.Authorization = 'Bearer ' + o.token;
    var cuerpo = o.cuerpo;
    if (cuerpo !== undefined && !(cuerpo instanceof Blob)) {
      cabeceras['Content-Type'] = 'application/json';
      cuerpo = JSON.stringify(cuerpo);
    }
    Object.keys(o.cabeceras || {}).forEach(function (k) { cabeceras[k] = o.cabeceras[k]; });
    var control = typeof AbortController === 'function' ? new AbortController() : null;
    var reloj = control ? setTimeout(function () { control.abort(); }, o.espera || ESPERA) : null;
    return fetch(BASE + o.ruta, {
      method: o.metodo || 'GET',
      headers: cabeceras,
      body: cuerpo,
      signal: control ? control.signal : undefined,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      return r.text().then(function (t) {
        clearTimeout(reloj);
        var datos = null;
        try { datos = t ? JSON.parse(t) : null; } catch (e) { datos = t; }
        if (r.ok) return { estado: r.status, datos: datos };
        throw errorDeRespuesta(r.status, datos, !!o.token);
      });
    }, function (e) {
      clearTimeout(reloj);
      throw crearError(e && e.name === 'AbortError' ? 'tiempo' : 'red');
    });
  }

  function q(v) { return encodeURIComponent(v); }

  // ---------- De la base de datos al modelo de la web y al revés ----------

  function deFila(f) {
    var p = { id: f.ref };
    CAMPOS.forEach(function (k) { p[k] = f[COLUMNAS[k] || k]; });
    if (p.precio !== null && p.precio !== undefined) p.precio = Number(p.precio);
    if (p.precioAntes !== null && p.precioAntes !== undefined) p.precioAntes = Number(p.precioAntes);
    return p;
  }

  // Solo los campos pedidos, con su nombre de columna (ref no se cambia nunca)
  function aFila(p, campos) {
    var f = {};
    (campos || CAMPOS).forEach(function (k) {
      if (CAMPOS.indexOf(k) === -1) return;
      f[COLUMNAS[k] || k] = p[k];
    });
    return f;
  }

  function contenidoDe(filas, datosAjustes) {
    var base = datosAjustes && typeof datosAjustes === 'object' ? JSON.parse(JSON.stringify(datosAjustes)) : {};
    base.version = C.VERSION;
    base.productos = (filas || []).map(deFila);
    return C.normalizar(base);
  }

  // Lo que va en ajustes.datos: el contenido sin los productos
  function ajustesDe(c) {
    var n = C.normalizar(c);
    return {
      version: C.VERSION,
      tienda: n.tienda,
      portada: n.portada,
      opiniones: n.opiniones,
      financiacion: n.financiacion,
      marcas: n.marcas,
      desde: n.desde
    };
  }

  var RUTA_PRODUCTOS = '/rest/v1/productos?select=*&order=orden.asc,creado_en.desc,ref.asc';
  var RUTA_AJUSTES = '/rest/v1/ajustes?select=datos,actualizado_en&id=eq.1';

  // Todo: productos (los no vendidos para el público; todos para un editor) y ajustes.
  // Devuelve { contenido, meta: { productos: { ref: actualizado_en }, ajustes: actualizado_en } }
  function leerTodo(token) {
    return Promise.all([
      peticion({ ruta: RUTA_PRODUCTOS, token: token }),
      peticion({ ruta: RUTA_AJUSTES, token: token })
    ]).then(function (r) {
      var filas = Array.isArray(r[0].datos) ? r[0].datos : [];
      var aj = Array.isArray(r[1].datos) && r[1].datos[0] ? r[1].datos[0] : null;
      if (!aj || !aj.datos) throw crearError('servidor');
      var meta = { productos: {}, ajustes: aj.actualizado_en };
      filas.forEach(function (f) { meta.productos[f.ref] = f.actualizado_en; });
      return { contenido: contenidoDe(filas, aj.datos), meta: meta, filas: filas, datosAjustes: aj.datos };
    });
  }

  function leerProducto(ref, token) {
    return peticion({ ruta: '/rest/v1/productos?select=*&ref=eq.' + q(ref), token: token }).then(function (r) {
      return Array.isArray(r.datos) && r.datos[0] ? r.datos[0] : null;
    });
  }

  function leerAjustes(token) {
    return peticion({ ruta: RUTA_AJUSTES, token: token }).then(function (r) {
      var aj = Array.isArray(r.datos) && r.datos[0] ? r.datos[0] : null;
      if (!aj) throw crearError('servidor');
      return aj;
    });
  }

  function referencias(token) {
    return peticion({ ruta: '/rest/v1/productos?select=ref', token: token }).then(function (r) {
      return (Array.isArray(r.datos) ? r.datos : []).map(function (f) { return f.ref; });
    });
  }

  var REPRESENTACION = { Prefer: 'return=representation' };

  // Alta: la fila nueva (con su actualizado_en). Un 23505 (ya existe esa ref) llega como tipo 'duplicado'
  function crearProducto(p, token) {
    var fila = aFila(p);
    fila.ref = p.id;
    fila.orden = 0; // los nuevos, primero (los de orden 0 van del más nuevo al más viejo)
    return peticion({ metodo: 'POST', ruta: '/rest/v1/productos', cuerpo: fila, token: token, cabeceras: REPRESENTACION, espera: ESPERA * 2 })
      .then(function (r) { return Array.isArray(r.datos) ? r.datos[0] : r.datos; });
  }

  // Cambio condicional: solo si nadie lo ha cambiado desde «actualizado». Devuelve la fila nueva,
  // o null si hay conflicto (otra persona lo cambió o lo borró antes)
  function cambiarProducto(ref, campos, actualizado, token) {
    return peticion({
      metodo: 'PATCH',
      ruta: '/rest/v1/productos?ref=eq.' + q(ref) + '&actualizado_en=eq.' + q(actualizado),
      cuerpo: campos, token: token, cabeceras: REPRESENTACION, espera: ESPERA * 2
    }).then(function (r) { return Array.isArray(r.datos) && r.datos[0] ? r.datos[0] : null; });
  }

  function borrarProducto(ref, actualizado, token) {
    return peticion({
      metodo: 'DELETE',
      ruta: '/rest/v1/productos?ref=eq.' + q(ref) + '&actualizado_en=eq.' + q(actualizado),
      token: token, cabeceras: REPRESENTACION, espera: ESPERA * 2
    }).then(function (r) { return Array.isArray(r.datos) && r.datos[0] ? r.datos[0] : null; });
  }

  function cambiarAjustes(datos, actualizado, token) {
    return peticion({
      metodo: 'PATCH',
      ruta: '/rest/v1/ajustes?id=eq.1&actualizado_en=eq.' + q(actualizado),
      cuerpo: { datos: datos }, token: token, cabeceras: REPRESENTACION, espera: ESPERA * 2
    }).then(function (r) { return Array.isArray(r.datos) && r.datos[0] ? r.datos[0] : null; });
  }

  function esEditor(token, userId) {
    return peticion({ ruta: '/rest/v1/editores?select=user_id', token: token }).then(function (r) {
      return (Array.isArray(r.datos) ? r.datos : []).some(function (f) { return f && f.user_id === userId; });
    });
  }

  // ---------- Fotos (bucket «fotos») ----------

  function rutaCodificada(ruta) { return ruta.split('/').map(q).join('/'); }

  function subirFoto(ruta, blob, token) {
    return peticion({
      metodo: 'POST', ruta: '/storage/v1/object/fotos/' + rutaCodificada(ruta), cuerpo: blob, token: token,
      cabeceras: { 'Content-Type': blob.type || 'image/jpeg', 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
      espera: ESPERA_FOTO
    }).then(function () { return ruta; });
  }

  // Solo se borran rutas del bucket (nunca las de img/)
  function borrarFotos(rutas, token) {
    var delBucket = (rutas || []).filter(C.esRutaAlmacen);
    if (!delBucket.length) return Promise.resolve();
    return peticion({ metodo: 'DELETE', ruta: '/storage/v1/object/fotos', cuerpo: { prefixes: delBucket }, token: token })
      .then(function () {});
  }

  // Lo que hay en una carpeta del bucket (p. ej. productos/SOF-04): sus rutas completas
  function listarFotos(carpeta, token) {
    return peticion({
      metodo: 'POST', ruta: '/storage/v1/object/list/fotos',
      cuerpo: { prefix: carpeta, limit: 100, offset: 0 }, token: token
    }).then(function (r) {
      return (Array.isArray(r.datos) ? r.datos : []).map(function (o) { return o && o.name ? carpeta + '/' + o.name : ''; })
        .filter(C.esRutaAlmacen);
    });
  }

  function nuevaRutaFoto(ref) {
    var uuid = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = window.crypto.getRandomValues(new Uint8Array(1))[0] & 15;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
    return (ref ? 'productos/' + ref : 'portada') + '/' + uuid.toLowerCase() + '.jpg';
  }

  // ---------- Sesión del panel (/auth/v1) ----------

  var sesion = leerSesion();
  var renovando = null;
  var relojSesion = null;
  var oyentesSesion = [];

  function ahora() { return Math.floor(Date.now() / 1000); }

  function leerSesion() {
    try {
      var s = JSON.parse(window.localStorage.getItem(CLAVE_SESION));
      if (s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' && s.usuario && s.usuario.id) return s;
    } catch (e) { /* sin sesión */ }
    return null;
  }

  function deRespuestaAuth(d) {
    if (!d || !d.access_token || !d.refresh_token || !d.user) throw crearError('servidor');
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: typeof d.expires_at === 'number' ? d.expires_at : ahora() + (d.expires_in || 3600),
      usuario: { id: d.user.id, email: d.user.email || '' }
    };
  }

  function ponerSesion(s) {
    sesion = s;
    try {
      if (s) window.localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
      else window.localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* modo privado: la sesión dura lo que la pestaña */ }
    programarRenovacion();
  }

  function programarRenovacion() {
    clearTimeout(relojSesion);
    if (!sesion) return;
    var faltan = (sesion.expires_at - ahora() - 120) * 1000;
    relojSesion = setTimeout(function () { renovar().catch(function () {}); }, Math.max(5000, Math.min(faltan, 2147000000)));
  }

  function errorAuth(e) {
    if (e.tipo === 'red' || e.tipo === 'tiempo') return e;
    var texto = (e.estado === 400 || e.estado === 401 || e.estado === 422) ? 'credenciales' : null;
    return texto ? crearError('credenciales', { estado: e.estado }) : e;
  }

  function entrar(correo, clave) {
    return peticion({
      metodo: 'POST', ruta: '/auth/v1/token?grant_type=password',
      cuerpo: { email: correo, password: clave }
    }).then(function (r) {
      ponerSesion(deRespuestaAuth(r.datos));
      return sesion;
    }, function (e) {
      if (e.estado === 400 && e.codigo === 'email_not_confirmed') {
        throw crearError('credenciales', { mensaje: 'Esta cuenta aún no está confirmada.', message: 'Esta cuenta aún no está confirmada.' });
      }
      if (e.estado === 429) throw e;
      throw errorAuth(e);
    });
  }

  // Renueva el token con el refresh_token. Una sola renovación a la vez; si otra pestaña ya la
  // ha hecho (lo guardó en localStorage), se usa esa
  function renovar(forzar) {
    if (renovando) return renovando;
    var guardada = leerSesion();
    if (guardada && sesion && guardada.refresh_token !== sesion.refresh_token && guardada.expires_at > ahora() + 60) {
      sesion = guardada;
      programarRenovacion();
      if (!forzar) return Promise.resolve(sesion);
    }
    if (!sesion) return Promise.reject(crearError('sesion'));
    var usada = sesion.refresh_token;
    renovando = peticion({
      metodo: 'POST', ruta: '/auth/v1/token?grant_type=refresh_token', cuerpo: { refresh_token: usada }
    }).then(function (r) {
      renovando = null;
      ponerSesion(deRespuestaAuth(r.datos));
      return sesion;
    }, function (e) {
      renovando = null;
      if (e.tipo === 'red' || e.tipo === 'tiempo') throw e;
      // ¿La ha renovado otra pestaña mientras tanto?
      var otra = leerSesion();
      if (otra && otra.refresh_token !== usada && otra.expires_at > ahora() + 60) {
        sesion = otra;
        programarRenovacion();
        return sesion;
      }
      ponerSesion(null);
      avisarSesion('caducada');
      throw crearError('sesion');
    });
    return renovando;
  }

  // El token válido (si le queda menos de un minuto, se renueva antes)
  function token() {
    if (!sesion) return Promise.reject(crearError('sesion'));
    if (sesion.expires_at - ahora() < 60) return renovar().then(function (s) { return s.access_token; });
    return Promise.resolve(sesion.access_token);
  }

  function salir() {
    var s = sesion;
    ponerSesion(null);
    if (!s) return Promise.resolve();
    // scope=local: cierra solo esta sesión (no las de otros dispositivos)
    return peticion({ metodo: 'POST', ruta: '/auth/v1/logout?scope=local', token: s.access_token })
      .then(function () {}, function () {});
  }

  // ---------- Contraseña olvidada ----------

  // Pide a Supabase que envíe el enlace de recuperación. volverA: la dirección del panel (tiene que estar
  // en Authentication → URL Configuration → Redirect URLs). Supabase contesta igual exista o no el correo
  function pedirRecuperacion(correo, volverA) {
    return peticion({
      metodo: 'POST', ruta: '/auth/v1/recover?redirect_to=' + q(volverA), cuerpo: { email: correo }
    }).then(function () { return true; });
  }

  // Al volver del enlace del correo, Supabase deja en la dirección #access_token=…&type=recovery (o
  // #error=…). Se lee al cargar y se borra de la dirección en el acto (no se queda en el historial)
  var vueltaCorreo = null;
  (function () {
    if (!document.body || !document.body.classList.contains('panel')) return;
    var h = window.location.hash || '';
    if (!/(^#|&)(access_token|error_code|error)=/.test(h)) return;
    var d = {};
    h.slice(1).split('&').forEach(function (par) {
      var i = par.indexOf('=');
      if (i <= 0) return;
      try { d[decodeURIComponent(par.slice(0, i))] = decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* nada */ }
    });
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* nada */ }
    if (d.type === 'recovery' && d.access_token && d.refresh_token) {
      vueltaCorreo = {
        tipo: 'recuperacion', access_token: d.access_token, refresh_token: d.refresh_token,
        expires_at: Number(d.expires_at) || ahora() + (Number(d.expires_in) || 3600)
      };
    } else if (d.error || d.error_code) {
      vueltaCorreo = { tipo: 'error', codigo: d.error_code || d.error };
    }
  })();

  // Entra con los tokens del enlace del correo (pregunta a Auth de quién son)
  function entrarConRecuperacion() {
    var v = vueltaCorreo;
    vueltaCorreo = null;
    if (!v || v.tipo !== 'recuperacion') return Promise.reject(crearError('sesion'));
    return peticion({ ruta: '/auth/v1/user', token: v.access_token }).then(function (r) {
      var u = r.datos || {};
      if (!u.id) throw crearError('sesion');
      ponerSesion({ access_token: v.access_token, refresh_token: v.refresh_token, expires_at: v.expires_at, usuario: { id: u.id, email: u.email || '' } });
      return sesion;
    });
  }

  // Pone una contraseña nueva a la cuenta de la sesión
  function cambiarClave(nueva) {
    return conSesion(function (tk) {
      return peticion({ metodo: 'PUT', ruta: '/auth/v1/user', cuerpo: { password: nueva }, token: tk });
    }).then(function () { return true; });
  }

  function avisarSesion(que) { oyentesSesion.forEach(function (f) { try { f(que); } catch (e) { /* nada */ } }); }

  // Hace fn(token) con la sesión. Si el servidor dice que el token ya no vale, se renueva y se
  // repite; si tampoco se puede renovar, se pide entrar otra vez (Sesion.alCaducar, lo pone el panel)
  // y se repite al volver. Así no se pierde lo que se estaba guardando.
  function conSesion(fn) {
    function intento(veces) {
      return token().then(fn).catch(function (e) {
        if (e.tipo !== 'sesion' || veces > 2) throw e;
        var siguiente = veces === 0 && sesion ? renovar(true) : Promise.reject(e);
        return siguiente.then(function () { return intento(veces + 1); }, function () {
          if (typeof Sesion.alCaducar !== 'function') throw crearError('sesion');
          return Sesion.alCaducar().then(function () { return intento(veces + 1); });
        });
      });
    }
    return intento(0);
  }

  // Otra pestaña ha entrado, renovado o salido
  window.addEventListener('storage', function (e) {
    if (e.key !== CLAVE_SESION && e.key !== null) return;
    var antes = sesion;
    sesion = leerSesion();
    programarRenovacion();
    if (antes && !sesion) avisarSesion('salida');
    else if (!antes && sesion) avisarSesion('entrada');
  });

  // Al volver a la pestaña (el móvil suspende los temporizadores), se renueva si caduca pronto
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !sesion) return;
    if (sesion.expires_at - ahora() < 300) renovar().catch(function () {});
    else programarRenovacion();
  });

  var Sesion = {
    actual: function () { return sesion ? { usuario: sesion.usuario, expires_at: sesion.expires_at } : null; },
    entrar: entrar,
    renovar: renovar,
    token: token,
    salir: salir,
    conSesion: conSesion,
    alCambiar: function (fn) { oyentesSesion.push(fn); },
    alCaducar: null,
    pedirRecuperacion: pedirRecuperacion,
    vueltaCorreo: function () { return vueltaCorreo ? { tipo: vueltaCorreo.tipo, codigo: vueltaCorreo.codigo } : null; },
    entrarConRecuperacion: entrarConRecuperacion,
    cambiarClave: cambiarClave
  };
  if (sesion) programarRenovacion();

  // ---------- Web pública: caché y servidor ----------

  var ultimaCarga = 0;
  var cargando = null;

  // Trae lo del servidor (como público) y lo deja en la caché; si falla, la web sigue con lo que tenía
  function refrescarPublico() {
    if (cargando) return cargando;
    cargando = leerTodo(null).then(function (r) {
      ultimaCarga = Date.now();
      cargando = null;
      window.guardarContenido(r.contenido);
      return true;
    }, function () {
      cargando = null;
      return false;
    });
    return cargando;
  }

  function iniciarPublico() {
    var primera = refrescarPublico();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - ultimaCarga > 60000) refrescarPublico();
    });
    // Vuelve la conexión: se pide otra vez
    window.addEventListener('online', function () { refrescarPublico(); });
    return primera;
  }

  window.Datos = {
    MENSAJES: MENSAJES,
    peticion: peticion,
    leerTodo: leerTodo,
    leerProducto: leerProducto,
    leerAjustes: leerAjustes,
    referencias: referencias,
    crearProducto: crearProducto,
    cambiarProducto: cambiarProducto,
    borrarProducto: borrarProducto,
    cambiarAjustes: cambiarAjustes,
    esEditor: esEditor,
    subirFoto: subirFoto,
    borrarFotos: borrarFotos,
    listarFotos: listarFotos,
    nuevaRutaFoto: nuevaRutaFoto,
    deFila: deFila,
    aFila: aFila,
    contenidoDe: contenidoDe,
    ajustesDe: ajustesDe,
    refrescarPublico: refrescarPublico,
    iniciarPublico: iniciarPublico,
    primeraCarga: null,
    Sesion: Sesion
  };

  // En la web pública (no en el panel) se pide ya lo del servidor; lo que se pinta mientras tanto es
  // lo del HTML y luego lo de la caché
  if (document.body && !document.body.classList.contains('panel')) window.Datos.primeraCarga = iniciarPublico();
})();
