// Panel de la tienda: la dueña cambia productos, horario, aviso, textos y contacto.
// Todo se guarda solo, en este navegador (ver js/contenido.js). Es un prototipo sin contraseña.
// Los datos se pintan siempre con textContent; nunca innerHTML con lo que escribe la persona.
//
// Para no pisar lo que se haya cambiado en otra pestaña, cada guardado relee lo último que hay
// guardado y aplica encima SOLO el cambio que se acaba de hacer (un producto, un campo).
(function () {
  'use strict';

  var C = window.Contenido;
  if (!C || !window.cargarContenido) return;

  var contenido = window.cargarContenido();
  var vista = 'web';
  var V = '20261122-16';

  var MENSAJE_CUOTA = 'No cabe más: borra productos vendidos o usa fotos más pequeñas.';
  var MENSAJE_ERROR = 'No se ha podido guardar en este navegador. Puede que esté en modo privado o sin espacio.';
  var MENSAJE_FALTA = 'Ese producto ya no está: se ha borrado en otra pestaña.';

  function $(id) { return document.getElementById(id); }
  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }
  function copiar(o) { return JSON.parse(JSON.stringify(o)); }
  function contar(campo, cuenta, max) { cuenta.textContent = Array.from(campo.value).length + ' / ' + max; }
  function srcFoto(f) { return f.indexOf('data:') === 0 ? f : f + '?v=' + V; }

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

  // opciones: { error: true } se queda hasta cerrarlo; { accion: { texto, hacer } } añade un botón (Deshacer)
  function avisar(texto, opciones) {
    opciones = opciones || {};
    clearTimeout(temporizadorToast);
    $('toast-texto').textContent = texto;
    toast.classList.toggle('toast--error', !!opciones.error);
    accionToast = opciones.accion || null;
    $('toast-accion').hidden = !accionToast;
    if (accionToast) $('toast-accion').textContent = accionToast.texto;
    if (conPopover) {
      if (toast.matches(':popover-open')) toast.hidePopover();
      toast.showPopover(); // al volver a abrirlo queda encima de todo, también de los diálogos
    } else {
      toast.hidden = false;
    }
    anunciar(texto, !!opciones.error);
    if (!opciones.error) temporizadorToast = setTimeout(esconderToast, opciones.duracion || (accionToast ? 6000 : 3500));
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

  // Relee lo último guardado, le aplica el cambio y lo guarda. Si el cambio devuelve false
  // (p. ej. el producto ya no existe), no se guarda nada. Devuelve { ok, motivo }.
  function aplicar(cambio) {
    var base = window.cargarContenido();
    if (cambio(base) === false) {
      contenido = base;
      return { ok: false, motivo: 'falta' };
    }
    var nuevo = C.normalizar(base);
    var r = window.guardarContenido(nuevo);
    if (r.ok) {
      contenido = nuevo;
      avisarGuardado(true);
    } else {
      avisarGuardado(false);
      avisar(r.motivo === 'cuota' ? MENSAJE_CUOTA : MENSAJE_ERROR, { error: true });
    }
    return r;
  }

  function enCopia(c, id) {
    for (var i = 0; i < c.productos.length; i++) if (c.productos[i].id === id) return c.productos[i];
    return null;
  }
  function buscar(id) { return enCopia(contenido, id); }

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

  function miniatura(p) {
    var caja = el('div', 'item__foto');
    if (C.fotoValida(p.foto)) {
      var img = el('img');
      img.src = srcFoto(p.foto);
      img.alt = '';
      img.width = 72;
      img.height = 72;
      caja.appendChild(img);
    } else {
      caja.appendChild(el('span', 'item__sin-foto', 'Sin foto'));
    }
    return caja;
  }

  function botonAccion(texto, accion, p, clase) {
    var b = el('button', 'accion' + (clase ? ' ' + clase : ''), texto);
    b.type = 'button';
    b.dataset.accion = accion;
    b.dataset.id = p.id;
    b.setAttribute('aria-label', texto + ': ' + p.nombre);
    return b;
  }

  var ICONO_ESTADO = { disponible: '✓ ', reservado: '⏸ ', vendido: '✕ ' };

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
      var linea = el('p', 'item__linea');
      linea.appendChild(el('span', 'item__precio', p.precio === null ? 'Consultar' : C.formatearPrecio(p.precio)));
      linea.appendChild(el('span', 'item__estado item__estado--' + p.estado, ICONO_ESTADO[p.estado] + C.ESTADOS[p.estado]));
      if (p.etiqueta) linea.appendChild(el('span', 'item__etiqueta', C.ETIQUETAS[p.etiqueta]));
      datos.appendChild(linea);
      li.appendChild(datos);

      var acciones = el('div', 'item__acciones');
      if (p.estado === 'vendido') {
        acciones.appendChild(botonAccion('Volver a ponerlo a la venta', 'recuperar', p, 'accion--ancha'));
        acciones.appendChild(botonAccion('Editar', 'editar', p));
      } else {
        acciones.appendChild(p.estado === 'reservado'
          ? botonAccion('Quitar reserva', 'reserva', p, 'accion--reservado')
          : botonAccion('Marcar reservado', 'reserva', p));
        acciones.appendChild(botonAccion('Marcar vendido', 'vendido', p));
        acciones.appendChild(botonAccion('Editar', 'editar', p, 'accion--ancha-movil'));
      }
      li.appendChild(acciones);
      lista.appendChild(li);
    });

    vacia.hidden = elegidos.length > 0;
    vacia.textContent = vista === 'web'
      ? 'No hay productos en la web. Pulsa «Añadir producto» para poner el primero.'
      : 'Aquí salen los productos que marques como vendidos. Ahora no hay ninguno.';

    if (enfoque) {
      var b = enfoque.id && lista.querySelector('[data-id="' + enfoque.id + '"][data-accion="' + enfoque.accion + '"]');
      (b || $('anadir')).focus();
    }
  }

  document.querySelector('.vista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-vista]');
    if (!b) return;
    vista = b.dataset.vista;
    pintarLista();
  });

  function cambiarEstado(id, estado) {
    return aplicar(function (c) {
      var x = enCopia(c, id);
      if (!x) return false;
      x.estado = estado;
    });
  }

  $('lista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b) return;
    var id = b.dataset.id;
    var p = buscar(id);
    if (!p) return;
    var r;

    switch (b.dataset.accion) {
      case 'reserva':
        var nuevo = p.estado === 'reservado' ? 'disponible' : 'reservado';
        r = cambiarEstado(id, nuevo);
        if (r.ok) avisar((nuevo === 'reservado' ? 'Reservado: ' : 'Disponible otra vez: ') + p.nombre);
        else if (r.motivo === 'falta') avisar(MENSAJE_FALTA, { error: true });
        pintarLista({ id: id, accion: 'reserva' });
        break;
      case 'vendido':
        var antes = p.estado;
        r = cambiarEstado(id, 'vendido');
        if (r.ok) {
          avisar('Vendido: ' + p.nombre + '. Ya no se ve en la web.', {
            accion: {
              texto: 'Deshacer',
              hacer: function () {
                if (cambiarEstado(id, antes).ok) avisar('Deshecho: ' + p.nombre + ' vuelve a la web.');
                pintarLista();
              }
            }
          });
        } else if (r.motivo === 'falta') avisar(MENSAJE_FALTA, { error: true });
        pintarLista({ id: '', accion: '' });
        break;
      case 'recuperar':
        r = cambiarEstado(id, 'disponible');
        if (r.ok) avisar('De vuelta en la web: ' + p.nombre);
        pintarLista({ id: '', accion: '' });
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

  function pintarFoto() {
    var img = $('foto-img');
    var hay = C.fotoValida(borrador.foto);
    img.hidden = !hay;
    if (hay) img.src = srcFoto(borrador.foto);
    else img.removeAttribute('src');
    $('foto-vacia').hidden = hay;
    $('foto-cambiar').hidden = !hay;
    $('foto-quitar').hidden = !hay;
    $('foto-caja').setAttribute('aria-label', hay ? 'Cambiar la foto: hacer otra foto' : 'Hacer una foto del producto');
  }

  function pintarPrevia() {
    if (!borrador) return;
    var ul = $('ficha-previa');
    ul.textContent = '';
    var p = C.normalizarProducto(copiar(borrador), {});
    if (!p) p = C.normalizarProducto(Object.assign(copiar(borrador), { nombre: 'Nombre del producto' }), {});
    p.id = borrador.id;
    ul.appendChild(window.Escaparate.crearTarjeta(p, contenido.tienda, { financiacion: contenido.financiacion.activa }));
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

  function abrirFicha(p) {
    esNuevo = !p;
    var usados = {};
    contenido.productos.forEach(function (x) { usados[x.id] = true; });
    borrador = p ? copiar(p) : {
      id: C.nuevoId('sofas', usados), nombre: '', categoria: 'sofas', precio: null, precioAntes: null,
      etiqueta: '', estado: 'disponible', foto: '', descripcion: '', destacado: false
    };
    $('ficha-titulo').textContent = esNuevo ? 'Nuevo producto' : 'Editar producto';
    $('ficha-ref').textContent = 'Ref. ' + borrador.id;
    $('f-nombre').value = borrador.nombre;
    delete $('f-nombre').dataset.tocado;
    radio('categoria', borrador.categoria);
    radio('etiqueta', borrador.etiqueta);
    $('f-precio').value = textoNumero(borrador.precio);
    $('f-antes').value = textoNumero(borrador.precioAntes);
    $('f-antes-caja').open = borrador.precioAntes !== null;
    $('f-destacado').checked = borrador.destacado;
    $('f-descripcion').value = borrador.descripcion;
    $('foto-estado').textContent = '';
    $('ficha-error').textContent = '';
    $('ficha-cancelar').hidden = !esNuevo;
    $('ficha-borrar').hidden = esNuevo;
    $('ficha-nota').hidden = esNuevo;
    $('ficha-guardar').textContent = esNuevo ? 'Añadir a la web' : 'Guardar y cerrar';
    leerFicha();
    pintarFoto();
    pintarPrevia();
    ficha.showModal();
    $('f-nombre').focus();
  }

  function cerrarFicha() {
    clearTimeout(temporizadorFicha);
    if (ficha.open) ficha.close();
    borrador = null;
    pintarLista();
    var b = $('anadir');
    if (b) b.focus();
  }

  // Al editar uno que ya existe, cada cambio correcto se guarda solo
  var temporizadorFicha;
  function guardarEdicion() {
    clearTimeout(temporizadorFicha);
    if (esNuevo || !borrador) return { ok: true };
    var errores = leerFicha();
    if (errores.length) return { ok: false, errores: errores };
    var copia = copiar(borrador);
    var r = aplicar(function (c) {
      var x = enCopia(c, copia.id);
      if (!x) return false;
      // Solo los datos de la ficha; el estado (reservado/vendido) puede haber cambiado en otra pestaña
      ['nombre', 'categoria', 'precio', 'precioAntes', 'etiqueta', 'foto', 'descripcion', 'destacado']
        .forEach(function (k) { x[k] = copia[k]; });
    });
    if (r.ok) $('ficha-error').textContent = '';
    else $('ficha-error').textContent = r.motivo === 'cuota' ? MENSAJE_CUOTA : r.motivo === 'falta' ? MENSAJE_FALTA : MENSAJE_ERROR;
    return r;
  }

  function tieneAlgo() {
    return !!($('f-nombre').value.trim() || $('f-precio').value.trim() || $('f-antes').value.trim() ||
      $('f-descripcion').value.trim() || (borrador && borrador.foto));
  }

  // Cerrar con la X, «Cancelar», Esc o tocando fuera
  function cancelarFicha() {
    if (!borrador || $('confirmar').open) return;
    if (esNuevo) {
      if (!tieneAlgo()) { cerrarFicha(); return; }
      confirmar({
        texto: '¿Descartar este producto?', detalle: 'Se pierde lo que has puesto en la ficha.',
        si: 'Sí, descartar', no: 'Seguir con la ficha', peligro: true
      }).then(function (si) { if (si) cerrarFicha(); });
      return;
    }
    var r = guardarEdicion();
    if (r.ok) {
      var nombre = borrador.nombre;
      cerrarFicha();
      avisar('Guardado: ' + nombre);
      return;
    }
    if (r.errores) {
      mostrarErrores(r.errores);
      confirmar({
        texto: 'Hay un dato sin corregir', detalle: 'Lo marcado en rojo no se puede guardar. Si sales ahora, ese cambio se pierde.',
        si: 'Salir sin ese cambio', no: 'Corregirlo', peligro: true
      }).then(function (si) {
        if (si) cerrarFicha();
        else $(r.errores[0]).focus();
      });
    }
  }

  form.addEventListener('input', function (e) {
    if (e.target.type === 'file' || !borrador) return;
    if (e.target.id === 'f-nombre') e.target.dataset.tocado = '1';
    leerFicha();
    pintarPrevia();
    clearTimeout(temporizadorFicha);
    temporizadorFicha = setTimeout(guardarEdicion, 500);
  });

  function anadirNuevo() {
    var nuevo = copiar(borrador);
    var r = aplicar(function (c) {
      if (c.productos.length >= C.LIMITES.productos) return false;
      var usados = {};
      c.productos.forEach(function (x) { usados[x.id] = true; });
      if (usados[nuevo.id]) nuevo.id = C.nuevoId(nuevo.categoria, usados);
      c.productos.unshift(nuevo);
    });
    if (!r.ok) {
      $('ficha-error').textContent = r.motivo === 'cuota' ? MENSAJE_CUOTA
        : r.motivo === 'falta' ? 'Has llegado al máximo de ' + C.LIMITES.productos + ' productos. Borra alguno vendido para añadir otro.'
        : MENSAJE_ERROR;
      return;
    }
    vista = 'web';
    cerrarFicha();
    avisar('Añadido a la web: ' + nuevo.nombre);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!borrador) return;
    if (fotoTrabajando) { $('ficha-error').textContent = 'Espera un momento: se está preparando la foto.'; return; }
    var errores = leerFicha();
    if (errores.length) { mostrarErrores(errores); return; }
    if (!esNuevo) { cancelarFicha(); return; }
    if (contenido.productos.length >= C.LIMITES.productos) {
      $('ficha-error').textContent = 'Has llegado al máximo de ' + C.LIMITES.productos + ' productos. Borra alguno vendido para añadir otro.';
      return;
    }
    if (!C.fotoValida(borrador.foto)) {
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
      var r = aplicar(function (c) { c.productos = c.productos.filter(function (x) { return x.id !== id; }); });
      if (r.ok) { cerrarFicha(); avisar('Borrado: ' + nombre); }
    });
  });

  // ---------- Foto: se reduce a 900 px de lado y se guarda en JPEG ----------

  function prepararFoto(archivo) {
    return new Promise(function (resolver, rechazar) {
      if (!archivo || !/^image\//.test(archivo.type)) { rechazar(new Error('tipo')); return; }
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        try {
          var lado = Math.max(img.naturalWidth, img.naturalHeight);
          var escala = Math.min(1, 900 / lado);
          var lienzo = document.createElement('canvas');
          lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
          lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
          var ctx = lienzo.getContext('2d');
          ctx.fillStyle = '#ffffff';            // fondo blanco para PNG con transparencias
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
          var datos = lienzo.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(url);
          if (!C.fotoValida(datos)) { rechazar(new Error('formato')); return; }
          resolver(datos);
        } catch (err) {
          URL.revokeObjectURL(url);
          rechazar(err);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rechazar(new Error('abrir')); };
      img.src = url;
    });
  }

  function alElegirFoto(e) {
    var input = e.target;
    var archivo = input.files && input.files[0];
    input.value = '';
    if (!archivo || !borrador) return;
    fotoTrabajando = true;
    $('foto-estado').textContent = 'Preparando la foto…';
    prepararFoto(archivo).then(function (datos) {
      fotoTrabajando = false;
      if (!borrador) return;
      var anterior = borrador.foto;
      borrador.foto = datos;
      var r = guardarEdicion();
      if (!r.ok && r.motivo === 'cuota') {
        borrador.foto = anterior;
        $('foto-estado').textContent = MENSAJE_CUOTA;
      } else {
        $('foto-estado').textContent = 'Foto lista ✓';
      }
      pintarFoto();
      pintarPrevia();
    }, function () {
      fotoTrabajando = false;
      $('foto-estado').textContent = 'No se ha podido abrir esa foto. Prueba con otra o hazla de nuevo.';
    });
  }
  $('foto-camara').addEventListener('change', alElegirFoto);
  $('foto-galeria').addEventListener('change', alElegirFoto);
  $('foto-caja').addEventListener('click', function () { $('foto-camara').click(); });
  $('foto-elegir').addEventListener('click', function () { $('foto-galeria').click(); });
  $('foto-quitar').addEventListener('click', function () {
    if (!borrador) return;
    borrador.foto = '';
    guardarEdicion();
    $('foto-estado').textContent = 'Foto quitada. Saldrá un cartel con un dibujo.';
    pintarFoto();
    pintarPrevia();
    $('foto-caja').focus();
  });

  $('anadir').addEventListener('click', function () {
    if (contenido.productos.length >= C.LIMITES.productos) {
      avisar('Has llegado al máximo de ' + C.LIMITES.productos + ' productos. Borra alguno vendido para poder añadir otro.', { error: true });
      return;
    }
    abrirFicha(null);
  });

  // ---------- Guardado automático de los formularios ----------

  function conRetraso(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      $('guardado').textContent = 'Guardando…';
      $('guardado').dataset.estado = 'pendiente';
      t = setTimeout(fn, ms || 600);
    };
  }
  function guardadoForm(r) { if (r && r.ok) avisar('Guardado'); }

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
    var r = aplicar(function (c) { c.tienda.aviso = { activo: activo, texto: texto }; });
    if (r.ok) avisar(activo ? 'Aviso puesto en la web' : 'Aviso quitado de la web');
    pintarAviso();
  });
  var guardarAviso = conRetraso(function () {
    var texto = $('aviso-texto').value.trim();
    var apagado = false;
    var r = aplicar(function (c) {
      c.tienda.aviso.texto = texto;
      if (!texto && c.tienda.aviso.activo) { c.tienda.aviso.activo = false; apagado = true; }
    });
    if (r.ok) avisar(apagado ? 'Aviso quitado: se ha quedado sin texto' : 'Guardado');
    pintarAviso('nunca');
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
    if (respetarFoco && ol.contains(document.activeElement)) return;
    ol.textContent = '';
    contenido.tienda.horario.forEach(function (t) { ol.appendChild(crearTramo(t)); });
    pintarPreviaHorario(contenido.tienda.horario);
  }

  var guardarHorario = conRetraso(function () {
    var r = leerTramos();
    pintarPreviaHorario(r.tramos);
    if (r.hayError) { avisarGuardado(false, 'Falta corregir el horario'); return; }
    guardadoForm(aplicar(function (c) { c.tienda.horario = r.tramos; }));
  });
  $('tramos').addEventListener('input', function () { pintarPreviaHorario(leerTramos().tramos); guardarHorario(); });
  $('tramos').addEventListener('change', function () { pintarPreviaHorario(leerTramos().tramos); guardarHorario(); });
  $('tramos').addEventListener('click', function (e) {
    var b = e.target.closest('.tramo__quitar');
    if (!b) return;
    b.closest('.tramo').remove();
    var r = leerTramos();
    pintarPreviaHorario(r.tramos);
    if (!r.hayError && aplicar(function (c) { c.tienda.horario = r.tramos; }).ok) avisar('Horario quitado');
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
    guardadoForm(aplicar(function (c) { c.portada.titular = titular; }));
  });
  var guardarEntradilla = conRetraso(function () {
    var entradilla = $('entradilla').value.replace(/\s+/g, ' ').trim();
    guardadoForm(aplicar(function (c) { c.portada.entradilla = entradilla; }));
  });
  $('titular').addEventListener('input', function () {
    limitarLineas($('titular'), C.LIMITES.lineasTitular, 'titular');
    pintarPreviaTextos();
    guardarTitular();
  });
  $('entradilla').addEventListener('input', function () { pintarPreviaTextos(); guardarEntradilla(); });

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
    guardadoForm(aplicar(function (c) { c.tienda.telefono = tel; }));
  });
  var guardarWhatsapp = conRetraso(function () {
    var wa = validarWhatsapp();
    if (wa === null) { avisarGuardado(false, 'Falta corregir el WhatsApp'); return; }
    guardadoForm(aplicar(function (c) { c.tienda.whatsapp = wa; }));
  });
  var guardarDireccion = conRetraso(function () {
    var direccion = $('direccion').value.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean).slice(0, C.LIMITES.lineasDireccion).join('\n');
    guardadoForm(aplicar(function (c) { c.tienda.direccion = direccion; }));
  });
  $('telefono').addEventListener('input', guardarTelefono);
  $('whatsapp').addEventListener('input', guardarWhatsapp);
  $('direccion').addEventListener('input', function () {
    limitarLineas($('direccion'), C.LIMITES.lineasDireccion, 'direccion');
    guardarDireccion();
  });

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
    guardadoForm(aplicar(function (c) { c.opiniones.nota = n; }));
  });
  var guardarTotal = conRetraso(function () {
    var t = $('op-total').value.trim();
    if (t !== '' && !/^\d+$/.test(t)) {
      errorCampo('op-total', 'Escribe solo el número, por ejemplo 28.');
      avisarGuardado(false, 'Falta corregir el número de opiniones');
      return;
    }
    errorCampo('op-total', '');
    guardadoForm(aplicar(function (c) { c.opiniones.total = t === '' ? null : parseInt(t, 10); }));
  });
  var guardarLista = conRetraso(function () {
    var lista = leerOpiniones();
    guardadoForm(aplicar(function (c) { c.opiniones.lista = lista; }));
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
    if (aplicar(function (c) { c.opiniones.lista = lista; }).ok) avisar('Opinión quitada');
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
    var r = aplicar(function (c) { c.financiacion.activa = activa; });
    if (r.ok) avisar(activa ? 'Financiación: ahora sale en la web' : 'Financiación: ya no sale en la web');
  });
  var guardarFinTexto = conRetraso(function () {
    var texto = $('fin-texto').value.replace(/\s+/g, ' ').trim();
    guardadoForm(aplicar(function (c) { c.financiacion.texto = texto; }));
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
    var r = aplicar(function (c) { c.marcas.push(m); });
    if (r.ok) {
      campo.value = '';
      pintarMarcasPanel();
      avisar('Marca añadida: ' + m);
      campo.focus();
    }
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
    var r = aplicar(function (c) { c.marcas = c.marcas.filter(function (x) { return x !== m; }); });
    if (r.ok) { pintarMarcasPanel(); avisar('Marca quitada: ' + m); $('marca-nueva').focus(); }
  });

  var guardarDesde = conRetraso(function () {
    var t = $('desde').value.trim();
    if (t !== '' && (!/^(19|20)\d{2}$/.test(t) || parseInt(t, 10) > new Date().getFullYear())) {
      errorCampo('desde', 'Escribe el año con 4 cifras, por ejemplo 2003.');
      avisarGuardado(false, 'Falta corregir el año');
      return;
    }
    errorCampo('desde', '');
    guardadoForm(aplicar(function (c) { c.desde = t; }));
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
    poner('telefono', contenido.tienda.telefono);
    poner('whatsapp', C.whatsappLegible(contenido.tienda.whatsapp));
    poner('direccion', contenido.tienda.direccion);
    validarTelefono();
    validarWhatsapp();
    pintarConfianza(respetarFoco);
  }

  $('restaurar').addEventListener('click', function () {
    confirmar({
      texto: '¿Volver al ejemplo?', detalle: 'Se borran tus productos, el horario y los textos que hayas cambiado en este navegador.',
      si: 'Sí, restaurar', no: 'No, volver', peligro: true
    }).then(function (si) {
      if (!si) return;
      contenido = window.restaurarEjemplo();
      vista = 'web';
      pintarLista();
      pintarFormularios();
      avisarGuardado(true, 'Ejemplo restaurado ✓');
      avisar('Ejemplo restaurado');
    });
  });

  // Cambios hechos en otra pestaña: se traen, sin tocar lo que se está escribiendo ni la ficha abierta
  window.addEventListener('storage', function (e) {
    if (e.key !== C.CLAVE && e.key !== null) return;
    contenido = window.cargarContenido();
    pintarLista();
    pintarFormularios(true);
    if (ficha.open) pintarPrevia();
    avisar(ficha.open
      ? 'Se han hecho cambios en otra pestaña. La ficha abierta sigue con lo tuyo.'
      : 'Se han hecho cambios en otra pestaña: ya los ves aquí.');
  });

  pintarLista();
  pintarFormularios();
})();
