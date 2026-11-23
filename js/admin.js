// Panel de la tienda: la dueña cambia productos, horario, aviso, textos y contacto.
// Se entra con correo y contraseña (Supabase Auth) y solo si la cuenta está en «editores».
// Todo se guarda solo, en la base de datos (ver js/datos.js), y lo ven todos al momento.
// Los datos se pintan siempre con textContent; nunca innerHTML con lo que escribe la persona.
//
// Para no pisar lo que haya cambiado otra persona (otro móvil, otra pestaña), cada guardado envía
// SOLO lo que se acaba de cambiar (unos campos de un producto, o los ajustes) y solo si nadie lo ha
// cambiado desde que se leyó (actualizado_en). Si sí, se recarga eso y se avisa.
(function () {
  'use strict';

  var C = window.Contenido;
  var D = window.Datos;
  if (!C || !window.cargarContenido || !D) return;
  var S = D.Sesion;

  var contenido = C.normalizar({ productos: [] });
  var meta = { productos: {}, ajustes: null };  // actualizado_en de lo que se leyó
  var listo = false;                             // el panel ya tiene los datos del servidor
  var vista = 'web';
  var V = '20261123-4';

  var MENSAJE_FALTA = 'Ese producto ya no está: lo ha borrado otra persona.';
  var MENSAJE_CONFLICTO = 'Lo ha cambiado otra persona; se ha recargado.';
  var MAX_FOTO = 590 * 1024; // el bucket admite 600 KB

  function $(id) { return document.getElementById(id); }
  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }
  function copiar(o) { return JSON.parse(JSON.stringify(o)); }
  function contar(campo, cuenta, max) { cuenta.textContent = Array.from(campo.value).length + ' / ' + max; }
  function srcFoto(f) { return C.urlFoto(f, V); }
  var E = window.Escaparate.piezas;

  // ---------- Aviso flotante (toast) ----------
  // Va en la capa de arriba (popover) para verse aunque se haya bajado o haya una ficha abierta.

  var toast = $('toast');
  var conPopover = typeof toast.showPopover === 'function';
  if (!conPopover) { toast.removeAttribute('popover'); toast.hidden = true; }
  var temporizadorToast;
  var accionToast = null;

  function anunciar(texto, error) {
    var zona = $(error ? 'anuncio-error' : 'anuncio');
    zona.textContent = '';
    setTimeout(function () { zona.textContent = texto; }, 50);
  }

  function esconderToast() {
    clearTimeout(temporizadorToast);
    accionToast = null;
    if (conPopover) { if (toast.matches(':popover-open')) toast.hidePopover(); }
    else toast.hidden = true;
  }

  // Los avisos normales se van solos a los 3 s, sin botón y sin bloquear lo que hay debajo.
  // opciones: { error: true } se queda hasta cerrarlo («Cerrar»); { accion: { texto, hacer } } añade
  // un botón (Deshacer) y dura 5 s
  function avisar(texto, opciones) {
    opciones = opciones || {};
    clearTimeout(temporizadorToast);
    $('toast-texto').textContent = texto;
    toast.classList.toggle('toast--error', !!opciones.error);
    accionToast = opciones.accion || null;
    toast.classList.toggle('toast--info', !opciones.error && !accionToast);
    $('toast-cerrar').hidden = !opciones.error;
    $('toast-accion').hidden = !accionToast;
    if (accionToast) $('toast-accion').textContent = accionToast.texto;
    if (conPopover) {
      if (toast.matches(':popover-open')) toast.hidePopover();
      toast.showPopover(); // al volver a abrirlo queda encima de todo, también de los diálogos
    } else {
      toast.hidden = false;
    }
    anunciar(texto, !!opciones.error);
    if (!opciones.error) temporizadorToast = setTimeout(esconderToast, opciones.duracion || (accionToast ? 5000 : 3000));
  }
  $('toast-cerrar').addEventListener('click', esconderToast);
  $('toast-accion').addEventListener('click', function () {
    var a = accionToast;
    esconderToast();
    if (a) a.hacer();
  });

  // ---------- Guardar ----------

  var temporizadorGuardado;
  function avisarGuardado(ok, texto) {
    var g = $('guardado');
    g.textContent = texto || (ok ? 'Guardado ✓' : 'No se ha guardado');
    g.dataset.estado = ok ? 'ok' : 'error';
    clearTimeout(temporizadorGuardado);
    if (ok) temporizadorGuardado = setTimeout(function () { g.textContent = ''; delete g.dataset.estado; }, 4000);
  }

  function enCopia(c, id) {
    for (var i = 0; i < c.productos.length; i++) if (c.productos[i].id === id) return c.productos[i];
    return null;
  }
  function buscar(id) { return enCopia(contenido, id); }

  // Los guardados van de uno en uno, en orden: así cada uno usa el actualizado_en del anterior
  // y no choca consigo mismo
  var cola = Promise.resolve();
  function enCola(fn) {
    var r = cola.then(function () { return fn(); });
    cola = r.then(function () {}, function () {});
    return r;
  }

  function textoError(e) {
    if (!e) return D.MENSAJES.servidor;
    if (e.tipo === 'red') return 'Sin conexión: no se ha guardado. Revisa internet y vuelve a intentarlo.';
    if (e.tipo === 'tiempo') return 'El servidor no contesta: no se ha guardado. Vuelve a intentarlo.';
    if (e.tipo === 'sesion') return 'La sesión ha caducado: no se ha guardado. Vuelve a entrar e inténtalo otra vez.';
    return e.mensaje || D.MENSAJES.servidor;
  }

  // Tras un fallo: el aviso claro y, si hace falta, se repinta con lo recargado
  var fallos = 0; // cuántos guardados han fallado (para no cerrar sesión con algo sin guardar)
  function informarFallo(r) {
    fallos++;
    avisarGuardado(false);
    if (r.motivo === 'conflicto') { avisar(MENSAJE_CONFLICTO, { error: true }); trasRecargar(true); }
    else if (r.motivo === 'falta') { avisar(MENSAJE_FALTA, { error: true }); trasRecargar(true); }
    else avisar(textoError(r.error), { error: true });
  }

  function guardarCache() { window.guardarContenido(contenido); }

  // Pone (o quita, con fila null) un producto con lo que devuelve la base de datos
  function ponerFila(fila, ref) {
    var id = fila ? fila.ref : ref;
    var lista = contenido.productos.slice();
    var i = -1;
    lista.forEach(function (p, n) { if (p.id === id) i = n; });
    if (fila) {
      var p = D.deFila(fila);
      if (i === -1) lista.unshift(p); else lista[i] = p;
      meta.productos[id] = fila.actualizado_en;
    } else {
      if (i !== -1) lista.splice(i, 1);
      delete meta.productos[id];
    }
    var c = copiar(contenido);
    c.productos = lista;
    contenido = C.normalizar(c);
    guardarCache();
  }

  function ponerAjustes(fila) {
    var c = copiar(fila.datos);
    c.version = C.VERSION;
    c.productos = contenido.productos;
    contenido = C.normalizar(c);
    meta.ajustes = fila.actualizado_en;
    guardarCache();
  }

  // Trae del servidor un producto (o nota que ya no está). Resuelve true si sigue existiendo
  function recargarProducto(ref) {
    return S.conSesion(function (tk) { return D.leerProducto(ref, tk); }).then(function (fila) {
      ponerFila(fila, ref);
      return !!fila;
    }, function () { return true; });
  }

  function recargarAjustes() {
    return S.conSesion(function (tk) { return D.leerAjustes(tk); }).then(ponerAjustes, function () {});
  }

  // Guarda unos campos (nombres de contenido.js) de un producto, solo si nadie lo ha cambiado.
  // Resuelve { ok: true } o { ok: false, motivo: 'conflicto' | 'falta' | 'error', error }
  function guardarCampos(ref, campos) {
    $('guardado').textContent = 'Guardando…';
    $('guardado').dataset.estado = 'pendiente';
    return enCola(function () {
      if (!meta.productos[ref]) return { ok: false, motivo: 'falta' };
      return S.conSesion(function (tk) {
        return D.cambiarProducto(ref, D.aFila(campos, Object.keys(campos)), meta.productos[ref], tk);
      }).then(function (fila) {
        if (fila) { ponerFila(fila); return { ok: true }; }
        return recargarProducto(ref).then(function (sigue) { return { ok: false, motivo: sigue ? 'conflicto' : 'falta' }; });
      }, function (e) { return { ok: false, motivo: 'error', error: e }; });
    }).then(function (r) {
      if (r.ok) avisarGuardado(true); else informarFallo(r);
      return r;
    });
  }

  // Cambia los ajustes (tienda, portada, opiniones…): cambio(c) toca solo su parte de una copia
  // del contenido; se envía entero (datos), solo si nadie lo ha cambiado desde que se leyó
  function guardarAjustes(cambio) {
    $('guardado').textContent = 'Guardando…';
    $('guardado').dataset.estado = 'pendiente';
    // Si otra persona ha cambiado los ajustes entretanto, se recargan y se vuelve a aplicar SOLO este
    // cambio encima (lo que ella cambió se respeta); se avisa
    function intento(veces) {
      var copia = copiar(contenido);
      if (cambio(copia) === false) return { ok: false, motivo: 'falta' };
      var datos = D.ajustesDe(copia);
      return S.conSesion(function (tk) { return D.cambiarAjustes(datos, meta.ajustes, tk); }).then(function (fila) {
        if (fila) { ponerAjustes(fila); return { ok: true, reintento: veces > 0 }; }
        return recargarAjustes().then(function () {
          return veces < 2 ? intento(veces + 1) : { ok: false, motivo: 'conflicto' };
        });
      }, function (e) { return { ok: false, motivo: 'error', error: e }; });
    }
    return enCola(function () { return intento(0); }).then(function (r) {
      if (r.ok) avisarGuardado(true); else informarFallo(r);
      if (r.reintento) {
        trasRecargar(false);
        // Después del aviso de quien llama («Guardado»…), para que se lea este
        setTimeout(function () {
          avisar('Otra persona había cambiado los datos de la tienda: se ha recargado y se ha guardado tu cambio encima.', { duracion: 6000 });
        }, 0);
      }
      return r;
    });
  }

  // Cambia el estado. Si era el destacado de la portada y se vende, la base de datos deja la portada
  // sin destacado: se recargan los ajustes y r.portadaQuitada lo dice
  function cambiarEstado(id, estado) {
    var eraDestacado = contenido.portada.destacado === id;
    return guardarCampos(id, { estado: estado }).then(function (r) {
      if (!r.ok || estado !== 'vendido' || !eraDestacado) return r;
      return enCola(recargarAjustes).then(function () {
        r.portadaQuitada = contenido.portada.destacado !== id;
        return r;
      });
    });
  }

  // ---------- Fotos en el bucket ----------

  // Sube una foto ya reducida y devuelve su ruta (productos/{ref}/{uuid}.jpg o portada/{uuid}.jpg)
  function subirFoto(blob, ref) {
    var ruta = D.nuevaRutaFoto(ref);
    return S.conSesion(function (tk) { return D.subirFoto(ruta, blob, tk); });
  }

  // Borrar del bucket: si falla, no bloquea (como mucho queda un archivo que no se ve)
  function borrarDelBucket(rutas) {
    var delBucket = (rutas || []).filter(C.esRutaAlmacen);
    if (!delBucket.length) return Promise.resolve();
    return S.conSesion(function (tk) { return D.borrarFotos(delBucket, tk); }).catch(function () {});
  }

  // La foto quitada se borra del bucket pasado el «Deshacer» (y solo si nadie la usa ya)
  var porBorrar = {};
  function enUso(ruta) {
    if (borrador && borrador.fotos.indexOf(ruta) !== -1) return true;
    if (contenido.portada.foto === ruta) return true;
    return contenido.productos.some(function (p) { return p.fotos.indexOf(ruta) !== -1; });
  }
  function borrarLuego(ruta) {
    if (!C.esRutaAlmacen(ruta)) return;
    clearTimeout(porBorrar[ruta]);
    porBorrar[ruta] = setTimeout(function () {
      delete porBorrar[ruta];
      if (!enUso(ruta)) borrarDelBucket([ruta]);
    }, 6500);
  }
  function noBorrar(ruta) { clearTimeout(porBorrar[ruta]); delete porBorrar[ruta]; }

  function errorCampo(id, texto) {
    var e = $(id + '-error');
    var campo = $(id);
    if (!e || !campo) return;
    e.hidden = !texto;
    if (texto) e.textContent = texto;
    if (texto) campo.setAttribute('aria-invalid', 'true');
    else campo.removeAttribute('aria-invalid');
  }

  // ---------- Confirmación (diálogo propio) ----------

  function confirmar(o) {
    var d = $('confirmar');
    if (d.open) return Promise.resolve(false);
    return new Promise(function (resolver) {
      var si = $('confirmar-si');
      var no = $('confirmar-no');
      $('confirmar-texto').textContent = o.texto;
      $('confirmar-detalle').textContent = o.detalle || '';
      si.textContent = o.si;
      no.textContent = o.no || 'No, volver';
      si.classList.toggle('boton--peligro-lleno', !!o.peligro);
      si.classList.toggle('boton--noche', !o.peligro);
      var foco = document.activeElement;
      function cerrar(valor) {
        si.removeEventListener('click', alSi);
        no.removeEventListener('click', alNo);
        d.removeEventListener('cancel', alNo);
        d.removeEventListener('click', alFuera);
        if (d.open) d.close();
        if (foco && foco.isConnected) foco.focus();
        resolver(valor);
      }
      function alSi() { cerrar(true); }
      function alNo(e) { if (e) e.preventDefault(); cerrar(false); }
      function alFuera(e) { if (e.target === d) cerrar(false); }
      si.addEventListener('click', alSi);
      no.addEventListener('click', alNo);
      d.addEventListener('cancel', alNo);
      d.addEventListener('click', alFuera);
      d.showModal();
      no.focus();
    });
  }

  // ---------- Pestañas ----------

  var pestanas = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function abrirPestana(boton, enfocar) {
    pestanas.forEach(function (b) {
      var activa = b === boton;
      b.setAttribute('aria-selected', activa ? 'true' : 'false');
      b.tabIndex = activa ? 0 : -1;
      $(b.getAttribute('aria-controls')).hidden = !activa;
    });
    if (enfocar) boton.focus();
    try { history.replaceState(null, '', '#' + boton.id.slice(2)); } catch (e) { /* sin historial */ }
  }
  pestanas.forEach(function (b, i) {
    b.addEventListener('click', function () { abrirPestana(b); });
    b.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % pestanas.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + pestanas.length) % pestanas.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = pestanas.length - 1;
      if (j !== null) { e.preventDefault(); abrirPestana(pestanas[j], true); }
    });
  });
  var inicial = $('t-' + (location.hash || '').slice(1));
  if (inicial && inicial.getAttribute('role') === 'tab') abrirPestana(inicial);
  // Si cambia el ancla (#confianza, #horario…), se abre esa pestaña
  window.addEventListener('hashchange', function () {
    var b = $('t-' + (location.hash || '').slice(1));
    if (b && b.getAttribute('role') === 'tab') abrirPestana(b);
  });

  // ---------- Productos: lista ----------

  // Icono del sprite de admin.html (<symbol id="i-…">)
  function icono(nombre) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'icono');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#i-' + nombre);
    s.appendChild(u);
    return s;
  }

  function sinFoto(p) {
    var m = el('span', 'item__marcador');
    m.appendChild(icono('cat-' + (C.CATEGORIAS[p.categoria] ? p.categoria : 'sofas')));
    m.appendChild(el('span', 'item__sin-foto', 'Sin foto'));
    return m;
  }

  // La foto grande de la tarjeta, con la pastilla de la etiqueta y la franja de reservado o vendido (como en la web)
  function miniatura(p) {
    var caja = el('div', 'item__foto');
    var foto = C.fotoPrincipal(p);
    if (foto) {
      var img = el('img');
      img.src = srcFoto(foto);
      img.alt = '';
      img.width = 400;
      img.height = 400;
      img.loading = 'lazy';
      img.decoding = 'async';
      // Si la foto ya no está (p. ej. se borró del bucket), «Sin foto» en su lugar
      E.siFalla(img, function (i) { if (i.parentNode) i.parentNode.replaceChild(sinFoto(p), i); });
      caja.appendChild(img);
    } else {
      caja.appendChild(sinFoto(p));
    }
    if (p.etiqueta) caja.appendChild(el('span', 'pastilla pastilla--' + p.etiqueta, C.ETIQUETAS[p.etiqueta]));
    if (p.estado !== 'disponible') caja.appendChild(el('span', 'producto__sello item__sello--' + p.estado, C.ESTADOS[p.estado]));
    return caja;
  }

  function botonAccion(texto, accion, p, clase, ico) {
    var b = el('button', 'accion' + (clase ? ' ' + clase : ''));
    b.type = 'button';
    b.dataset.accion = accion;
    b.dataset.id = p.id;
    b.setAttribute('aria-label', texto + ': ' + p.nombre);
    if (ico) b.appendChild(icono(ico));
    b.appendChild(el('span', 'accion__texto', texto));
    return b;
  }

  // Resumen de arriba: «7 productos · 1 reservado · 3 en oferta» (de lo que está en la web). «En oferta»: etiqueta
  // «Oferta» o precio rebajado. Reservados y ofertas solo salen si hay alguno
  function pintarResumen(enWeb) {
    var ul = $('resumen');
    if (!ul) return;
    var reservados = enWeb.filter(function (p) { return p.estado === 'reservado'; }).length;
    var ofertas = enWeb.filter(function (p) { return p.etiqueta === 'oferta' || p.precioAntes !== null; }).length;
    ul.textContent = '';
    [
      [enWeb.length, enWeb.length === 1 ? 'producto' : 'productos', 'total'],
      [reservados, reservados === 1 ? 'reservado' : 'reservados', 'reservado'],
      [ofertas, 'en oferta', 'oferta']
    ].forEach(function (x, i) {
      if (i > 0 && !x[0]) return;
      var li = el('li', 'resumen__dato resumen__dato--' + x[2]);
      li.appendChild(el('strong', 'resumen__cifra', String(x[0])));
      li.appendChild(el('span', 'resumen__texto', ' ' + x[1]));
      ul.appendChild(li);
    });
  }

  function pintarLista(enfoque) {
    var lista = $('lista');
    var vacia = $('lista-vacia');
    // Si el foco está en un botón de la lista, se recupera después de repintar
    var activo = document.activeElement;
    if (!enfoque && activo && lista.contains(activo) && activo.dataset.id) {
      enfoque = { id: activo.dataset.id, accion: activo.dataset.accion };
    }
    var enWeb = contenido.productos.filter(function (p) { return p.estado !== 'vendido'; });
    var vendidos = contenido.productos.filter(function (p) { return p.estado === 'vendido'; });
    $('cuenta-web').textContent = enWeb.length;
    $('cuenta-vendidos').textContent = vendidos.length;
    pintarResumen(enWeb);
    Array.prototype.forEach.call(document.querySelectorAll('[data-vista]'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.vista === vista ? 'true' : 'false');
    });

    var elegidos = vista === 'web' ? enWeb : vendidos;
    lista.textContent = '';
    elegidos.forEach(function (p) {
      var li = el('li', 'item item--' + p.estado);
      li.appendChild(miniatura(p));

      var datos = el('div', 'item__datos');
      var nombre = el('p', 'item__nombre', p.nombre);
      nombre.title = p.nombre;
      datos.appendChild(nombre);
      var precio = E.crearPrecio(p);
      precio.classList.add('item__precio');
      datos.appendChild(precio);
      li.appendChild(datos);

      var acciones = el('div', 'item__acciones');
      if (p.estado === 'vendido') {
        acciones.appendChild(botonAccion('Volver a la venta', 'recuperar', p, 'accion--ancha accion--fila', 'volver'));
        acciones.appendChild(botonAccion('Editar', 'editar', p, 'accion--ancha accion--fila', 'editar'));
      } else {
        acciones.appendChild(p.estado === 'reservado'
          ? botonAccion('Quitar reserva', 'reserva', p, 'accion--reservado', 'quitar-reserva')
          : botonAccion('Reservar', 'reserva', p, null, 'reservar'));
        acciones.appendChild(botonAccion('Vender', 'vendido', p, null, 'vendido'));
        acciones.appendChild(botonAccion('Editar', 'editar', p, 'accion--ancha accion--fila', 'editar'));
      }
      li.appendChild(acciones);
      lista.appendChild(li);
    });

    vacia.hidden = elegidos.length > 0;
    vacia.textContent = vista === 'web'
      ? 'Aún no hay productos.'
      : 'No hay productos vendidos.';

    if (enfoque) {
      var b = enfoque.id && lista.querySelector('[data-id="' + enfoque.id + '"][data-accion="' + enfoque.accion + '"]');
      (b || $('anadir')).focus();
    }
    pintarPortadaPanel();
  }

  document.querySelector('.vista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-vista]');
    if (!b) return;
    vista = b.dataset.vista;
    pintarLista();
  });

  $('lista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b) return;
    var id = b.dataset.id;
    var p = buscar(id);
    if (!p) return;

    switch (b.dataset.accion) {
      case 'reserva':
        var nuevo = p.estado === 'reservado' ? 'disponible' : 'reservado';
        cambiarEstado(id, nuevo).then(function (r) {
          if (r.ok) avisar((nuevo === 'reservado' ? 'Reservado: ' : 'Disponible otra vez: ') + p.nombre);
          pintarLista({ id: id, accion: 'reserva' });
        });
        break;
      case 'vendido':
        var antes = p.estado;
        cambiarEstado(id, 'vendido').then(function (r) {
          if (r.ok) {
            var sinPortada = r.portadaQuitada;
            avisar('Vendido: ' + p.nombre + '. Ya no se ve en la web' + (sinPortada ? ' ni en la portada.' : '.'), {
              accion: {
                texto: 'Deshacer',
                hacer: function () {
                  guardarCampos(id, { estado: antes }).then(function (d) {
                    if (!d.ok) { pintarLista(); return d; }
                    return (sinPortada ? guardarAjustes(function (c) { c.portada.destacado = id; }) : Promise.resolve(d)).then(function () {
                      avisar('Deshecho: ' + p.nombre + ' vuelve a la web.');
                      pintarLista();
                    });
                  });
                }
              }
            });
          }
          pintarLista({ id: '', accion: '' });
        });
        break;
      case 'recuperar':
        cambiarEstado(id, 'disponible').then(function (r) {
          if (r.ok) avisar('De vuelta en la web: ' + p.nombre);
          pintarLista({ id: '', accion: '' });
        });
        break;
      case 'editar':
        abrirFicha(p);
        break;
    }
  });

  // ---------- Ficha de producto ----------

  var ficha = $('ficha');
  var form = $('ficha-form');
  var borrador = null;     // el producto que se está editando
  var esNuevo = false;
  var fotoTrabajando = false;

  function radio(nombre, valor) {
    var r = form.querySelector('input[name="' + nombre + '"][value="' + valor + '"]');
    if (r) r.checked = true;
  }
  function valorRadio(nombre) {
    var r = form.querySelector('input[name="' + nombre + '"]:checked');
    return r ? r.value : '';
  }
  function textoNumero(n) { return n === null ? '' : String(n).replace('.', ','); }
  function leerPrecio(texto) { return C.numero(texto.replace(/€/g, '').trim()); }

  // Hasta 4 fotos: la grande es la principal; debajo, la lista con «Hacer principal» y «Quitar»
  // enfoque: { i, accion } para devolver el foco al botón equivalente tras repintar
  function pintarFotos(enfoque) {
    var fotos = borrador.fotos;
    var img = $('foto-img');
    var hay = fotos.length > 0;
    var lleno = fotos.length >= C.LIMITES.fotos;
    img.hidden = !hay;
    if (hay) img.src = srcFoto(fotos[0]);
    else img.removeAttribute('src');
    $('foto-vacia').hidden = hay;
    $('foto-cambiar').hidden = !hay || lleno;
    $('foto-caja').setAttribute('aria-label', !hay ? 'Hacer una foto del producto'
      : lleno ? 'Foto principal. Ya hay ' + C.LIMITES.fotos + ' fotos' : 'Hacer otra foto del producto');
    $('foto-elegir').hidden = lleno;

    var ol = $('fotos-lista');
    ol.textContent = '';
    ol.hidden = !hay;
    fotos.forEach(function (f, i) {
      var li = el('li', 'foto-item');
      var mini = el('img');
      mini.src = srcFoto(f);
      mini.alt = '';
      mini.width = 56;
      mini.height = 56;
      E.siFalla(mini, function (i) { i.alt = 'No se ve'; i.classList.add('foto-rota'); });
      li.appendChild(mini);
      if (i === 0) {
        li.appendChild(el('span', 'foto-item__principal', 'Principal'));
      } else {
        var b = el('button', 'boton boton--linea foto-item__hacer', 'Hacer principal');
        b.type = 'button';
        b.dataset.foto = i;
        b.dataset.accion = 'principal';
        b.setAttribute('aria-label', 'Hacer principal la foto ' + (i + 1));
        li.appendChild(b);
      }
      // «Quitar»: una papelera apartada a la derecha (con «Deshacer» en el aviso)
      var q = el('button', 'foto-item__quitar');
      q.type = 'button';
      q.dataset.foto = i;
      q.dataset.accion = 'quitar';
      q.title = 'Quitar';
      q.setAttribute('aria-label', 'Quitar foto ' + (i + 1));
      q.appendChild(iconoPapelera());
      li.appendChild(q);
      ol.appendChild(li);
    });
    // «Grande en la portada» necesita una foto (si ya estaba puesto, se puede quitar igualmente)
    var portada = $('f-portada');
    portada.disabled = !hay && !portada.checked;
    $('f-portada-nota').hidden = !portada.disabled;
    if (enfoque) {
      var destino = ol.querySelector('[data-foto="' + enfoque.i + '"][data-accion="' + enfoque.accion + '"]') ||
        ol.querySelector('[data-accion="quitar"]') || $('foto-caja');
      destino.focus();
    }
  }

  function iconoPapelera() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6'].forEach(function (d) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }

  function pintarPrevia() {
    if (!borrador) return;
    var ul = $('ficha-previa');
    ul.textContent = '';
    var p = C.normalizarProducto(copiar(borrador), {});
    if (!p) p = C.normalizarProducto(Object.assign(copiar(borrador), { nombre: 'Nombre del producto' }), {});
    p.id = borrador.id;
    // En uno nuevo, si cambia la categoría cambia la ref: sus fotos se mueven a la ref nueva al añadirlo
    p.fotos = borrador.fotos.filter(C.fotoValida).slice(0, C.LIMITES.fotos);
    ul.appendChild(window.Escaparate.crearTarjeta(p, contenido.tienda));
    // El enlace a la ficha de la web, solo si ya está guardado y se ve en la web
    var guardado = !esNuevo && buscar(borrador.id);
    var ver = $('ficha-ver');
    ver.hidden = !guardado || guardado.estado === 'vendido';
    ver.href = 'index.html#p/' + encodeURIComponent(borrador.id);
  }

  // Lee el formulario al borrador. Devuelve la lista de campos con error (vacía = todo bien).
  function leerFicha() {
    if (!borrador) return ['cerrada'];
    var errores = [];
    borrador.nombre = $('f-nombre').value.replace(/\s+/g, ' ').trim();
    borrador.categoria = valorRadio('categoria') || 'sofas';
    if (esNuevo && borrador.id.slice(0, 3) !== C.nuevoId(borrador.categoria, {}).slice(0, 3)) {
      var usados = {};
      contenido.productos.forEach(function (x) { usados[x.id] = true; });
      borrador.id = C.nuevoId(borrador.categoria, usados);
      $('ficha-ref').textContent = 'Ref. ' + borrador.id;
    }
    borrador.etiqueta = valorRadio('etiqueta');
    borrador.descripcion = $('f-descripcion').value.replace(/\s+/g, ' ').trim();
    borrador.destacado = $('f-destacado').checked;
    // Más detalles (opcional). La firmeza solo se pregunta en los colchones, pero se conserva si se cambia
    borrador.descripcionLarga = $('f-larga').value;
    borrador.medidas = $('f-medidas').value.replace(/\s+/g, ' ').trim();
    borrador.colores = $('f-colores').value.replace(/\s+/g, ' ').trim();
    borrador.firmeza = valorRadio('firmeza');
    borrador.aMedida = $('f-amedida').checked;
    borrador.plazo = $('f-plazo').value.replace(/\s+/g, ' ').trim();
    $('f-firmeza-caja').hidden = borrador.categoria !== 'colchones';
    contar($('f-larga'), $('f-larga-cuenta'), C.LIMITES.descripcionLarga);

    var tp = $('f-precio').value.trim();
    var precio = tp === '' ? null : leerPrecio(tp);
    if (tp !== '' && precio === null) {
      errorCampo('f-precio', /^[.,]/.test(tp)
        ? 'Escribe el número entero delante, por ejemplo 0,50 o 299.'
        : 'Escribe solo el número, por ejemplo 299 o 299,90.');
      errores.push('f-precio');
    } else {
      errorCampo('f-precio', '');
      borrador.precio = precio !== null && precio <= 0 ? null : precio;
    }

    var ta = $('f-antes').value.trim();
    var antes = ta === '' ? null : leerPrecio(ta);
    if (ta !== '' && antes === null) {
      errorCampo('f-antes', 'Escribe solo el número.');
      errores.push('f-antes');
    } else if (antes !== null && (borrador.precio === null || antes <= borrador.precio)) {
      errorCampo('f-antes', 'Tiene que ser más alto que el precio de ahora.');
      errores.push('f-antes');
    } else {
      errorCampo('f-antes', '');
      borrador.precioAntes = antes;
    }

    if (!borrador.nombre) errores.unshift('f-nombre');
    errorCampo('f-nombre', !borrador.nombre && $('f-nombre').dataset.tocado ? 'Escribe cómo se llama el producto.' : '');
    contar($('f-descripcion'), $('f-descripcion-cuenta'), 140);
    return errores;
  }

  function mostrarErrores(errores) {
    $('f-nombre').dataset.tocado = '1';
    leerFicha();
    $('ficha-error').textContent = errores[0] === 'f-nombre'
      ? 'Falta el nombre del producto.'
      : 'Revisa lo que está marcado en rojo.';
    if (errores[0] === 'f-antes') $('f-antes-caja').open = true;
    $(errores[0]).focus();
  }

  // Pone en el formulario los datos de p. Con respetarFoco, no toca el campo que se está escribiendo
  function rellenarFicha(p, respetarFoco) {
    var foco = respetarFoco ? document.activeElement : null;
    function poner(id, prop, valor) { if ($(id) !== foco) $(id)[prop] = valor; }
    function radioSi(nombre, valor) {
      if (foco && foco.name === nombre) return;
      radio(nombre, valor);
    }
    poner('f-nombre', 'value', p.nombre);
    radioSi('categoria', p.categoria);
    radioSi('etiqueta', p.etiqueta);
    poner('f-precio', 'value', textoNumero(p.precio));
    poner('f-antes', 'value', textoNumero(p.precioAntes));
    poner('f-destacado', 'checked', p.destacado);
    poner('f-descripcion', 'value', p.descripcion);
    poner('f-larga', 'value', p.descripcionLarga);
    poner('f-medidas', 'value', p.medidas);
    poner('f-colores', 'value', p.colores);
    radioSi('firmeza', p.firmeza);
    poner('f-amedida', 'checked', p.aMedida);
    poner('f-plazo', 'value', p.plazo);
    poner('f-portada', 'checked', !esNuevo && contenido.portada.destacado === p.id);
    $('f-portada-caja').hidden = p.estado === 'vendido';
  }

  // Otra persona ha cambiado el producto abierto: se trae lo suyo (sin tocar el campo que se escribe)
  function refrescarFicha() {
    if (!ficha.open || !borrador || esNuevo) return;
    var x = buscar(borrador.id);
    if (!x) { cerrarFicha(); return; }
    alAbrir = copiar(x);
    borrador.fotos = copiar(x.fotos);
    borrador.estado = x.estado;
    rellenarFicha(x, true);
    leerFicha();
    pintarFotos();
    pintarPrevia();
  }

  var huellas = {};    // huella de cada foto subida en esta ficha → su ruta (para no subir la misma dos veces)
  var blobsNuevo = {}; // en un producto nuevo: ruta → la foto, por si hay que subirla con otra ref

  function abrirFicha(p) {
    esNuevo = !p;
    alAbrir = p ? copiar(p) : null;
    huellas = {};
    blobsNuevo = {};
    var usados = {};
    contenido.productos.forEach(function (x) { usados[x.id] = true; });
    borrador = p ? copiar(p) : {
      id: C.nuevoId('sofas', usados), nombre: '', categoria: 'sofas', precio: null, precioAntes: null,
      etiqueta: '', estado: 'disponible', fotos: [], descripcion: '', destacado: false,
      descripcionLarga: '', medidas: '', colores: '', firmeza: '', aMedida: false, plazo: ''
    };
    $('ficha-titulo').textContent = esNuevo ? 'Nuevo producto' : 'Editar producto';
    $('ficha-ref').textContent = 'Ref. ' + borrador.id;
    delete $('f-nombre').dataset.tocado;
    rellenarFicha(borrador, false);
    $('f-antes-caja').open = borrador.precioAntes !== null;
    // Plegado en el alta rápida; abierto si ya tiene algún detalle
    $('f-mas').open = !!(borrador.descripcionLarga || borrador.medidas || borrador.colores ||
      borrador.firmeza || borrador.aMedida || borrador.plazo);
    $('ficha-guardar').disabled = false;
    $('foto-estado').textContent = '';
    $('ficha-error').textContent = '';
    $('ficha-cancelar').hidden = !esNuevo;
    $('ficha-borrar').hidden = esNuevo;
    $('ficha-nota').hidden = esNuevo;
    $('ficha-guardar').textContent = esNuevo ? 'Añadir a la web' : 'Guardar y cerrar';
    leerFicha();
    pintarFotos();
    pintarPrevia();
    ficha.showModal();
    $('f-nombre').focus();
  }

  // descartar: un producto nuevo que no se añade (sus fotos ya subidas se borran del bucket)
  function cerrarFicha(descartar) {
    clearTimeout(temporizadorFicha);
    if (ficha.open) ficha.close();
    if (descartar === true && esNuevo && borrador) borrarDelBucket(borrador.fotos);
    blobsNuevo = {};
    borrador = null;
    pintarLista();
    var b = $('anadir');
    if (b) b.focus();
  }

  // Al editar uno que ya existe, cada cambio correcto se guarda solo
  var temporizadorFicha;
  // Campos de la ficha. Al guardar solo se escriben los que se han cambiado en ESTA pestaña desde que se
  // abrió la ficha (comparando con alAbrir), sobre lo último guardado: así no se pisa lo que otra
  // pestaña haya cambiado en ese producto (fotos, precio…). El estado (reservado/vendido) no se toca.
  var CAMPOS_FICHA = ['nombre', 'categoria', 'precio', 'precioAntes', 'etiqueta', 'fotos', 'descripcion', 'destacado',
    'descripcionLarga', 'medidas', 'colores', 'firmeza', 'aMedida', 'plazo'];
  var alAbrir = null;  // el producto tal como estaba al abrir la ficha (o tras el último guardado de esta pestaña)

  // El borrador tal como se guardaría (con los textos ya limpios, como los acepta la base de datos)
  function borradorLimpio() {
    var p = C.normalizarProducto(copiar(borrador), {});
    if (p) { p.id = borrador.id; p.fotos = C.normalizarFotos(borrador.fotos, borrador.id); }
    return p;
  }

  // Guarda en la base de datos los campos cambiados de la ficha abierta. Devuelve una promesa
  // con { ok } o { ok: false, errores } si hay algo en rojo
  function guardarEdicion() {
    clearTimeout(temporizadorFicha);
    if (esNuevo || !borrador) return Promise.resolve({ ok: true });
    var errores = leerFicha();
    if (errores.length) return Promise.resolve({ ok: false, errores: errores });
    var limpio = borradorLimpio();
    var cambiados = CAMPOS_FICHA.filter(function (k) { return JSON.stringify(limpio[k]) !== JSON.stringify(alAbrir[k]); });
    // Sin cambios: se espera a que acabe lo que se esté guardando
    if (!cambiados.length) return enCola(function () { return { ok: true }; });
    var id = borrador.id;
    var campos = {};
    cambiados.forEach(function (k) { campos[k] = limpio[k]; });
    return guardarCampos(id, campos).then(function (r) {
      if (!borrador || borrador.id !== id) return r;
      if (r.ok) {
        var guardado = buscar(id);
        cambiados.forEach(function (k) { alAbrir[k] = guardado ? copiar(guardado[k]) : campos[k]; });
        $('ficha-error').textContent = '';
      } else {
        $('ficha-error').textContent = r.motivo === 'conflicto' ? MENSAJE_CONFLICTO
          : r.motivo === 'falta' ? MENSAJE_FALTA : textoError(r.error);
      }
      return r;
    });
  }

  function tieneAlgo() {
    return !!($('f-nombre').value.trim() || $('f-precio').value.trim() || $('f-antes').value.trim() ||
      $('f-descripcion').value.trim() || $('f-larga').value.trim() || $('f-medidas').value.trim() ||
      $('f-colores').value.trim() || $('f-plazo').value.trim() || $('f-amedida').checked || valorRadio('firmeza') ||
      (borrador && borrador.fotos.length));
  }

  // Cerrar con la X, «Cancelar», Esc o tocando fuera
  function cancelarFicha() {
    if (!borrador || $('confirmar').open || cerrando) return;
    if (fotoTrabajando) { $('ficha-error').textContent = 'Espera un momento: se está subiendo la foto.'; return; }
    if (esNuevo) {
      if (!tieneAlgo()) { cerrarFicha(true); return; }
      confirmar({
        texto: '¿Descartar este producto?', detalle: 'Se pierde lo que has puesto en la ficha.',
        si: 'Sí, descartar', no: 'Seguir con la ficha', peligro: true
      }).then(function (si) { if (si) cerrarFicha(true); });
      return;
    }
    var errores = leerFicha();
    if (errores.length) {
      mostrarErrores(errores);
      confirmar({
        texto: 'Hay un dato sin corregir', detalle: 'Lo marcado en rojo no se puede guardar. Si sales ahora, ese cambio se pierde.',
        si: 'Salir sin ese cambio', no: 'Corregirlo', peligro: true
      }).then(function (si) {
        if (si) cerrarFicha();
        else $(errores[0]).focus();
      });
      return;
    }
    // Se espera a que se guarde: si falla, la ficha sigue abierta con lo escrito
    var id = borrador.id;
    var nombre = borrador.nombre;
    cerrando = true;
    $('ficha-guardar').disabled = true;
    guardarEdicion().then(function (r) {
      cerrando = false;
      $('ficha-guardar').disabled = false;
      if (!borrador || borrador.id !== id) return;
      if (r.ok) { cerrarFicha(); avisar('Guardado: ' + nombre); }
    });
  }
  var cerrando = false;

  form.addEventListener('input', function (e) {
    if (e.target.type === 'file' || !borrador) return;
    if (e.target.id === 'f-nombre') e.target.dataset.tocado = '1';
    leerFicha();
    pintarPrevia();
    clearTimeout(temporizadorFicha);
    temporizadorFicha = setTimeout(guardarEdicion, 500);
  });

  // En un producto nuevo las fotos se suben con la ref que tenía al hacerlas. Si al añadirlo la ref es
  // otra (cambió la categoría, u otra persona cogió esa ref a la vez), se vuelven a subir con la buena
  // y se borran las de antes. Resuelve la lista de rutas buenas.
  function alinearFotos(fotos, ref) {
    var buenas = [];
    var viejas = [];
    return fotos.reduce(function (paso, ruta) {
      return paso.then(function () {
        if (C.fotoDeProducto(ruta, ref)) { buenas.push(ruta); return; }
        var blob = blobsNuevo[ruta];
        if (!blob) return; // no debería pasar: sin el archivo no se puede mover, se queda fuera
        return subirFoto(blob, ref).then(function (nueva) {
          blobsNuevo[nueva] = blob;
          buenas.push(nueva);
          viejas.push(ruta);
        });
      });
    }, Promise.resolve()).then(function () {
      borrarDelBucket(viejas);
      return buenas;
    });
  }

  // Alta: se busca una ref libre (contando también las vendidas), se colocan las fotos y se crea la
  // fila. Si otra persona ha creado esa ref justo a la vez (23505), se prueba con la siguiente
  function anadirNuevo() {
    var nuevo = copiar(borrador);
    var enPortada = $('f-portada').checked;
    var usadosServidor = {};
    cerrando = true;
    $('ficha-guardar').disabled = true;
    $('ficha-error').textContent = '';
    $('foto-estado').textContent = 'Añadiendo…';
    function intento(veces) {
      return S.conSesion(function (tk) { return D.referencias(tk); }).then(function (refs) {
        var usados = {};
        refs.forEach(function (r) { usados[r] = true; });
        Object.keys(usadosServidor).forEach(function (r) { usados[r] = true; });
        contenido.productos.forEach(function (x) { usados[x.id] = true; });
        var prefijo = C.nuevoId(nuevo.categoria, {}).slice(0, 3);
        if (usados[nuevo.id] || nuevo.id.slice(0, 3) !== prefijo) nuevo.id = C.nuevoId(nuevo.categoria, usados);
        return alinearFotos(nuevo.fotos, nuevo.id);
      }).then(function (fotos) {
        nuevo.fotos = fotos;
        if (borrador) { borrador.id = nuevo.id; borrador.fotos = fotos.slice(); $('ficha-ref').textContent = 'Ref. ' + nuevo.id; }
        var limpio = C.normalizarProducto(copiar(nuevo), {});
        limpio.id = nuevo.id;
        return enCola(function () {
          return S.conSesion(function (tk) { return D.crearProducto(limpio, tk); });
        });
      }).catch(function (e) {
        if (e && e.tipo === 'duplicado' && veces < 4) {
          usadosServidor[nuevo.id] = true;
          return intento(veces + 1);
        }
        throw e;
      });
    }
    intento(0).then(function (fila) {
      ponerFila(fila);
      var hecho = enPortada ? guardarAjustes(function (c) { c.portada.destacado = fila.ref; }) : Promise.resolve();
      return hecho.then(function () {
        avisarGuardado(true);
        vista = 'web';
        blobsNuevo = {};
        cerrando = false;
        cerrarFicha();
        avisar('Añadido a la web: ' + nuevo.nombre);
      });
    }).catch(function (e) {
      cerrando = false;
      $('ficha-guardar').disabled = false;
      $('foto-estado').textContent = '';
      $('ficha-error').textContent = textoError(e);
      avisarGuardado(false);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!borrador || cerrando) return;
    if (fotoTrabajando) { $('ficha-error').textContent = 'Espera un momento: se está subiendo la foto.'; return; }
    var errores = leerFicha();
    if (errores.length) { mostrarErrores(errores); return; }
    if (!esNuevo) { cancelarFicha(); return; }
    if (contenido.productos.length >= C.LIMITES.productos) {
      $('ficha-error').textContent = 'Has llegado al máximo de ' + C.LIMITES.productos + ' productos. Borra alguno vendido para añadir otro.';
      return;
    }
    if (!borrador.fotos.length) {
      confirmar({
        texto: '¿Añadirlo sin foto?', detalle: 'Saldrá un cartel con un dibujo. Puedes ponerle la foto más tarde.',
        si: 'Sí, añadir sin foto', no: 'Hacer la foto'
      }).then(function (si) {
        if (si) anadirNuevo();
        else $('foto-camara').click();
      });
      return;
    }
    anadirNuevo();
  });

  $('ficha-cancelar').addEventListener('click', cancelarFicha);
  $('ficha-cerrar').addEventListener('click', cancelarFicha);
  ficha.addEventListener('cancel', function (e) { e.preventDefault(); cancelarFicha(); });
  ficha.addEventListener('click', function (e) { if (e.target === ficha) cancelarFicha(); });

  $('ficha-borrar').addEventListener('click', function () {
    if (!borrador || esNuevo) return;
    var id = borrador.id;
    var nombre = borrador.nombre || 'este producto';
    confirmar({
      texto: '¿Borrar «' + nombre + '»?', detalle: 'Se borra para siempre. Si solo lo has vendido, mejor «Marcar vendido».',
      si: 'Sí, borrar', no: 'No, volver', peligro: true
    }).then(function (si) {
      if (!si) return;
      var eraDestacado = contenido.portada.destacado === id;
      $('guardado').textContent = 'Guardando…';
      $('guardado').dataset.estado = 'pendiente';
      enCola(function () {
        if (!meta.productos[id]) return { ok: false, motivo: 'falta' };
        return S.conSesion(function (tk) { return D.borrarProducto(id, meta.productos[id], tk); }).then(function (fila) {
          if (!fila) return recargarProducto(id).then(function (sigue) { return { ok: false, motivo: sigue ? 'conflicto' : 'falta' }; });
          ponerFila(null, id);
          // Sus fotos, del bucket (las de la fila y cualquier otra que hubiera en su carpeta)
          var rutas = (fila.fotos || []).slice();
          S.conSesion(function (tk) { return D.listarFotos('productos/' + id, tk); }).then(function (otras) {
            return borrarDelBucket(rutas.concat(otras));
          }, function () { return borrarDelBucket(rutas); });
          return (eraDestacado ? recargarAjustes() : Promise.resolve()).then(function () { return { ok: true }; });
        }, function (e) { return { ok: false, motivo: 'error', error: e }; });
      }).then(function (r) {
        if (!r.ok) { informarFallo(r); return; }
        avisarGuardado(true);
        cerrarFicha();
        avisar('Borrado: ' + nombre + (eraDestacado && !contenido.portada.destacado ? '. La portada queda sin destacado.' : ''));
      });
    });
  });

  // ---------- Foto: se reduce a 900 px de lado, en JPEG, y se sube al bucket ----------

  function lienzoABlob(lienzo, calidad) {
    return new Promise(function (resolver) { lienzo.toBlob(resolver, 'image/jpeg', calidad); });
  }

  // JPEG al 80 %; si pasara de ~590 KB (el bucket admite 600), se baja la calidad y, si aún no
  // cabe, el tamaño
  function prepararFoto(archivo) {
    return new Promise(function (resolver, rechazar) {
      if (!archivo || !/^image\//.test(archivo.type)) { rechazar(new Error('tipo')); return; }
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var lado = Math.max(img.naturalWidth, img.naturalHeight);
        var calidad = 0.8;
        var maximo = 900;
        function probar() {
          var escala = Math.min(1, maximo / lado);
          var lienzo = document.createElement('canvas');
          lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
          lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
          var ctx = lienzo.getContext('2d');
          ctx.fillStyle = '#ffffff';            // fondo blanco para PNG con transparencias
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
          return lienzoABlob(lienzo, calidad).then(function (blob) {
            if (!blob) throw new Error('formato');
            if (blob.size <= MAX_FOTO) return blob;
            if (calidad > 0.45) calidad -= 0.1;
            else if (maximo > 400) maximo -= 150;
            else throw new Error('grande');
            return probar();
          });
        }
        probar().then(resolver, rechazar);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rechazar(new Error('abrir')); };
      img.src = url;
    });
  }

  // Huella de la foto (para no subir la misma dos veces); '' si el navegador no sabe calcularla
  function huella(blob) {
    if (!window.crypto || !window.crypto.subtle || typeof blob.arrayBuffer !== 'function') return Promise.resolve('');
    return blob.arrayBuffer().then(function (b) { return window.crypto.subtle.digest('SHA-256', b); }).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }, function () { return ''; });
  }

  function textoFalloFoto(e) {
    if (e && e.message === 'grande') return 'Esa foto es demasiado grande. Prueba con otra.';
    if (e && (e.message === 'tipo' || e.message === 'abrir' || e.message === 'formato')) return 'No se ha podido abrir esa foto. Prueba con otra o hazla de nuevo.';
    if (e && e.tipo === 'red') return 'Sin conexión: la foto no se ha subido. Revisa internet y vuelve a intentarlo.';
    if (e && e.tipo === 'tiempo') return 'La foto tarda demasiado en subir. Vuelve a intentarlo.';
    return e && e.tipo && e.mensaje ? e.mensaje : 'No se ha podido subir la foto. Vuelve a intentarlo.';
  }

  // Se pueden elegir varias de la galería: se reducen, se suben y se añaden por orden hasta llegar a 4.
  // En uno que ya existe, cada foto se guarda en el producto al subirla
  function alElegirFoto(e) {
    var input = e.target;
    var archivos = Array.prototype.slice.call(input.files || []);
    input.value = '';
    if (!archivos.length || !borrador || fotoTrabajando) return;
    var sitio = C.LIMITES.fotos - borrador.fotos.length;
    if (sitio <= 0) { $('foto-estado').textContent = 'Ya hay ' + C.LIMITES.fotos + ' fotos. Quita una para poner otra.'; return; }
    var sobran = archivos.length > sitio;
    archivos = archivos.slice(0, sitio);
    var ficha0 = borrador;
    fotoTrabajando = true;
    $('foto-estado').textContent = archivos.length > 1 ? 'Subiendo las fotos…' : 'Subiendo la foto…';
    var hechas = 0;
    var fallo = '';
    function acabar() {
      fotoTrabajando = false;
      if (borrador !== ficha0) return;
      $('foto-estado').textContent = fallo || ((hechas === 1 ? 'Foto lista ✓' : hechas + ' fotos listas ✓') +
        (sobran ? ' Solo caben ' + C.LIMITES.fotos + '.' : ''));
      pintarFotos();
      pintarPrevia();
    }
    function siguiente() {
      if (!archivos.length || fallo || borrador !== ficha0) { acabar(); return; }
      var blob;
      var marca;
      prepararFoto(archivos.shift()).then(function (b) {
        blob = b;
        return huella(blob);
      }).then(function (h) {
        marca = h;
        if (borrador !== ficha0) return null;
        if (h && huellas[h] && borrador.fotos.indexOf(huellas[h]) !== -1) return null; // la misma foto dos veces
        return subirFoto(blob, borrador.id);
      }).then(function (ruta) {
        if (!ruta) return;
        if (borrador !== ficha0) { borrarDelBucket([ruta]); return; }
        if (marca) huellas[marca] = ruta;
        borrador.fotos.push(ruta);
        if (esNuevo) { blobsNuevo[ruta] = blob; hechas++; return; }
        return guardarEdicion().then(function (r) {
          if (r.ok) { hechas++; return; }
          // No se ha podido guardar en el producto: la foto no se queda
          var i = borrador.fotos.indexOf(ruta);
          if (i !== -1) borrador.fotos.splice(i, 1);
          if (!enUso(ruta)) borrarDelBucket([ruta]);
          fallo = r.errores ? 'Corrige lo marcado en rojo para guardar la foto.' : $('ficha-error').textContent || 'No se ha podido guardar la foto.';
        });
      }).then(siguiente, function (err) {
        fallo = textoFalloFoto(err);
        siguiente();
      });
    }
    siguiente();
  }
  $('foto-camara').addEventListener('change', alElegirFoto);
  $('foto-galeria').addEventListener('change', alElegirFoto);
  $('foto-caja').addEventListener('click', function () {
    if (borrador && borrador.fotos.length >= C.LIMITES.fotos) {
      $('foto-estado').textContent = 'Ya hay ' + C.LIMITES.fotos + ' fotos. Quita una para poner otra.';
      return;
    }
    $('foto-camara').click();
  });
  $('foto-elegir').addEventListener('click', function () { $('foto-galeria').click(); });
  // «Destacar en portada»: solo uno a la vez. En un producto nuevo se aplica al añadirlo
  $('f-portada').addEventListener('change', function () {
    if (!borrador || esNuevo) return;
    var id = borrador.id;
    var nombre = borrador.nombre;
    var si = $('f-portada').checked;
    guardarAjustes(function (c) {
      if (!enCopia(c, id)) return false;
      if (si) c.portada.destacado = id;
      else if (c.portada.destacado === id) c.portada.destacado = '';
    }).then(function (r) {
      if (r.ok) avisar(si ? 'En la portada: ' + nombre : 'Quitado de la portada');
      if (borrador && borrador.id === id) $('f-portada').checked = contenido.portada.destacado === id;
      pintarPortadaPanel();
    });
  });
  $('fotos-lista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b || !borrador) return;
    var i = parseInt(b.dataset.foto, 10);
    var foto = borrador.fotos[i];
    if (!foto) return;
    if (b.dataset.accion === 'principal') {
      borrador.fotos.splice(i, 1);
      borrador.fotos.unshift(foto);
      $('foto-estado').textContent = 'Foto principal cambiada ✓';
      guardarEdicion();
      pintarFotos({ i: 1, accion: 'principal' });
    } else {
      borrador.fotos.splice(i, 1);
      $('foto-estado').textContent = '';
      // Primero se guarda el producto sin ella; el archivo se borra del bucket pasado el «Deshacer»
      guardarEdicion();
      pintarFotos({ i: Math.min(i, borrador.fotos.length - 1), accion: 'quitar' });
      borrarLuego(foto);
      deshacerQuitarFoto(borrador.id, esNuevo, foto, i);
    }
    pintarPrevia();
  });

  // «Foto quitada · Deshacer»: la vuelve a poner en su sitio (en la ficha abierta o, si ya se cerró, en el producto)
  function deshacerQuitarFoto(id, eraNuevo, foto, i) {
    avisar('Foto quitada', {
      accion: {
        texto: 'Deshacer',
        hacer: function () {
          if (borrador && borrador.id === id) {
            if (borrador.fotos.length >= C.LIMITES.fotos || borrador.fotos.indexOf(foto) !== -1) return;
            noBorrar(foto);
            borrador.fotos.splice(Math.min(i, borrador.fotos.length), 0, foto);
            guardarEdicion();
            pintarFotos();
            pintarPrevia();
            avisar('Foto recuperada');
          } else if (!eraNuevo) {
            var x = buscar(id);
            if (!x || x.fotos.length >= C.LIMITES.fotos || x.fotos.indexOf(foto) !== -1) return;
            noBorrar(foto);
            var fotos = x.fotos.slice();
            fotos.splice(Math.min(i, fotos.length), 0, foto);
            guardarCampos(id, { fotos: fotos }).then(function (r) {
              if (r.ok) { avisar('Foto recuperada'); pintarLista(); }
              else borrarLuego(foto);
            });
          }
        }
      }
    });
  }

  $('anadir').addEventListener('click', function () {
    if (contenido.productos.length >= C.LIMITES.productos) {
      avisar('Has llegado al máximo de ' + C.LIMITES.productos + ' productos. Borra alguno vendido para poder añadir otro.', { error: true });
      return;
    }
    abrirFicha(null);
  });

  // ---------- Guardado automático de los formularios ----------

  // pendientesForm: cuántos campos esperan su guardado (mientras tanto, lo que llega del servidor
  // no repinta los formularios, para no borrar lo recién escrito)
  var pendientesForm = 0;
  var diferidos = [];  // para guardarlos ya (al cerrar sesión)
  function conRetraso(fn, ms) {
    var t = null;
    function ya() {
      if (t === null) return;
      clearTimeout(t);
      t = null;
      pendientesForm--;
      fn();
    }
    diferidos.push(ya);
    return function () {
      if (t === null) pendientesForm++;
      clearTimeout(t);
      $('guardado').textContent = 'Guardando…';
      $('guardado').dataset.estado = 'pendiente';
      t = setTimeout(ya, ms || 600);
    };
  }
  function guardadoForm(promesa) { return promesa.then(function (r) { if (r.ok) avisar('Guardado'); return r; }); }

  // Corta un texto a N líneas en el propio campo y lo dice junto al campo
  function limitarLineas(campo, max, idError) {
    var lineas = campo.value.split('\n');
    if (lineas.length > max) {
      var pos = campo.selectionStart;
      campo.value = lineas.slice(0, max).join('\n');
      try { campo.setSelectionRange(pos, pos); } catch (e) { /* nada */ }
      errorCampo(idError, 'Como mucho ' + max + ' líneas.');
    } else {
      errorCampo(idError, '');
    }
  }

  // ---------- Aviso ----------

  // respetarFoco: no tocar el campo si se está escribiendo en él; 'nunca': no tocarlo en ningún caso
  function pintarAviso(respetarFoco) {
    var a = contenido.tienda.aviso;
    var campo = $('aviso-texto');
    if (respetarFoco !== 'nunca' && (!respetarFoco || document.activeElement !== campo)) campo.value = a.texto;
    var texto = campo.value.trim();
    var boton = $('aviso-boton');
    boton.textContent = a.activo ? 'Quitar el aviso' : 'Poner el aviso en la web';
    boton.classList.toggle('boton--noche', !a.activo);
    boton.classList.toggle('boton--linea', a.activo);
    var estado = $('aviso-estado');
    estado.textContent = a.activo ? '✓ Se ve en la web' : (texto ? 'Aún no se ve en la web' : '');
    estado.dataset.activo = a.activo ? 'si' : 'no';
    $('aviso-previa-texto').textContent = texto || 'Escribe el texto del aviso';
    contar(campo, $('aviso-cuenta'), 120);
  }
  $('aviso-boton').addEventListener('click', function () {
    var activo = !contenido.tienda.aviso.activo;
    var texto = $('aviso-texto').value.trim();
    if (activo && !texto) {
      errorCampo('aviso-texto', 'Escribe primero el texto del aviso.');
      $('aviso-texto').focus();
      return;
    }
    guardarAjustes(function (c) { c.tienda.aviso = { activo: activo, texto: texto }; }).then(function (r) {
      if (r.ok) avisar(activo ? 'Aviso puesto en la web' : 'Aviso quitado de la web');
      pintarAviso(true);
    });
  });
  var guardarAviso = conRetraso(function () {
    var texto = $('aviso-texto').value.trim();
    var apagado = false;
    guardarAjustes(function (c) {
      c.tienda.aviso.texto = texto;
      if (!texto && c.tienda.aviso.activo) { c.tienda.aviso.activo = false; apagado = true; }
    }).then(function (r) {
      if (r.ok) avisar(apagado ? 'Aviso quitado: se ha quedado sin texto' : 'Guardado');
      pintarAviso('nunca');
    });
  });
  $('aviso-texto').addEventListener('input', function () {
    if ($('aviso-texto').value.trim()) errorCampo('aviso-texto', '');
    pintarAviso('nunca');
    guardarAviso();
  });
  document.querySelector('.rapidos').addEventListener('click', function (e) {
    var b = e.target.closest('[data-texto]');
    if (!b) return;
    var campo = $('aviso-texto');
    campo.value = b.dataset.texto;
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
    campo.dispatchEvent(new Event('input'));
  });

  // ---------- Horario: cada tramo son unos días y uno o dos turnos, o «cerrado» ----------

  var ABREV = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  function campoHora(etiqueta, valor, clase) {
    var l = el('label', 'hora ' + clase);
    l.appendChild(el('span', 'hora__etiqueta', etiqueta));
    var i = el('input');
    i.type = 'time';
    i.step = 300;
    i.value = valor;
    l.appendChild(i);
    return l;
  }

  function casilla(texto, clase, marcada) {
    var l = el('label', 'casilla');
    var c = el('input');
    c.type = 'checkbox';
    c.className = clase;
    c.checked = marcada;
    l.appendChild(c);
    l.appendChild(el('span', null, texto));
    return l;
  }

  function crearTramo(tramo) {
    var dias = C.leerDias(tramo.dias);
    var horas = C.leerHoras(tramo.horas);
    var cerrado = horas.length === 0;
    var li = el('li', 'tramo');

    var fs = el('fieldset', 'tramo__dias');
    fs.appendChild(el('legend', 'campo__etiqueta', 'Días'));
    var fila = el('div', 'dias');
    ABREV.forEach(function (a, d) {
      var l = el('label', 'dia');
      var c = el('input');
      c.type = 'checkbox';
      c.value = d;
      c.checked = dias.indexOf(d) !== -1;
      l.appendChild(c);
      var s = el('span', null, a);
      s.setAttribute('aria-hidden', 'true');
      l.appendChild(s);
      l.appendChild(el('span', 'visualmente-oculto', C.NOMBRES_DIA[d]));
      fila.appendChild(l);
    });
    fs.appendChild(fila);
    li.appendChild(fs);

    li.appendChild(casilla('Cerrado esos días', 'tramo__cerrado', cerrado));

    var abierto = el('div', 'tramo__abierto');
    var t1 = horas[0] || [600, 810];
    var t2 = horas[1] || [1020, 1230];
    var turno1 = el('div', 'turno');
    turno1.appendChild(el('span', 'turno__nombre', 'Abre'));
    turno1.appendChild(campoHora('de', C.hhmm(t1[0]), 't1-abre'));
    turno1.appendChild(campoHora('a', C.hhmm(t1[1]), 't1-cierra'));
    abierto.appendChild(turno1);
    abierto.appendChild(casilla('Cierra a mediodía y vuelve a abrir por la tarde', 'tramo__tarde', horas.length > 1));
    var turno2 = el('div', 'turno turno--tarde');
    turno2.appendChild(el('span', 'turno__nombre', 'Por la tarde'));
    turno2.appendChild(campoHora('de', C.hhmm(t2[0]), 't2-abre'));
    turno2.appendChild(campoHora('a', C.hhmm(t2[1]), 't2-cierra'));
    turno2.hidden = horas.length < 2;
    abierto.appendChild(turno2);
    abierto.hidden = cerrado;
    li.appendChild(abierto);

    li.appendChild(el('p', 'tramo__error', ''));
    var quitar = el('button', 'boton-texto tramo__quitar', 'Quitar este horario');
    quitar.type = 'button';
    li.appendChild(quitar);
    return li;
  }

  function minutos(v) {
    var m = /^(\d{2}):(\d{2})/.exec(v || '');
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  // Lee los tramos del formulario; los que tienen errores no se guardan y se avisa en el tramo
  function leerTramos() {
    var salida = [];
    var hayError = false;
    Array.prototype.forEach.call($('tramos').children, function (li) {
      var dias = Array.prototype.filter.call(li.querySelectorAll('.dia input'), function (c) { return c.checked; })
        .map(function (c) { return parseInt(c.value, 10); });
      var cerrado = li.querySelector('.tramo__cerrado').checked;
      var tarde = li.querySelector('.tramo__tarde').checked;
      li.querySelector('.tramo__abierto').hidden = cerrado;
      li.querySelector('.turno--tarde').hidden = !tarde;
      var a1 = minutos(li.querySelector('.t1-abre input').value);
      var c1 = minutos(li.querySelector('.t1-cierra input').value);
      var a2 = minutos(li.querySelector('.t2-abre input').value);
      var c2 = minutos(li.querySelector('.t2-cierra input').value);
      var error = '';
      if (!dias.length) error = 'Marca al menos un día.';
      else if (cerrado) error = '';
      else if (a1 === null || c1 === null || a1 >= c1) error = 'La hora de cerrar tiene que ser después de la de abrir.';
      else if (tarde && (a2 === null || c2 === null || a2 >= c2)) error = 'Por la tarde, la hora de cerrar tiene que ser después de la de abrir.';
      else if (tarde && a2 < c1) error = 'La tarde tiene que empezar después de cerrar a mediodía.';
      li.querySelector('.tramo__error').textContent = error;
      if (error) { hayError = true; return; }
      if (cerrado) { salida.push({ dias: C.componerDias(dias), horas: 'Cerrado' }); return; }
      var tramos = [[a1, c1]];
      if (tarde) tramos.push([a2, c2]);
      salida.push({ dias: C.componerDias(dias), horas: C.componerHoras(tramos) });
    });
    return { tramos: salida, hayError: hayError };
  }

  function pintarPreviaHorario(tramos) {
    var p = $('horario-previa');
    p.textContent = '';
    if (!tramos.length) { p.textContent = 'Sin horario: no se dirá si está abierto.'; return; }
    tramos.forEach(function (t, i) {
      if (i > 0) p.appendChild(el('br'));
      p.appendChild(el('strong', null, t.dias));
      p.appendChild(document.createTextNode(' ' + (t.horas || 'Cerrado')));
    });
  }

  function pintarHorario(respetarFoco) {
    var ol = $('tramos');
    // Se respeta lo que se está escribiendo y un horario a medias (con un error, aún sin guardar)
    if (respetarFoco && (ol.contains(document.activeElement) || ol.querySelector('.tramo__error:not(:empty)'))) return;
    ol.textContent = '';
    contenido.tienda.horario.forEach(function (t) { ol.appendChild(crearTramo(t)); });
    pintarPreviaHorario(contenido.tienda.horario);
  }

  var guardarHorario = conRetraso(function () {
    var r = leerTramos();
    pintarPreviaHorario(r.tramos);
    if (r.hayError) { avisarGuardado(false, 'Falta corregir el horario'); return; }
    guardadoForm(guardarAjustes(function (c) { c.tienda.horario = r.tramos; }));
  });
  $('tramos').addEventListener('input', function () { pintarPreviaHorario(leerTramos().tramos); guardarHorario(); });
  $('tramos').addEventListener('change', function () { pintarPreviaHorario(leerTramos().tramos); guardarHorario(); });
  $('tramos').addEventListener('click', function (e) {
    var b = e.target.closest('.tramo__quitar');
    if (!b) return;
    b.closest('.tramo').remove();
    var r = leerTramos();
    pintarPreviaHorario(r.tramos);
    if (!r.hayError) guardarAjustes(function (c) { c.tienda.horario = r.tramos; }).then(function (x) { if (x.ok) avisar('Horario quitado'); });
    $('anadir-tramo').focus();
  });
  $('anadir-tramo').addEventListener('click', function () {
    if ($('tramos').children.length >= 7) { avisar('Como mucho, siete horarios distintos.', { error: true }); return; }
    var li = crearTramo({ dias: '', horas: '10:00–13:30' });
    $('tramos').appendChild(li);
    li.querySelector('.tramo__error').textContent = 'Marca los días de este horario.';
    li.querySelector('.dia input').focus();
  });

  // ---------- Textos de la portada (cada campo se guarda por separado) ----------

  var PORTADA_EJEMPLO = window.CONTENIDO_EJEMPLO.portada;

  function pintarPreviaTextos() {
    var t = $('titular').value.trim() || PORTADA_EJEMPLO.titular;
    var tp = $('titular-previa');
    tp.textContent = '';
    var lineas = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    lineas.forEach(function (l, i) {
      if (i > 0) tp.appendChild(el('br'));
      if (i === lineas.length - 1 && lineas.length > 1) tp.appendChild(el('em', null, l));
      else tp.appendChild(document.createTextNode(l));
    });
    $('entradilla-previa').textContent = $('entradilla').value.trim() || PORTADA_EJEMPLO.entradilla;
    contar($('entradilla'), $('entradilla-cuenta'), 220);
  }
  var guardarTitular = conRetraso(function () {
    var titular = $('titular').value.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean).slice(0, C.LIMITES.lineasTitular).join('\n');
    guardadoForm(guardarAjustes(function (c) { c.portada.titular = titular; }));
  });
  var guardarEntradilla = conRetraso(function () {
    var entradilla = $('entradilla').value.replace(/\s+/g, ' ').trim();
    guardadoForm(guardarAjustes(function (c) { c.portada.entradilla = entradilla; }));
  });
  $('titular').addEventListener('input', function () {
    limitarLineas($('titular'), C.LIMITES.lineasTitular, 'titular');
    pintarPreviaTextos();
    guardarTitular();
  });
  $('entradilla').addEventListener('input', function () { pintarPreviaTextos(); guardarEntradilla(); });

  // ---------- Portada: producto destacado y foto de la tienda ----------

  function textoPrecio(p) { return p.precio === null ? 'Consultar' : C.formatearPrecio(p.precio); }

  function pintarPortadaPanel() {
    var caja = $('destacados');
    var elegido = contenido.portada.destacado;
    var conFoco = caja.contains(document.activeElement) ? document.activeElement.value : null;
    caja.textContent = '';
    // Los que no tienen foto, al final, atenuados y sin poder elegirse (salvo que ya fuera el destacado)
    var enWeb = contenido.productos.filter(function (p) { return p.estado !== 'vendido'; });
    var conFoto = enWeb.filter(function (p) { return C.fotoPrincipal(p); });
    var sinFoto = enWeb.filter(function (p) { return !C.fotoPrincipal(p); });
    var opciones = [{ id: '', nombre: 'Ninguno: solo la foto de la tienda' }].concat(conFoto, sinFoto);
    opciones.forEach(function (p) {
      var bloqueado = !!p.id && !C.fotoPrincipal(p) && p.id !== elegido;
      var label = el('label', 'destacado' + (bloqueado ? ' destacado--sin-foto' : ''));
      var r = el('input');
      r.type = 'radio';
      r.name = 'destacado';
      r.value = p.id;
      r.checked = p.id === elegido;
      r.disabled = bloqueado;
      label.appendChild(r);
      var cuerpo = el('span', 'destacado__caja');
      if (p.id) {
        var mini = el('span', 'destacado__foto');
        var f = C.fotoPrincipal(p);
        if (f) {
          var img = el('img');
          img.src = srcFoto(f);
          img.alt = '';
          E.siFalla(img, function (i) { if (i.parentNode) i.parentNode.replaceChild(el('span', 'item__sin-foto', 'Sin foto'), i); });
          mini.appendChild(img);
        } else {
          mini.appendChild(el('span', 'item__sin-foto', 'Sin foto'));
        }
        cuerpo.appendChild(mini);
      }
      var datos = el('span', 'destacado__datos');
      datos.appendChild(el('span', 'destacado__nombre', p.nombre));
      if (p.id) datos.appendChild(el('span', 'destacado__precio', textoPrecio(p) + (p.estado === 'reservado' ? ' · Reservado' : '')));
      cuerpo.appendChild(datos);
      label.appendChild(cuerpo);
      caja.appendChild(label);
      if (conFoco !== null && conFoco === p.id) r.focus();
    });
    $('tienda-foto-img').hidden = false;
    $('tienda-foto-img').src = srcFoto(contenido.portada.foto);
    window.Escaparate.pintarPortada(contenido, $('portada-previa'));
  }

  // Fotos grandes del panel que no cargan (p. ej. borradas del bucket): la de la tienda vuelve a la de
  // siempre; la de la ficha se esconde y se ve el cuadro de «Toca para hacer una foto»
  $('tienda-foto-img').addEventListener('error', function () {
    var deSiempre = srcFoto('img/tienda-sofa-blanco.jpg');
    var img = $('tienda-foto-img');
    if (img.getAttribute('src') !== deSiempre) img.src = deSiempre;
    else img.hidden = true;
  });
  $('foto-img').addEventListener('error', function () {
    $('foto-img').hidden = true;
    $('foto-vacia').hidden = false;
  });

  function destacar(id) {
    return guardarAjustes(function (c) { c.portada.destacado = id; }).then(function (r) {
      if (r.ok) {
        var p = buscar(id);
        avisar(p ? 'En la portada: ' + p.nombre : 'Portada sin producto destacado');
      }
      pintarPortadaPanel();
      return r;
    });
  }

  $('destacados').addEventListener('change', function (e) {
    if (e.target.name === 'destacado') destacar(e.target.value);
  });

  function alElegirFotoTienda(e) {
    var archivo = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    $('tienda-foto-estado').textContent = 'Subiendo la foto…';
    // Se sube a portada/{uuid}.jpg, se guarda en los ajustes y, si ha ido bien, se borra la de antes
    var antes = contenido.portada.foto;
    prepararFoto(archivo).then(function (blob) { return subirFoto(blob, ''); }).then(function (ruta) {
      return guardarAjustes(function (c) { c.portada.foto = ruta; }).then(function (r) {
        if (r.ok) {
          $('tienda-foto-estado').textContent = 'Foto lista ✓';
          if (antes !== ruta && !enUso(antes)) borrarDelBucket([antes]);
        } else {
          $('tienda-foto-estado').textContent = 'No se ha guardado la foto. Vuelve a intentarlo.';
          if (!enUso(ruta)) borrarDelBucket([ruta]);
        }
        pintarPortadaPanel();
      });
    }).catch(function (err) {
      $('tienda-foto-estado').textContent = textoFalloFoto(err);
    });
  }
  $('tienda-foto-camara').addEventListener('change', alElegirFotoTienda);
  $('tienda-foto-galeria').addEventListener('change', alElegirFotoTienda);
  $('tienda-foto-hacer').addEventListener('click', function () { $('tienda-foto-camara').click(); });
  $('tienda-foto-elegir').addEventListener('click', function () { $('tienda-foto-galeria').click(); });

  // ---------- Contacto (cada campo se guarda por separado) ----------

  function validarTelefono() {
    var tel = $('telefono').value.trim();
    var error = C.soloDigitos(tel).length < 9 ? 'Escribe el teléfono completo, con sus 9 cifras.' : '';
    errorCampo('telefono', error);
    return error ? null : tel;
  }
  function validarWhatsapp() {
    var crudo = $('whatsapp').value;
    var wa = C.normalizarWhatsapp(crudo);
    var error = '';
    if (!wa) {
      error = /[^\d\s+().-]/.test(crudo)
        ? 'Escribe solo números, por ejemplo 621 23 05 88.'
        : 'Tienen que ser las 9 cifras del móvil, por ejemplo 621 23 05 88.';
    }
    errorCampo('whatsapp', error);
    return wa || null;
  }
  var guardarTelefono = conRetraso(function () {
    var tel = validarTelefono();
    if (tel === null) { avisarGuardado(false, 'Falta corregir el teléfono'); return; }
    guardadoForm(guardarAjustes(function (c) { c.tienda.telefono = tel; }));
  });
  var guardarWhatsapp = conRetraso(function () {
    var wa = validarWhatsapp();
    if (wa === null) { avisarGuardado(false, 'Falta corregir el WhatsApp'); return; }
    guardadoForm(guardarAjustes(function (c) { c.tienda.whatsapp = wa; }));
  });
  var guardarDireccion = conRetraso(function () {
    var direccion = $('direccion').value.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean).slice(0, C.LIMITES.lineasDireccion).join('\n');
    guardadoForm(guardarAjustes(function (c) { c.tienda.direccion = direccion; }));
  });
  $('telefono').addEventListener('input', guardarTelefono);
  $('whatsapp').addEventListener('input', guardarWhatsapp);
  $('direccion').addEventListener('input', function () {
    limitarLineas($('direccion'), C.LIMITES.lineasDireccion, 'direccion');
    guardarDireccion();
  });
  // Zona de entrega (opcional): vacía, la web dice «consulta zona»
  var guardarZona = conRetraso(function () {
    var zona = $('zona-entrega').value.replace(/\s+/g, ' ').trim();
    guardadoForm(guardarAjustes(function (c) { c.tienda.zonaEntrega = zona; }));
  });
  $('zona-entrega').addEventListener('input', guardarZona);

  // ---------- Confianza: opiniones, financiación, marcas y año (cada parte se guarda por separado) ----------

  function textoNota(n) { return n === null ? '' : String(n).replace('.', ','); }

  function crearOpinion(o) {
    var li = el('li', 'opinion');
    var l1 = el('label', 'campo');
    l1.appendChild(el('span', 'campo__etiqueta', 'Lo que dice'));
    var t = el('textarea', 'opinion__texto');
    t.rows = 3;
    t.maxLength = C.LIMITES.opinion;
    t.value = o.texto;
    l1.appendChild(t);
    var cuenta = el('span', 'campo__cuenta', '');
    l1.appendChild(cuenta);
    contar(t, cuenta, C.LIMITES.opinion);
    li.appendChild(l1);
    var l2 = el('label', 'campo');
    l2.appendChild(el('span', 'campo__etiqueta', 'Nombre de quien la escribió'));
    var a = el('input', 'opinion__autor');
    a.type = 'text';
    a.maxLength = C.LIMITES.autor;
    a.autocomplete = 'off';
    a.value = o.autor;
    l2.appendChild(a);
    li.appendChild(l2);
    var quitar = el('button', 'boton-texto opinion__quitar', 'Quitar esta opinión');
    quitar.type = 'button';
    li.appendChild(quitar);
    return li;
  }

  function leerOpiniones() {
    return Array.prototype.map.call($('op-lista').children, function (li) {
      return {
        texto: li.querySelector('.opinion__texto').value.replace(/\s+/g, ' ').trim(),
        autor: li.querySelector('.opinion__autor').value.replace(/\s+/g, ' ').trim()
      };
    }).filter(function (o) { return o.texto; });
  }

  function pintarMarcasPanel() {
    var ul = $('marcas-lista');
    ul.textContent = '';
    contenido.marcas.forEach(function (m) {
      var li = el('li', 'marca-chip');
      li.appendChild(el('span', null, m));
      var b = el('button', null, '×');
      b.type = 'button';
      b.dataset.marca = m;
      b.setAttribute('aria-label', 'Quitar la marca ' + m);
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function pintarConfianza(respetarFoco) {
    function poner(id, valor) {
      if (respetarFoco && document.activeElement === $(id)) return;
      $(id).value = valor;
    }
    poner('op-nota', textoNota(contenido.opiniones.nota));
    poner('op-total', contenido.opiniones.total === null ? '' : String(contenido.opiniones.total));
    var ol = $('op-lista');
    if (!(respetarFoco && ol.contains(document.activeElement))) {
      ol.textContent = '';
      contenido.opiniones.lista.forEach(function (o) { ol.appendChild(crearOpinion(o)); });
    }
    $('fin-activa').checked = contenido.financiacion.activa;
    poner('fin-texto', contenido.financiacion.texto);
    pintarMarcasPanel();
    poner('desde', contenido.desde);
  }

  var guardarNota = conRetraso(function () {
    var t = $('op-nota').value.trim();
    var n = t === '' ? null : C.numero(t);
    if (t !== '' && (n === null || n < 1 || n > 5)) {
      errorCampo('op-nota', 'Escribe la nota de Google, de 1 a 5. Por ejemplo: 4,4');
      avisarGuardado(false, 'Falta corregir la nota');
      return;
    }
    errorCampo('op-nota', '');
    guardadoForm(guardarAjustes(function (c) { c.opiniones.nota = n; }));
  });
  var guardarTotal = conRetraso(function () {
    var t = $('op-total').value.trim();
    if (t !== '' && !/^\d+$/.test(t)) {
      errorCampo('op-total', 'Escribe solo el número, por ejemplo 28.');
      avisarGuardado(false, 'Falta corregir el número de opiniones');
      return;
    }
    errorCampo('op-total', '');
    guardadoForm(guardarAjustes(function (c) { c.opiniones.total = t === '' ? null : parseInt(t, 10); }));
  });
  var guardarLista = conRetraso(function () {
    var lista = leerOpiniones();
    guardadoForm(guardarAjustes(function (c) { c.opiniones.lista = lista; }));
  });
  $('op-nota').addEventListener('input', guardarNota);
  $('op-total').addEventListener('input', guardarTotal);
  $('op-lista').addEventListener('input', function (e) {
    var t = e.target.closest('.opinion__texto');
    if (t) contar(t, t.parentNode.querySelector('.campo__cuenta'), C.LIMITES.opinion);
    guardarLista();
  });
  $('op-lista').addEventListener('click', function (e) {
    var b = e.target.closest('.opinion__quitar');
    if (!b) return;
    b.closest('.opinion').remove();
    var lista = leerOpiniones();
    guardarAjustes(function (c) { c.opiniones.lista = lista; }).then(function (r) { if (r.ok) avisar('Opinión quitada'); });
    $('op-anadir').focus();
  });
  $('op-anadir').addEventListener('click', function () {
    if ($('op-lista').children.length >= C.LIMITES.opiniones) {
      avisar('Como mucho ' + C.LIMITES.opiniones + ' opiniones. Quita alguna para añadir otra.', { error: true });
      return;
    }
    var li = crearOpinion({ texto: '', autor: '' });
    $('op-lista').appendChild(li);
    li.querySelector('.opinion__texto').focus();
  });

  $('fin-activa').addEventListener('change', function () {
    var activa = $('fin-activa').checked;
    guardarAjustes(function (c) { c.financiacion.activa = activa; }).then(function (r) {
      if (r.ok) avisar(activa ? 'Financiación: ahora sale en la web' : 'Financiación: ya no sale en la web');
      else $('fin-activa').checked = contenido.financiacion.activa;
    });
  });
  var guardarFinTexto = conRetraso(function () {
    var texto = $('fin-texto').value.replace(/\s+/g, ' ').trim();
    guardadoForm(guardarAjustes(function (c) { c.financiacion.texto = texto; }));
  });
  $('fin-texto').addEventListener('input', guardarFinTexto);

  function anadirMarca() {
    var campo = $('marca-nueva');
    var m = campo.value.replace(/\s+/g, ' ').trim();
    var error = '';
    if (!m) error = 'Escribe el nombre de la marca.';
    else if (contenido.marcas.some(function (x) { return x.toLowerCase() === m.toLowerCase(); })) error = 'Esa marca ya está en la lista.';
    else if (contenido.marcas.length >= C.LIMITES.marcas) error = 'Como mucho ' + C.LIMITES.marcas + ' marcas.';
    errorCampo('marca-nueva', error);
    if (error) { campo.focus(); return; }
    guardarAjustes(function (c) {
      if (c.marcas.some(function (x) { return x.toLowerCase() === m.toLowerCase(); })) return;
      c.marcas.push(m);
    }).then(function (r) {
      if (!r.ok) return;
      campo.value = '';
      pintarMarcasPanel();
      avisar('Marca añadida: ' + m);
      campo.focus();
    });
  }
  $('marca-anadir').addEventListener('click', anadirMarca);
  $('marca-nueva').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); anadirMarca(); }
  });
  $('marca-nueva').addEventListener('input', function () { errorCampo('marca-nueva', ''); });
  $('marcas-lista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-marca]');
    if (!b) return;
    var m = b.dataset.marca;
    guardarAjustes(function (c) { c.marcas = c.marcas.filter(function (x) { return x !== m; }); }).then(function (r) {
      if (r.ok) { pintarMarcasPanel(); avisar('Marca quitada: ' + m); $('marca-nueva').focus(); }
    });
  });

  var guardarDesde = conRetraso(function () {
    var t = $('desde').value.trim();
    if (t !== '' && (!/^(19|20)\d{2}$/.test(t) || parseInt(t, 10) > new Date().getFullYear())) {
      errorCampo('desde', 'Escribe el año con 4 cifras, por ejemplo 2003.');
      avisarGuardado(false, 'Falta corregir el año');
      return;
    }
    errorCampo('desde', '');
    guardadoForm(guardarAjustes(function (c) { c.desde = t; }));
  });
  $('desde').addEventListener('input', guardarDesde);

  // ---------- Rellenar todo ----------

  // Con respetarFoco, no se toca el campo que la persona está escribiendo
  function pintarFormularios(respetarFoco) {
    function poner(id, valor) {
      var campo = $(id);
      if (respetarFoco && document.activeElement === campo) return;
      campo.value = valor;
    }
    pintarAviso(respetarFoco);
    pintarHorario(respetarFoco);
    poner('titular', contenido.portada.titular);
    poner('entradilla', contenido.portada.entradilla);
    pintarPreviaTextos();
    pintarPortadaPanel();
    poner('telefono', contenido.tienda.telefono);
    poner('whatsapp', C.whatsappLegible(contenido.tienda.whatsapp));
    poner('direccion', contenido.tienda.direccion);
    poner('zona-entrega', contenido.tienda.zonaEntrega);
    validarTelefono();
    validarWhatsapp();
    pintarConfianza(respetarFoco);
  }

  // ---------- Lo que cambia otra persona: se trae del servidor ----------

  // Repinta tras recargar. conFicha: trae también a la ficha abierta lo de su producto (tras un conflicto)
  function trasRecargar(conFicha) {
    pintarLista();
    if (!pendientesForm) pintarFormularios(true);
    else pintarPortadaPanel();
    if (conFicha) refrescarFicha();
    else if (ficha.open) pintarPrevia();
  }

  // Recarga todo lo que no se está editando: el producto de la ficha abierta se queda como está
  // (si otra persona lo ha cambiado, su siguiente guardado lo detecta, lo recarga y lo avisa)
  var recargaEnCurso = null;
  var ultimaRecarga = 0;
  function recargarDelServidor() {
    if (!listo) return Promise.resolve();
    if (recargaEnCurso) return recargaEnCurso;
    recargaEnCurso = enCola(function () {
      return S.conSesion(function (tk) { return D.leerTodo(tk); }).then(function (r) {
        ultimaRecarga = Date.now();
        var abierto = ficha.open && borrador && !esNuevo ? borrador.id : null;
        var lista = r.contenido.productos;
        if (abierto) {
          var mio = buscar(abierto);
          var i = -1;
          lista.forEach(function (p, n) { if (p.id === abierto) i = n; });
          if (mio && i !== -1) lista[i] = mio;
          else if (mio) lista.push(mio);
          if (mio) r.meta.productos[abierto] = meta.productos[abierto];
        }
        var antes = JSON.stringify(contenido);
        var c = r.contenido;
        c.productos = lista;
        contenido = C.normalizar(c);
        meta = r.meta;
        guardarCache();
        if (JSON.stringify(contenido) !== antes) trasRecargar(false);
      }, function () { /* sin conexión: se sigue con lo que hay */ });
    }).then(function () { recargaEnCurso = null; });
    return recargaEnCurso;
  }

  // Cada minuto (si se ve la pestaña) y al volver a ella
  setInterval(function () {
    if (document.visibilityState === 'visible') recargarDelServidor();
  }, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - ultimaRecarga > 5000) recargarDelServidor();
  });
  // Otra pestaña de este navegador ha guardado (ha cambiado la caché): se trae lo del servidor
  var relojOtraPestana;
  window.addEventListener('storage', function (e) {
    if (e.key !== C.CLAVE && e.key !== null) return;
    clearTimeout(relojOtraPestana);
    relojOtraPestana = setTimeout(recargarDelServidor, 400);
  });

  // ---------- Entrar, comprobar que es editor, cargar ----------

  var acceso = $('acceso');
  var resolverAcceso = null;
  var esperaAcceso = null;
  var cargandoPanel = false;

  function estadoPanel(estado, texto) {
    document.body.dataset.sesion = estado;
    var caja = $('carga');
    caja.hidden = estado === 'si' || estado === 'no';
    $('carga-texto').textContent = texto || (estado === 'cargando' ? 'Cargando los productos…' : '');
    $('carga-reintentar').hidden = estado !== 'error';
  }

  function pintarSesion() {
    var s = S.actual();
    $('sesion-quien').textContent = s && s.usuario.email ? 'Has entrado como ' + s.usuario.email : '';
  }

  // modo: 'inicio' | 'caducada' | 'salida' (entrar) · 'olvido' (pedir el enlace) · 'nueva' (contraseña nueva)
  var TEXTOS_ACCESO = {
    inicio: ['Entrar al panel', 'Con el correo y la contraseña de la tienda.'],
    caducada: ['La sesión ha caducado', 'Vuelve a entrar para seguir: lo que estabas haciendo se guarda al entrar.'],
    salida: ['Se ha cerrado la sesión', 'Se ha cerrado en otra pestaña. Vuelve a entrar para seguir.'],
    olvido: ['Contraseña olvidada', 'Escribe el correo de la cuenta y te enviaremos un enlace para poner una contraseña nueva.'],
    nueva: ['Contraseña nueva', 'Elige la contraseña con la que entrarás a partir de ahora.']
  };
  var modoAcceso = 'inicio';
  function mostrarAcceso(modo, error) {
    var entrarModo = modo === 'inicio' || modo === 'caducada' || modo === 'salida';
    if (entrarModo) modoAcceso = modo;
    $('acceso-titulo').textContent = TEXTOS_ACCESO[modo][0];
    $('acceso-ayuda').textContent = TEXTOS_ACCESO[modo][1];
    $('acceso-form').hidden = !entrarModo;
    $('olvido-form').hidden = modo !== 'olvido';
    $('nueva-form').hidden = modo !== 'nueva';
    $('acceso-error').textContent = entrarModo ? error || '' : '';
    $('olvido-error').textContent = modo === 'olvido' ? error || '' : '';
    $('olvido-hecho').textContent = '';
    $('nueva-error').textContent = modo === 'nueva' ? error || '' : '';
    $('acceso-clave').value = '';
    $('acceso-volver').hidden = modo !== 'inicio';
    if (!acceso.open) acceso.showModal();
    if (modo === 'olvido') {
      $('olvido-correo').value = $('acceso-correo').value;
      $('olvido-correo').focus();
    } else if (modo === 'nueva') {
      $('nueva-clave').value = '';
      $('nueva-clave2').value = '';
      $('nueva-clave').focus();
    } else {
      ($('acceso-correo').value ? $('acceso-clave') : $('acceso-correo')).focus();
    }
  }

  // ¿Has olvidado la contraseña? → se pide el enlace. La respuesta es la misma exista o no el correo
  $('acceso-olvido').addEventListener('click', function () { mostrarAcceso('olvido'); });
  $('olvido-volver').addEventListener('click', function () { mostrarAcceso(modoAcceso); });
  $('olvido-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var correo = $('olvido-correo').value.trim();
    var boton = $('olvido-enviar');
    $('olvido-hecho').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      $('olvido-error').textContent = 'Escribe el correo completo, por ejemplo nombre@gmail.com.';
      $('olvido-correo').focus();
      return;
    }
    if (boton.disabled) return;
    boton.disabled = true;
    $('olvido-error').textContent = '';
    var volverA = window.location.origin + window.location.pathname;
    S.pedirRecuperacion(correo, volverA).then(function () { return null; }, function (err) {
      return err.tipo === 'red' || err.tipo === 'tiempo' || err.estado === 429 ? err : null;
    }).then(function (err) {
      boton.disabled = false;
      if (!err) {
        $('olvido-hecho').textContent = 'Si el correo existe, te llegará un enlace. Ábrelo en este mismo móvil u ordenador (mira también en «correo no deseado»).';
        $('acceso-correo').value = correo;
      } else {
        $('olvido-error').textContent = err.tipo === 'red' ? 'Sin conexión. Revisa internet y vuelve a intentarlo.'
          : err.tipo === 'tiempo' ? 'El servidor no contesta. Vuelve a intentarlo en un momento.'
          : 'Has pedido varios enlaces seguidos. Espera unos minutos y vuelve a probar.';
      }
    });
  });

  // Contraseña nueva (tras el enlace del correo): dos veces, mínimo 8; luego se entra
  $('nueva-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = $('nueva-clave').value;
    var b2 = $('nueva-clave2').value;
    var boton = $('nueva-guardar');
    var corta = Array.from(a).length < 8;
    var error = corta ? 'Tiene que tener al menos 8 caracteres.' : a !== b2 ? 'Las dos contraseñas no coinciden.' : '';
    $('nueva-error').textContent = error;
    if (error) { $(corta ? 'nueva-clave' : 'nueva-clave2').focus(); return; }
    if (boton.disabled) return;
    boton.disabled = true;
    S.cambiarClave(a).then(function () {
      var s = S.actual();
      return S.token().then(function (tk) { return D.esEditor(tk, s.usuario.id); });
    }).then(function (es) {
      boton.disabled = false;
      $('nueva-clave').value = '';
      $('nueva-clave2').value = '';
      if (es) { trasEntrar(); avisar('Contraseña cambiada'); return; }
      return S.salir().then(function () { mostrarAcceso('inicio', 'Contraseña cambiada, pero esta cuenta no tiene permiso para editar.'); });
    }).catch(function (err) {
      boton.disabled = false;
      var c = err && err.codigo;
      $('nueva-error').textContent = c === 'same_password' ? 'Tiene que ser distinta de la que tenías.'
        : c === 'weak_password' ? 'Esa contraseña es demasiado fácil. Usa al menos 8 caracteres, mezclando letras y números.'
        : err.tipo === 'red' ? 'Sin conexión. Revisa internet y vuelve a intentarlo.'
        : err.tipo === 'sesion' ? 'El enlace ha caducado. Pide otro con «¿Has olvidado la contraseña?».'
        : err.mensaje || D.MENSAJES.servidor;
    });
  });
  acceso.addEventListener('cancel', function (e) { e.preventDefault(); });

  // Lo llama datos.js cuando la sesión ya no vale: se pide entrar y se sigue al volver
  S.alCaducar = function () {
    if (!esperaAcceso) {
      esperaAcceso = new Promise(function (resolver) { resolverAcceso = resolver; });
      mostrarAcceso(listo ? 'caducada' : 'inicio');
    }
    return esperaAcceso;
  };

  function trasEntrar() {
    if (acceso.open) acceso.close();
    $('acceso-clave').value = '';
    pintarSesion();
    if (resolverAcceso) {
      var r = resolverAcceso;
      resolverAcceso = null;
      esperaAcceso = null;
      r();
      return;
    }
    if (!listo) cargarPanel();
    else recargarDelServidor();
  }

  $('acceso-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var correo = $('acceso-correo').value.trim();
    var clave = $('acceso-clave').value;
    var boton = $('acceso-entrar');
    if (!correo || !clave) {
      $('acceso-error').textContent = 'Escribe el correo y la contraseña.';
      $(correo ? 'acceso-clave' : 'acceso-correo').focus();
      return;
    }
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    $('acceso-error').textContent = '';
    S.entrar(correo, clave).then(function (s) {
      return S.token().then(function (tk) { return D.esEditor(tk, s.usuario.id); });
    }).then(function (es) {
      if (es) { trasEntrar(); return; }
      return S.salir().then(function () {
        $('acceso-error').textContent = 'Esta cuenta no tiene permiso para editar.';
        $('acceso-clave').value = '';
        $('acceso-correo').focus();
      });
    }).catch(function (err) {
      $('acceso-error').textContent = err.tipo === 'red' ? 'Sin conexión. Revisa internet y vuelve a intentarlo.'
        : err.tipo === 'tiempo' ? 'El servidor no contesta. Vuelve a intentarlo en un momento.'
        : err.mensaje || D.MENSAJES.servidor;
      $('acceso-clave').focus();
    }).then(function () {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    });
  });

  // Comprueba que la cuenta está en «editores» y trae todo (con los vendidos)
  function cargarPanel() {
    if (cargandoPanel) return;
    cargandoPanel = true;
    estadoPanel('cargando');
    S.conSesion(function (tk) {
      var s = S.actual();
      return D.esEditor(tk, s ? s.usuario.id : '').then(function (es) { return es ? D.leerTodo(tk) : null; });
    }).then(function (r) {
      cargandoPanel = false;
      if (!r) {
        estadoPanel('no');
        S.salir().then(function () { mostrarAcceso('inicio', 'Esta cuenta no tiene permiso para editar.'); });
        return;
      }
      contenido = r.contenido;
      meta = r.meta;
      ultimaRecarga = Date.now();
      listo = true;
      guardarCache();
      estadoPanel('si');
      pintarSesion();
      pintarLista();
      pintarFormularios();
    }, function (e) {
      cargandoPanel = false;
      estadoPanel('error', e.tipo === 'red' ? 'Sin conexión: no se han podido cargar los productos. Revisa internet.'
        : e.tipo === 'tiempo' ? 'El servidor no contesta. Vuelve a intentarlo en un momento.'
        : e.tipo === 'permiso' ? 'Esta cuenta no tiene permiso para editar.'
        : 'No se han podido cargar los productos. Vuelve a intentarlo.');
    });
  }
  $('carga-reintentar').addEventListener('click', cargarPanel);

  // «Cerrar sesión»: se cierra esta sesión (la del móvil o la de otro dispositivo siguen) y se vuelve a la entrada
  // Antes se guarda ya todo lo pendiente (campos a medio guardar y la ficha abierta) y se espera a que
  // acabe; si algo no se ha podido guardar, se avisa y NO se cierra la sesión
  $('salir').addEventListener('click', function () {
    if (ficha.open && esNuevo && tieneAlgo()) {
      avisar('Termina de añadir el producto nuevo (o descártalo) antes de cerrar sesión.', { error: true });
      return;
    }
    $('salir').disabled = true;
    var antes = fallos;
    diferidos.forEach(function (ya) { ya(); });
    var ficheo = ficha.open && !esNuevo ? guardarEdicion() : Promise.resolve({ ok: true });
    ficheo.then(function (r) {
      return enCola(function () {}).then(function () { return r; });
    }).then(function (r) {
      if (fallos > antes || (r && r.ok === false) || pendientesForm > 0 || document.querySelector('main [aria-invalid="true"], main .tramo__error:not(:empty)')) {
        $('salir').disabled = false;
        avisar('No se ha podido guardar todo: revisa el aviso o lo marcado en rojo antes de cerrar sesión.', { error: true });
        return;
      }
      return enCola(function () { return S.salir(); }).then(function () { window.location.reload(); });
    });
  });

  // Vuelve la conexión: se trae lo que haya cambiado (sin tocar lo que se está editando)
  window.addEventListener('online', function () { recargarDelServidor(); });

  // Otra pestaña de este navegador ha entrado, salido o la sesión ha caducado
  S.alCambiar(function (que) {
    if (que === 'salida' && listo) mostrarAcceso('salida');
    else if (que === 'salida' && !acceso.open) { estadoPanel('no'); mostrarAcceso('inicio'); }
    else if (que === 'caducada' && listo) S.alCaducar();
    else if (que === 'entrada' && acceso.open) {
      var s = S.actual();
      S.token().then(function (tk) { return D.esEditor(tk, s.usuario.id); }).then(function (es) { if (es) trasEntrar(); }, function () {});
    }
  });

  // Arranque: si se vuelve del enlace del correo (contraseña olvidada), se pide la contraseña nueva
  var vuelta = S.vueltaCorreo();
  if (vuelta && vuelta.tipo === 'recuperacion') {
    estadoPanel('no');
    S.entrarConRecuperacion().then(function () { mostrarAcceso('nueva'); }, function (err) {
      mostrarAcceso('inicio', err.tipo === 'red' ? 'Sin conexión. Revisa internet y vuelve a abrir el enlace.'
        : 'El enlace ha caducado o ya se ha usado. Pide otro con «¿Has olvidado la contraseña?».');
    });
  } else if (vuelta && vuelta.tipo === 'error') {
    estadoPanel('no');
    mostrarAcceso('inicio', 'El enlace ha caducado o ya se ha usado. Pide otro con «¿Has olvidado la contraseña?».');
  } else if (S.actual()) cargarPanel();
  else { estadoPanel('no'); mostrarAcceso('inicio'); }
})();
