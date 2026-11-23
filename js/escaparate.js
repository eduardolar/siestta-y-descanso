// El escaparate: tarjetas de producto con reserva por WhatsApp, filtros y los
// mini-carteles del cartel amarillo de Exposición. Todo se pinta con textContent
// (nunca innerHTML con datos), y las fotos solo se aceptan si pasan Contenido.fotoValida.
// El panel (admin.html) usa Escaparate.crearTarjeta para la vista previa.
(function () {
  'use strict';

  var C = window.Contenido;
  if (!C) return;
  var VERSION_FOTOS = '20261123-2';
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
    return C.urlFoto(foto, VERSION_FOTOS);
  }

  // Si una foto no carga (p. ej. se borró del bucket), en su lugar se pone otra cosa: en vez de un
  // icono de imagen rota, el marcador de «sin foto» (o lo que diga enLugar)
  function siFalla(img, enLugar) {
    img.addEventListener('error', function () {
      if (img.dataset.fallo) return;
      img.dataset.fallo = '1';
      enLugar(img);
    });
  }
  function marcadorEnLugar(categoria, clase) {
    return function (img) {
      var m = el('div', clase || 'producto__marcador');
      m.appendChild(icono(categoria));
      if (img.parentNode) img.parentNode.replaceChild(m, img);
    };
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
    var foto = C.fotoPrincipal(p);
    if (foto) {
      var img = el('img');
      img.src = srcFoto(foto);
      img.alt = p.nombre;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 400;
      img.height = 500;
      siFalla(img, marcadorEnLugar(p.categoria));
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

  function enlacePequeno(clase, texto, href, etiqueta) {
    var a = el('a', clase, texto);
    a.href = href;
    a.setAttribute('aria-label', etiqueta);
    nuevaPestana(a);
    return a;
  }

  // Solo dos acciones: «Reservar» (o «Avisadme si queda libre») y «Preguntar»
  function crearTarjeta(p, tienda) {
    var wa = tienda && tienda.whatsapp;
    var li = el('li', 'producto' + (p.estado === 'reservado' ? ' producto--reservado' : ''));
    li.dataset.categoria = p.categoria;
    li.dataset.id = p.id;
    // Tocar la foto o el nombre abre la ficha (js/ficha.js); para el teclado, el nombre es un enlace a #p/{id}
    var foto = crearFoto(p);
    foto.dataset.abrirFicha = p.id;
    li.appendChild(foto);

    var cuerpo = el('div', 'producto__cuerpo');
    cuerpo.appendChild(el('p', 'producto__cat', C.CATEGORIAS[p.categoria]));
    var titulo = el('h3', 'producto__nombre');
    var enlace = el('a', 'producto__enlace', p.nombre);
    enlace.href = '#p/' + p.id;
    titulo.appendChild(enlace);
    cuerpo.appendChild(titulo);
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
    acciones.appendChild(enlaces);

    cuerpo.appendChild(acciones);
    li.appendChild(cuerpo);
    return li;
  }

  function visibles(contenido) {
    // Primero los destacados; dentro de cada grupo, antes los que tienen foto (un escaparate
    // que empieza con huecos parece vacío); si no, el orden de la lista. Los vendidos no se ven.
    var lista = contenido.productos.filter(function (p) { return p.estado !== 'vendido'; });
    var rango = function (p) { return (p.destacado ? 0 : 2) + (C.fotoPrincipal(p) ? 0 : 1); };
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

  function movimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  // ---------- Carrusel «Ahora en tienda»: una fila deslizable con todos los del filtro ----------

  // Flechas (solo escritorio: el CSS las esconde en pantallas pequeñas) y la posición «1–3 de 7»
  function actualizarCarrusel() {
    var lista = document.getElementById('productos');
    if (!lista) return;
    var tarjetas = lista.querySelectorAll('.producto');
    var ant = document.getElementById('carrusel-ant');
    var sig = document.getElementById('carrusel-sig');
    var pos = document.getElementById('carrusel-posicion');
    var max = lista.scrollWidth - lista.clientWidth;
    if (ant) ant.hidden = lista.scrollLeft <= 2;
    if (sig) sig.hidden = lista.scrollLeft >= max - 2;
    if (!pos) return;
    if (!tarjetas.length || max <= 2) { pos.textContent = ''; return; }
    // Las que se ven enteras (o casi)
    var caja = lista.getBoundingClientRect();
    var primera = 0;
    var ultima = 0;
    Array.prototype.forEach.call(tarjetas, function (li, i) {
      var r = li.getBoundingClientRect();
      var visible = Math.min(r.right, caja.right) - Math.max(r.left, caja.left);
      if (visible >= r.width * 0.6) {
        if (!primera) primera = i + 1;
        ultima = i + 1;
      }
    });
    if (!primera) { primera = 1; ultima = 1; }
    pos.textContent = (primera === ultima ? primera : primera + '–' + ultima) + ' de ' + tarjetas.length;
  }

  // Avanza o retrocede casi una pantalla de tarjetas
  function moverCarrusel(sentido) {
    var lista = document.getElementById('productos');
    if (!lista) return;
    var primera = lista.querySelector('.producto');
    var paso = primera ? primera.getBoundingClientRect().width : lista.clientWidth;
    var cuantas = Math.max(1, Math.floor((lista.clientWidth + 8) / (paso + 8)));
    lista.scrollBy({ left: sentido * cuantas * (paso + parseFloat(getComputedStyle(lista).columnGap || 0)), behavior: movimiento() });
  }

  function iniciarCarrusel() {
    var lista = document.getElementById('productos');
    var carrusel = document.getElementById('carrusel');
    if (!lista || !carrusel) return;
    var pendiente = false;
    lista.addEventListener('scroll', function () {
      if (pendiente) return;
      pendiente = true;
      window.requestAnimationFrame(function () { pendiente = false; actualizarCarrusel(); });
    }, { passive: true });
    window.addEventListener('resize', actualizarCarrusel);
    var ant = document.getElementById('carrusel-ant');
    var sig = document.getElementById('carrusel-sig');
    if (ant) ant.addEventListener('click', function () { moverCarrusel(-1); });
    if (sig) sig.addEventListener('click', function () { moverCarrusel(1); });
    // Teclado: la tarjeta que recibe el foco se pone a la vista
    lista.addEventListener('focusin', function (e) {
      var li = e.target.closest('.producto');
      if (li) li.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: movimiento() });
    });
    // Un arrastre (dedo o ratón) que desplaza el carrusel NO abre la ficha: solo un toque sin moverse
    var inicio = null;
    lista.addEventListener('pointerdown', function (e) {
      inicio = { x: e.clientX, y: e.clientY, scroll: lista.scrollLeft };
    }, { passive: true });
    carrusel.addEventListener('click', function (e) {
      if (!inicio || !lista.contains(e.target)) return;
      var movido = Math.abs(e.clientX - inicio.x) > 10 || Math.abs(lista.scrollLeft - inicio.scroll) > 10;
      inicio = null;
      if (movido) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  // volverAlPrincipio: al cambiar de filtro, el carrusel empieza otra vez por el primero
  function pintarEscaparate(contenido, volverAlPrincipio) {
    var lista = document.getElementById('productos');
    var filtros = document.getElementById('filtros');
    var vacio = document.getElementById('escaparate-vacio');
    var cuenta = document.getElementById('escaparate-cuenta');
    var carrusel = document.getElementById('carrusel');
    if (!lista) return;

    var todos = visibles(contenido);
    var elegidos = todos.filter(FILTROS[filtroActual] || FILTROS.todo);

    // Si el foco estaba en una tarjeta, se devuelve a la misma tras repintar
    var activo = document.activeElement;
    var conFoco = activo && lista.contains(activo) ? activo.closest('.producto') : null;
    var idFoco = conFoco ? conFoco.dataset.id : null;

    lista.textContent = '';
    elegidos.forEach(function (p) { lista.appendChild(crearTarjeta(p, contenido.tienda)); });
    if (carrusel) carrusel.hidden = !elegidos.length;
    if (volverAlPrincipio) lista.scrollTo({ left: 0, behavior: 'auto' });
    if (idFoco) {
      var otra = lista.querySelector('.producto[data-id="' + idFoco + '"] .producto__enlace');
      if (otra) otra.focus({ preventScroll: true });
    }
    actualizarCarrusel();

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
          ? 'Ahora no hay productos en la web.'
          : 'Ahora no hay ' + nombre + ' en la web.';
        var a = vacio.querySelector('a');
        a.href = C.enlaceWhatsApp(contenido.tienda.whatsapp, 'Hola, ¿qué ' + nombre + ' tenéis ahora en la tienda?');
      }
    }
    if (cuenta) {
      cuenta.textContent = elegidos.length === 1 ? '1 producto' : elegidos.length + ' productos';
    }
  }

  var FOTO_TIENDA = 'img/tienda-sofa-blanco.jpg';
  var ALT_TIENDA = 'Sofá chaiselongue blanco con una manta en la exposición de la tienda, junto al expositor de almohadas';

  // La portada: si el panel destaca un producto que se ve en la web, su foto (o la de la tienda si no
  // tiene) y una tarjeta con su nombre y precio que abre su ficha; si no, solo la foto de la tienda.
  // raiz: dónde buscar las piezas (la web, o la vista previa del panel)
  function pintarPortada(contenido, raiz) {
    raiz = raiz || document;
    var img = raiz.querySelector('.portada__foto img');
    var caja = raiz.querySelector('.oferta-destacada');
    if (!img || !caja) return;
    var id = contenido.portada.destacado;
    var p = id ? visibles(contenido).filter(function (x) { return x.id === id; })[0] : null;
    var fotoProducto = p ? C.fotoPrincipal(p) : '';
    var foto = fotoProducto || contenido.portada.foto;
    // Si no carga: la foto de la tienda de siempre; si tampoco, sin foto
    if (!img.dataset.respaldo) {
      img.dataset.respaldo = '1';
      img.addEventListener('error', function () {
        var deSiempre = srcFoto(FOTO_TIENDA);
        if (img.getAttribute('src') !== deSiempre) {
          img.src = deSiempre;
          img.alt = ALT_TIENDA;
        } else {
          img.hidden = true;
          if (img.parentNode) img.parentNode.classList.add('portada__foto--sin');
        }
      });
    }
    img.hidden = false;
    if (img.parentNode) img.parentNode.classList.remove('portada__foto--sin');
    img.src = srcFoto(foto);
    img.alt = fotoProducto ? p.nombre : foto === FOTO_TIENDA ? ALT_TIENDA : 'Nuestra tienda';

    caja.hidden = !p;
    caja.textContent = '';
    if (!p) { caja.removeAttribute('href'); return; }
    caja.href = '#p/' + p.id;
    if (p.etiqueta) caja.appendChild(el('span', 'pastilla pastilla--' + p.etiqueta, C.ETIQUETAS[p.etiqueta]));
    caja.appendChild(el('span', 'oferta-destacada__nombre', p.nombre));
    if (p.estado === 'reservado') caja.appendChild(el('span', 'oferta-destacada__estado', 'Reservado'));
    var precio = el('span', 'etiqueta-precio' + (p.precio === null ? ' etiqueta-precio--consultar' : ''));
    if (p.precio === null) {
      precio.textContent = 'Consultar';
    } else {
      var fuerte = el('strong');
      importe(fuerte, C.formatearPrecio(p.precio));
      precio.appendChild(fuerte);
    }
    caja.appendChild(precio);
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
      pintarEscaparate(contenido, true);
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
    iniciarCarrusel();
    pintarEscaparate(contenido);
    pintarTira(contenido);
    pintarPortada(contenido);

    // Cuando llega lo del servidor, o el panel guarda en otra pestaña, se repinta
    C.alCambiar(function () {
      contenido = window.cargarContenido();
      pintarEscaparate(contenido);
      pintarTira(contenido);
      pintarPortada(contenido);
    });
  }

  // La ficha de producto (js/ficha.js) usa las mismas piezas que las tarjetas
  window.Escaparate = {
    crearTarjeta: crearTarjeta,
    pintarPortada: pintarPortada,
    piezas: {
      el: el, icono: icono, iconoWa: iconoWa, srcFoto: srcFoto, crearPrecio: crearPrecio,
      siFalla: siFalla, marcadorEnLugar: marcadorEnLugar,
      nuevaPestana: nuevaPestana, visibles: visibles,
      mensajeReserva: mensajeReserva, mensajeAviso: mensajeAviso, mensajePregunta: mensajePregunta
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
