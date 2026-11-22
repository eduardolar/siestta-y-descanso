// El escaparate: tarjetas de producto con reserva por WhatsApp, filtros y los
// mini-carteles del cartel amarillo de Exposición. Todo se pinta con textContent
// (nunca innerHTML con datos), y las fotos solo se aceptan si pasan Contenido.fotoValida.
// El panel (admin.html) usa Escaparate.crearTarjeta para la vista previa.
(function () {
  'use strict';

  var C = window.Contenido;
  if (!C) return;
  var VERSION_FOTOS = '20261122-16';
  var SVG = 'http://www.w3.org/2000/svg';

  // Iconos de los marcadores sin foto (trazos de 24×24, como los del resto de la web)
  var ICONOS = {
    sofas: ['M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3', 'M3 11a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v6H3Z', 'M5 17v2M19 17v2'],
    sillones: ['M7 11V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6', 'M4 11a2 2 0 0 1 3 1.7V14h10v-1.3A2 2 0 0 1 20 11v6H4Z', 'M6 17v3M18 17v3'],
    colchones: ['M3 9h18v8H3z', 'M3 13h18', 'M7 9v8M12 9v8M17 9v8'],
    camas: ['M3 18V6', 'M3 11h7a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v7', 'M3 14h18', 'M3 18h18']
  };

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function icono(categoria) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    (ICONOS[categoria] || ICONOS.sofas).forEach(function (d) {
      var p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }

  function iconoWa() {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(SVG, 'use');
    u.setAttribute('href', '#i-wa');
    s.appendChild(u);
    return s;
  }

  function srcFoto(foto) {
    return foto.indexOf('data:') === 0 ? foto : foto + '?v=' + VERSION_FOTOS;
  }

  function textoPrecio(p) {
    return p.precio === null ? 'precio a consultar' : C.formatearPrecio(p.precio);
  }

  function mensajeReserva(p) {
    return 'Hola, quiero reservar: ' + p.nombre + ' (ref. ' + p.id + ') · ' + textoPrecio(p) + '. ¿Me lo podéis guardar? Espero vuestra confirmación.';
  }
  function mensajeAviso(p) {
    return 'Hola, he visto en la web ' + p.nombre + ' (ref. ' + p.id + '), que está reservado. ¿Me avisáis si queda libre?';
  }
  function mensajePregunta(p) {
    return 'Hola, quería preguntar por ' + p.nombre + ' (ref. ' + p.id + ').';
  }

  function nuevaPestana(a) {
    a.target = '_blank';
    a.rel = 'noopener';
  }

  // La foto (4:5, sin marco), la pastilla de la etiqueta y, si toca, el sello de reservado
  function crearFoto(p) {
    var caja = el('div', 'producto__foto');
    if (C.fotoValida(p.foto)) {
      var img = el('img');
      img.src = srcFoto(p.foto);
      img.alt = p.nombre;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 400;
      img.height = 500;
      caja.appendChild(img);
    } else {
      var marcador = el('div', 'producto__marcador');
      marcador.appendChild(icono(p.categoria));
      caja.appendChild(marcador);
    }
    if (p.etiqueta) caja.appendChild(el('span', 'pastilla pastilla--' + p.etiqueta, C.ETIQUETAS[p.etiqueta]));
    if (p.estado === 'reservado') caja.appendChild(el('span', 'producto__sello', 'Reservado'));
    return caja;
  }

  // «699 €» → «699» + el «€» en un span, para pintarlo más pequeño en la etiqueta amarilla
  function importe(caja, texto) {
    var m = /^(.*\S)\s€$/.exec(texto);
    if (!m) { caja.appendChild(document.createTextNode(texto)); return; }
    caja.appendChild(document.createTextNode(m[1]));
    caja.appendChild(el('span', 'producto__euro', String.fromCharCode(160) + '€'));
  }

  function crearPrecio(p) {
    var caja = el('p', 'producto__precio');
    if (p.precio === null) {
      caja.classList.add('producto__precio--consultar');
      caja.textContent = 'Precio: consultar';
      return caja;
    }
    if (p.precioAntes !== null) {
      var antes = el('del', 'producto__antes');
      antes.appendChild(el('span', 'visualmente-oculto', 'Antes '));
      antes.appendChild(document.createTextNode(C.formatearPrecio(p.precioAntes)));
      caja.appendChild(antes);
      caja.appendChild(document.createTextNode(' '));
    }
    var ahora = el('strong', null);
    if (p.precioAntes !== null) ahora.appendChild(el('span', 'visualmente-oculto', 'Ahora '));
    importe(ahora, C.formatearPrecio(p.precio));
    caja.appendChild(ahora);
    return caja;
  }

  function mensajeFinanciacion(p) {
    return 'Hola, me interesa ' + p.nombre + ' (ref. ' + p.id + '). ¿Qué opciones de financiación tenéis?';
  }

  function enlacePequeno(clase, texto, href, etiqueta) {
    var a = el('a', clase, texto);
    a.href = href;
    a.setAttribute('aria-label', etiqueta);
    nuevaPestana(a);
    return a;
  }

  // opciones.financiacion: añade el enlace «Financiación» (si la tienda la ofrece)
  function crearTarjeta(p, tienda, opciones) {
    var wa = tienda && tienda.whatsapp;
    var li = el('li', 'producto' + (p.estado === 'reservado' ? ' producto--reservado' : ''));
    li.dataset.categoria = p.categoria;
    li.appendChild(crearFoto(p));

    var cuerpo = el('div', 'producto__cuerpo');
    cuerpo.appendChild(el('p', 'producto__cat', C.CATEGORIAS[p.categoria]));
    cuerpo.appendChild(el('h3', 'producto__nombre', p.nombre));
    if (p.estado === 'reservado') {
      cuerpo.appendChild(el('p', 'producto__estado', 'Reservado: puede que quede libre'));
    }
    if (p.descripcion) cuerpo.appendChild(el('p', 'producto__desc', p.descripcion));
    cuerpo.appendChild(crearPrecio(p));

    var acciones = el('div', 'producto__acciones');
    var reservar = el('a', 'boton boton--linea producto__reservar');
    if (p.estado === 'reservado') {
      reservar.textContent = 'Avisadme si queda libre';
      reservar.href = C.enlaceWhatsApp(wa, mensajeAviso(p));
      reservar.setAttribute('aria-label', 'Avisadme si queda libre: ' + p.nombre + ' (WhatsApp)');
    } else {
      reservar.textContent = 'Reservar';
      reservar.href = C.enlaceWhatsApp(wa, mensajeReserva(p));
      reservar.setAttribute('aria-label', 'Reservar ' + p.nombre + ' por WhatsApp');
    }
    nuevaPestana(reservar);
    acciones.appendChild(reservar);

    var enlaces = el('span', 'producto__enlaces');
    enlaces.appendChild(enlacePequeno('producto__preguntar', 'Preguntar',
      C.enlaceWhatsApp(wa, mensajePregunta(p)), 'Preguntar por ' + p.nombre + ' por WhatsApp'));
    if (opciones && opciones.financiacion) {
      enlaces.appendChild(enlacePequeno('producto__financiar', 'Financiación',
        C.enlaceWhatsApp(wa, mensajeFinanciacion(p)), 'Preguntar por la financiación de ' + p.nombre + ' por WhatsApp'));
    }
    acciones.appendChild(enlaces);

    cuerpo.appendChild(acciones);
    li.appendChild(cuerpo);
    return li;
  }

  function visibles(contenido) {
    // Primero los destacados; dentro de cada grupo, antes los que tienen foto (un escaparate
    // que empieza con huecos parece vacío); si no, el orden de la lista. Los vendidos no se ven.
    var lista = contenido.productos.filter(function (p) { return p.estado !== 'vendido'; });
    var rango = function (p) { return (p.destacado ? 0 : 2) + (p.foto ? 0 : 1); };
    return lista
      .map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return rango(a.p) - rango(b.p) || a.i - b.i; })
      .map(function (x) { return x.p; });
  }

  var FILTROS = {
    todo: function () { return true; },
    sofas: function (p) { return p.categoria === 'sofas'; },
    sillones: function (p) { return p.categoria === 'sillones'; },
    colchones: function (p) { return p.categoria === 'colchones'; },
    camas: function (p) { return p.categoria === 'camas'; },
    ofertas: function (p) { return p.etiqueta !== ''; }
  };
  var NOMBRE_FILTRO = { todo: 'productos', sofas: 'sofás', sillones: 'sillones', colchones: 'colchones', camas: 'camas', ofertas: 'ofertas' };

  var filtroActual = 'todo';
  var todosALaVista = false;   // tras pulsar «Ver los N productos»
  // Productos a la vista antes de «Ver los N»: una fila de 3 en escritorio y tableta, 2×2 en el móvil
  function limite() {
    return window.matchMedia && window.matchMedia('(min-width: 681px)').matches ? 3 : 4;
  }

  // Tarjeta-llamada para mayores y familias, dentro de la rejilla
  function crearLlamada(tienda) {
    var li = el('li', 'llamada');
    li.appendChild(el('p', 'llamada__ante', 'Para mayores y familias'));
    li.appendChild(el('p', 'cartel llamada__titulo', '¿Buscas algo para tus padres?'));
    li.appendChild(el('p', 'llamada__texto', 'Sillones relax, geriátricos y camas articuladas. Venid a probarlo juntos.'));
    var a = el('a', 'boton boton--wa llamada__boton');
    a.href = C.enlaceWhatsApp(tienda.whatsapp, 'Hola, busco un sillón o una cama para mis padres. ¿Podemos ir a probarlos?');
    nuevaPestana(a);
    a.appendChild(iconoWa());
    a.appendChild(document.createTextNode('Pregúntanos'));
    li.appendChild(a);
    return li;
  }

  function pintarEscaparate(contenido, enfocarDesde) {
    var lista = document.getElementById('productos');
    var filtros = document.getElementById('filtros');
    var vacio = document.getElementById('escaparate-vacio');
    var cuenta = document.getElementById('escaparate-cuenta');
    var mas = document.getElementById('ver-todos');
    if (!lista) return;

    var todos = visibles(contenido);
    var elegidos = todos.filter(FILTROS[filtroActual] || FILTROS.todo);
    var tope = limite();
    var mostrados = todosALaVista ? elegidos : elegidos.slice(0, tope);

    lista.textContent = '';
    mostrados.forEach(function (p, i) {
      lista.appendChild(crearTarjeta(p, contenido.tienda, { financiacion: contenido.financiacion.activa }));
      // La franja para mayores va tras la primera tanda (o al final si hay menos), solo en «Todo»
      if (filtroActual === 'todo' && (i === tope - 1 || (i === mostrados.length - 1 && i < tope - 1))) {
        lista.appendChild(crearLlamada(contenido.tienda));
      }
    });

    if (mas) {
      var quedan = elegidos.length > mostrados.length;
      mas.hidden = !quedan;
      if (quedan) mas.textContent = 'Ver los ' + elegidos.length + ' productos';
    }
    if (enfocarDesde !== undefined) {
      var siguiente = lista.querySelectorAll('.producto')[enfocarDesde];
      var enlace = siguiente && siguiente.querySelector('a');
      if (enlace) enlace.focus();
    }

    if (filtros) {
      filtros.hidden = false;
      Array.prototype.forEach.call(filtros.querySelectorAll('[data-filtro]'), function (b) {
        b.setAttribute('aria-pressed', b.dataset.filtro === filtroActual ? 'true' : 'false');
      });
    }

    if (vacio) {
      vacio.hidden = elegidos.length > 0;
      if (!elegidos.length) {
        var nombre = NOMBRE_FILTRO[filtroActual] || 'productos';
        vacio.querySelector('.escaparate__vacio-texto').textContent = filtroActual === 'todo'
          ? 'Estamos preparando el escaparate: pregúntanos por WhatsApp y te contamos qué tenemos.'
          : 'Ahora mismo no hay ' + nombre + ' en la web, pero en la tienda seguro que encuentras algo. Pregúntanos y te contamos qué tenemos.';
        var a = vacio.querySelector('a');
        a.href = C.enlaceWhatsApp(contenido.tienda.whatsapp, 'Hola, ¿qué ' + nombre + ' tenéis ahora en la tienda?');
      }
    }
    if (cuenta) {
      cuenta.textContent = elegidos.length === 1 ? '1 producto' : elegidos.length + ' productos';
    }
  }

  // La oferta de la portada: la primera pieza de exposición disponible con precio, en el orden en que
  // la dueña las tiene en el panel (no el del escaparate, para no repetir su primera tarjeta); si no hay, no sale
  function pintarOfertaPortada(contenido) {
    var caja = document.querySelector('.oferta-destacada');
    if (!caja) return;
    var p = contenido.productos.filter(function (x) {
      return x.etiqueta === 'exposicion' && x.estado === 'disponible' && typeof x.precio === 'number';
    })[0];
    caja.hidden = !p;
    if (!p) return;
    caja.querySelector('.oferta-destacada__nombre').textContent = p.nombre;
    var precio = caja.querySelector('.etiqueta-precio');
    precio.textContent = '';
    var fuerte = document.createElement('strong');
    importe(fuerte, C.formatearPrecio(p.precio));
    precio.appendChild(fuerte);
  }

  // La tira amarilla de exposición solo sale si hay piezas de exposición a la venta
  function pintarTira(contenido) {
    var tira = document.getElementById('exposicion');
    if (!tira) return;
    tira.hidden = !visibles(contenido).some(function (p) { return p.etiqueta === 'exposicion' && p.estado === 'disponible'; });
  }

  function iniciar() {
    var filtros = document.getElementById('filtros');
    if (!document.getElementById('productos')) return;
    var contenido = window.cargarContenido();

    function filtrar(nombre) {
      if (!FILTROS[nombre]) return;
      filtroActual = nombre;
      todosALaVista = false;
      pintarEscaparate(contenido);
    }
    if (filtros) {
      filtros.addEventListener('click', function (e) {
        var b = e.target.closest('[data-filtro]');
        if (b) filtrar(b.dataset.filtro);
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-ir-filtro]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        filtrar(a.dataset.irFiltro);
        var destino = document.getElementById('filtros');
        if (destino) {
          destino.scrollIntoView({ block: 'start' });
          var boton = destino.querySelector('[data-filtro="' + a.dataset.irFiltro + '"]');
          if (boton) boton.focus({ preventScroll: true });
        }
      });
    });
    var mas = document.getElementById('ver-todos');
    if (mas) {
      mas.addEventListener('click', function () {
        todosALaVista = true;
        pintarEscaparate(contenido, limite());
      });
    }
    pintarEscaparate(contenido);
    pintarTira(contenido);
    pintarOfertaPortada(contenido);

    // Si cambia el número de columnas (girar el móvil, estrechar la ventana), se recalcula cuántos se ven
    if (window.matchMedia) {
      var mq = window.matchMedia('(min-width: 681px)');
      var alCambiar = function () { if (!todosALaVista) pintarEscaparate(contenido); };
      if (mq.addEventListener) mq.addEventListener('change', alCambiar);
      else if (mq.addListener) mq.addListener(alCambiar);
    }

    // Si el panel está abierto en otra pestaña, la web se actualiza sola al guardar
    window.addEventListener('storage', function (e) {
      if (e.key !== C.CLAVE && e.key !== null) return;
      contenido = window.cargarContenido();
      pintarEscaparate(contenido);
      pintarTira(contenido);
      pintarOfertaPortada(contenido);
    });
  }

  window.Escaparate = { crearTarjeta: crearTarjeta };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
