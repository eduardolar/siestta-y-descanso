// El escaparate: tarjetas de producto con reserva por WhatsApp, filtros y los
// mini-carteles del cartel amarillo de Exposición. Todo se pinta con textContent
// (nunca innerHTML con datos), y las fotos solo se aceptan si pasan Contenido.fotoValida.
// El panel (admin.html) usa Escaparate.crearTarjeta para la vista previa.
(function () {
  'use strict';

  var C = window.Contenido;
  if (!C) return;
  var VERSION_FOTOS = '20261123-30';
  var SVG = 'http://www.w3.org/2000/svg';

  // Iconos de los marcadores sin foto (trazos de 24×24, como los del resto de la web)
  var ICONOS = {
    sofas: ['M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3', 'M3 11a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v6H3Z', 'M5 17v2M19 17v2'],
    sillones: ['M7 11V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6', 'M4 11a2 2 0 0 1 3 1.7V14h10v-1.3A2 2 0 0 1 20 11v6H4Z', 'M6 17v3M18 17v3'],
    colchones: ['M3 9h18v8H3z', 'M3 13h18', 'M7 9v8M12 9v8M17 9v8'],
    camas: ['M3 18V6', 'M3 11h7a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v7', 'M3 14h18', 'M3 18h18'],
    accesorios: ['M5 6c4-1.4 10-1.4 14 0 1.4 4 1.4 8 0 12-4 1.4-10 1.4-14 0-1.4-4-1.4-8 0-12Z', 'M9 10c2 .8 4 .8 6 0'],
    otros: ['M3 8l9-4 9 4-9 4-9-4Z', 'M3 8v8l9 4 9-4V8', 'M12 12v8']
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
    var li = el('li', 'producto' + (p.estado === 'reservado' ? ' producto--reservado' : '') +
      (p.enTemporada ? ' producto--temporada' : '')); // con temporada encendida lleva su cinta en la esquina (CSS)
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
    accesorios: function (p) { return p.categoria === 'accesorios'; },
    otros: function (p) { return p.categoria === 'otros'; },
    ofertas: function (p) { return p.etiqueta !== ''; }
  };
  var NOMBRE_FILTRO = { todo: 'productos', sofas: 'sofás', sillones: 'sillones', colchones: 'colchones', camas: 'camas',
    accesorios: 'accesorios', otros: 'otros productos', ofertas: 'ofertas' };

  var filtroActual = 'todo';

  function movimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  // ---------- Carrusel: una fila deslizable (la de «Ahora en tienda» y la de la temporada) ----------

  // Las piezas de un carrusel: la pista (ul), su caja, las flechas y la posición «1–3 de 7»
  function piezasTienda() {
    return {
      lista: document.getElementById('productos'), carrusel: document.getElementById('carrusel'),
      ant: document.getElementById('carrusel-ant'), sig: document.getElementById('carrusel-sig'),
      pos: document.getElementById('carrusel-posicion')
    };
  }

  // Flechas (solo escritorio: el CSS las esconde en pantallas pequeñas) y la posición «1–3 de 7»
  function actualizarCarrusel(c) {
    c = c || piezasTienda();
    var lista = c.lista;
    if (!lista) return;
    var tarjetas = lista.querySelectorAll('.producto');
    var ant = c.ant;
    var sig = c.sig;
    var pos = c.pos;
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
  function moverCarrusel(c, sentido) {
    var lista = c.lista;
    if (!lista) return;
    var primera = lista.querySelector('.producto');
    var paso = primera ? primera.getBoundingClientRect().width : lista.clientWidth;
    var cuantas = Math.max(1, Math.floor((lista.clientWidth + 8) / (paso + 8)));
    lista.scrollBy({ left: sentido * cuantas * (paso + parseFloat(getComputedStyle(lista).columnGap || 0)), behavior: movimiento() });
  }

  function iniciarCarrusel(c) {
    c = c || piezasTienda();
    var lista = c.lista;
    var carrusel = c.carrusel;
    if (!lista || !carrusel) return;
    var pendiente = false;
    lista.addEventListener('scroll', function () {
      if (pendiente) return;
      pendiente = true;
      window.requestAnimationFrame(function () { pendiente = false; actualizarCarrusel(c); });
    }, { passive: true });
    window.addEventListener('resize', function () { actualizarCarrusel(c); });
    if (c.ant) c.ant.addEventListener('click', function () { moverCarrusel(c, -1); });
    if (c.sig) c.sig.addEventListener('click', function () { moverCarrusel(c, 1); });
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

  // ---------- Temporada y anuncio ----------

  // Pictogramas de cada temporada (trazos de 24×24, como los demás iconos)
  var PICTOS = {
    navidad: ['M12 3l5 7h-3l4 6H6l4-6H7z', 'M12 16v4'],
    'black-friday': ['M3 12V4h8l10 10-8 8z', 'M7.5 7.5h.01'],
    rebajas: ['M5 19 19 5', 'M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
    feria: ['M12 3v4M12 17v4M3 12h4M17 12h4', 'M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8']
  };
  function picto(tipo, clase) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (clase) s.setAttribute('class', clase);
    (PICTOS[tipo] || []).forEach(function (d) {
      var p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }

  // «Piel» de temporada: clases «skin tema--…» en <html>; estilos.css tiñe con ellas portada, barras,
  // botones, etiquetas y contacto. js/tema.js ya las pone antes de pintar (con la caché); aquí se
  // corrigen si lo del servidor dice otra cosa. Solo en la web (el panel no se tiñe)
  // Las animaciones de la portada se paran cuando no se ve o la pestaña está oculta (clase «deco-quieta» en <html>)
  var vigilandoPortada = false;
  function vigilarPortada() {
    if (vigilandoPortada || !('IntersectionObserver' in window)) return;
    var portada = document.querySelector('.portada');
    if (!portada) return;
    vigilandoPortada = true;
    var fuera = false;
    function quieta() { document.documentElement.classList.toggle('deco-quieta', fuera || document.hidden); }
    new IntersectionObserver(function (e) { fuera = !e[0].isIntersecting; quieta(); }).observe(portada);
    // Con la pestaña oculta, también quietas (los cruces de Navidad siguen donde iban al volver)
    document.addEventListener('visibilitychange', quieta);
  }
  // Navidad: tocar el trineo de Papá Noel deja caer un regalo (cae girando, rebota en la duna y se va).
  // Como mucho 3 a la vez. Es solo decoración: sin texto ni foco
  var regalosCayendo = 0;
  function soltarRegalo(e) {
    var portada = document.querySelector('.portada');
    var capa = document.querySelector('.deco-cruces');
    if (!portada || !capa || regalosCayendo >= 3) return;
    var caja = portada.getBoundingClientRect();
    var x = e.clientX - caja.left;
    var y = e.clientY - caja.top;
    var duna = Math.min(caja.height - 22, caja.height - 30);
    var r = document.createElement('div');
    r.className = 'regalo-cae';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.setProperty('--caida', Math.max(0, duna - y) + 'px');
    var colores = [['#c42032', '#e6c977'], ['#2e9b48', '#fff'], ['#1a6fb0', '#e6c977']][regalosCayendo % 3];
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 30 30');
    var caja1 = document.createElementNS(SVG, 'rect');
    caja1.setAttribute('x', '4'); caja1.setAttribute('y', '10'); caja1.setAttribute('width', '22'); caja1.setAttribute('height', '18');
    caja1.setAttribute('rx', '2'); caja1.setAttribute('fill', colores[0]);
    var lazo = document.createElementNS(SVG, 'path');
    lazo.setAttribute('d', 'M15 10v18M4 18h22M15 10q-6-8-9-3 2 3 9 3 7 0 9-3-3-5-9 3');
    lazo.setAttribute('fill', 'none'); lazo.setAttribute('stroke', colores[1]); lazo.setAttribute('stroke-width', '2.5');
    svg.appendChild(caja1);
    svg.appendChild(lazo);
    r.appendChild(svg);
    regalosCayendo++;
    // Se quita al acabar, si la animación se cancela (cambio de tema, display: none) o, por si acaso, a los 2,1 s
    var hecho = false;
    function quitar() {
      if (hecho) return;
      hecho = true;
      r.remove();
      regalosCayendo = Math.max(0, regalosCayendo - 1);
    }
    r.addEventListener('animationend', quitar);
    r.addEventListener('animationcancel', quitar);
    setTimeout(quitar, 1600 + 500);
    capa.appendChild(r);
  }
  // Sin Navidad: fuera los regalos que quedaran
  function limpiarRegalos() {
    Array.prototype.forEach.call(document.querySelectorAll('.regalo-cae'), function (r) { r.remove(); });
    regalosCayendo = 0;
  }
  var regaloListo = false;
  function prepararRegalo() {
    var noel = document.querySelector('.cruce-noel .noel-toque');
    if (regaloListo || !noel) return;
    regaloListo = true;
    noel.addEventListener('click', soltarRegalo);
  }
  function aplicarPiel(t) {
    if (document.body && document.body.classList.contains('panel')) return;
    if (t) vigilarPortada();
    if (t && t.tipo === 'navidad') prepararRegalo();
    else limpiarRegalos();
    var h = document.documentElement;
    Array.prototype.slice.call(h.classList).forEach(function (c) { if (/^tema--/.test(c)) h.classList.remove(c); });
    h.classList.toggle('skin', !!t);
    if (t) h.classList.add('tema--' + t.tipo);
  }

  // Banda fina encima de la barra roja con el texto de la temporada (o nada si no hay)
  function pintarBanda(contenido) {
    var t = C.temporadaActiva(contenido);
    aplicarPiel(t);
    var banda = document.getElementById('temporada-banda');
    if (!t) { if (banda) banda.remove(); return; }
    if (!banda) {
      banda = el('div', 'banda-temporada');
      banda.id = 'temporada-banda';
      banda.setAttribute('role', 'note');
      var barra = document.querySelector('.barra-sup');
      if (!barra || !barra.parentNode) return;
      barra.parentNode.insertBefore(banda, barra);
    }
    banda.className = 'banda-temporada tema--' + t.tipo;
    banda.textContent = '';
    // Marquesina lenta con el texto repetido (se para con el ratón encima y con «reducir movimiento»).
    // El texto se lee una vez (oculto a la vista); la tira que se mueve es solo decoración
    banda.appendChild(el('p', 'visualmente-oculto', t.texto));
    var pista = el('div', 'banda-temporada__pista');
    pista.setAttribute('aria-hidden', 'true');
    for (var k = 0; k < 2; k++) {
      var grupo = el('span', 'banda-temporada__grupo');
      for (var j = 0; j < 4; j++) {
        grupo.appendChild(picto(t.tipo, 'banda-temporada__picto'));
        grupo.appendChild(el('span', 'banda-temporada__texto', t.texto));
      }
      pista.appendChild(grupo);
    }
    banda.appendChild(pista);
  }

  // Sección con los productos marcados «En la temporada», con el mismo carrusel que «Ahora en tienda».
  // Solo existe si hay temporada encendida y al menos uno a la vista; se construye una vez y se reutiliza
  var seccionTemporada = null;
  function crearSeccionTemporada() {
    var s = el('section', 'seccion seccion-temporada');
    s.id = 'temporada';
    s.setAttribute('aria-labelledby', 't-temporada');
    var env = el('div', 'envoltura');
    var cab = el('div', 'seccion-temporada__cab');
    var h = el('h2', 'cartel seccion-temporada__titulo');
    h.id = 't-temporada';
    cab.appendChild(h);
    env.appendChild(cab);
    var car = el('div', 'carrusel');
    car.setAttribute('role', 'region');
    car.setAttribute('aria-roledescription', 'carrusel');
    function flecha(clase, etiqueta, d) {
      var b = el('button', 'carrusel__flecha ' + clase);
      b.type = 'button';
      b.setAttribute('aria-controls', 'temporada-productos');
      b.setAttribute('aria-label', etiqueta);
      b.hidden = true;
      var svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      var p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
      b.appendChild(svg);
      return b;
    }
    var ant = flecha('carrusel__flecha--ant', 'Productos anteriores', 'M15 5l-7 7 7 7');
    var ul = el('ul', 'productos carrusel__pista');
    ul.id = 'temporada-productos';
    var sig = flecha('carrusel__flecha--sig', 'Productos siguientes', 'M9 5l7 7-7 7');
    car.appendChild(ant);
    car.appendChild(ul);
    car.appendChild(sig);
    env.appendChild(car);
    var pos = el('p', 'carrusel__posicion');
    pos.setAttribute('aria-hidden', 'true');
    env.appendChild(pos);
    s.appendChild(env);
    var piezas = { lista: ul, carrusel: car, ant: ant, sig: sig, pos: pos };
    iniciarCarrusel(piezas);
    return { seccion: s, titulo: h, cab: cab, piezas: piezas };
  }

  // Dónde van el anuncio y la sección: justo después de la portada (el anuncio, antes)
  function trasPortada(nodo, antesDe) {
    var portada = document.querySelector('main .portada');
    if (!portada || !portada.parentNode) return;
    var ref = antesDe && antesDe.parentNode === portada.parentNode ? antesDe : portada.nextSibling;
    if (nodo.parentNode !== portada.parentNode || nodo.nextSibling !== ref) portada.parentNode.insertBefore(nodo, ref);
  }

  function pintarSeccionTemporada(contenido) {
    var t = C.temporadaActiva(contenido);
    var lista = t ? visibles(contenido).filter(function (p) { return p.enTemporada; }) : [];
    var enlaceNav = document.querySelector('.nav a[href="#temporada"]');
    if (!lista.length) {
      if (seccionTemporada && seccionTemporada.seccion.parentNode) seccionTemporada.seccion.remove();
      if (enlaceNav) enlaceNav.remove();
      return;
    }
    if (!seccionTemporada) seccionTemporada = crearSeccionTemporada();
    var s = seccionTemporada;
    s.seccion.className = 'seccion seccion-temporada tema--' + t.tipo;
    s.titulo.textContent = t.titulo;
    var viejo = s.cab.querySelector('svg');
    if (viejo) viejo.remove();
    s.cab.insertBefore(picto(t.tipo, 'seccion-temporada__picto'), s.titulo);
    s.piezas.carrusel.setAttribute('aria-label', t.titulo);
    var ul = s.piezas.lista;
    var activo = document.activeElement;
    var idFoco = activo && ul.contains(activo) && activo.closest('.producto') ? activo.closest('.producto').dataset.id : null;
    ul.textContent = '';
    lista.forEach(function (p) { ul.appendChild(crearTarjeta(p, contenido.tienda)); });
    var anuncio = document.getElementById('anuncio-destacado');
    trasPortada(s.seccion, null);
    if (anuncio && anuncio.parentNode) trasPortada(anuncio, s.seccion);
    if (idFoco) {
      var otra = ul.querySelector('.producto[data-id="' + idFoco + '"] .producto__enlace');
      if (otra) otra.focus({ preventScroll: true });
    }
    actualizarCarrusel(s.piezas);
    // Enlace en el menú, el primero (solo mientras la sección existe)
    var nav = document.querySelector('.nav');
    if (nav) {
      if (!enlaceNav) {
        enlaceNav = el('a');
        enlaceNav.href = '#temporada';
        nav.insertBefore(enlaceNav, nav.firstChild);
      }
      enlaceNav.textContent = t.titulo;
    }
  }

  // Tarjeta del anuncio (sorteo, evento…): justo después de la portada, con el color de la temporada
  // (o el rojo de la tienda si no hay)
  function crearAnuncio(a, tema) {
    var s = el('section', 'anuncio-destacado tema--' + tema);
    s.id = 'anuncio-destacado';
    s.setAttribute('aria-labelledby', 'anuncio-titulo');
    var env = el('div', 'envoltura anuncio-destacado__fila' + (a.foto ? ' anuncio-destacado__fila--foto' : ''));
    if (a.foto) {
      var fig = el('figure', 'anuncio-destacado__foto');
      var img = el('img');
      img.src = srcFoto(a.foto);
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      // Si no carga, sin foto (la tarjeta se queda con el texto)
      siFalla(img, function () {
        if (fig.parentNode) fig.remove();
        env.classList.remove('anuncio-destacado__fila--foto');
      });
      fig.appendChild(img);
      env.appendChild(fig);
    }
    var cuerpo = el('div', 'anuncio-destacado__cuerpo');
    cuerpo.appendChild(el('span', 'pastilla anuncio-destacado__pastilla', C.TIPOS_ANUNCIO[a.tipo]));
    var h = el('h2', 'cartel anuncio-destacado__titulo', a.titulo);
    h.id = 'anuncio-titulo';
    cuerpo.appendChild(h);
    if (a.texto) cuerpo.appendChild(el('p', 'anuncio-destacado__texto', a.texto));
    if (a.hasta) cuerpo.appendChild(el('p', 'anuncio-destacado__hasta', 'Hasta el ' + C.fechaLegible(a.hasta)));
    if (a.boton.enlace || a.bases) {
      var acciones = el('div', 'anuncio-destacado__acciones');
      if (a.boton.enlace) {
        var b = el('a', 'boton anuncio-destacado__boton',
          a.boton.texto || (/^https:\/\/wa\.me\//.test(a.boton.enlace) ? 'Escríbenos' : 'Ver la publicación'));
        b.href = a.boton.enlace;
        nuevaPestana(b);
        acciones.appendChild(b);
      }
      if (a.bases) {
        var bases = el('a', 'anuncio-destacado__bases', a.tipo === 'sorteo' ? 'Bases del sorteo' : 'Bases');
        bases.href = a.bases;
        nuevaPestana(bases);
        acciones.appendChild(bases);
      }
      cuerpo.appendChild(acciones);
    }
    env.appendChild(cuerpo);
    s.appendChild(env);
    return s;
  }

  function pintarAnuncio(contenido) {
    var viejo = document.getElementById('anuncio-destacado');
    var a = C.anuncioActivo(contenido);
    if (viejo) viejo.remove();
    if (!a) return;
    var t = C.temporadaActiva(contenido);
    var nuevo = crearAnuncio(a, t ? t.tipo : 'siestta');
    trasPortada(nuevo, seccionTemporada && seccionTemporada.seccion.parentNode ? seccionTemporada.seccion : null);
  }

  function pintarTemporada(contenido) {
    pintarBanda(contenido);
    pintarSeccionTemporada(contenido);
    pintarAnuncio(contenido);
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
    // Un sello discreto de la temporada (si hay una encendida)
    var t = C.temporadaActiva(contenido);
    if (t) {
      var sello = el('span', 'oferta-destacada__temporada tema--' + t.tipo);
      sello.appendChild(picto(t.tipo, 'oferta-destacada__picto'));
      sello.appendChild(document.createTextNode(C.TEMPORADAS[t.tipo].nombre));
      caja.appendChild(sello);
    }
    if (p.estado === 'reservado') caja.appendChild(el('span', 'oferta-destacada__estado', 'Reservado'));
    var rebaja = p.precio !== null && p.precioAntes !== null;
    var precio = el('span', 'etiqueta-precio' + (p.precio === null ? ' etiqueta-precio--consultar' : '') + (rebaja ? ' etiqueta-precio--rebaja' : ''));
    if (p.precio === null) {
      precio.textContent = 'Consultar';
    } else {
      // Con precio de antes: «Antes 399 €» tachado y «Ahora 299 €» (en Rebajas, la raya se dibuja y el precio cae; CSS)
      if (rebaja) {
        var antes = el('del', 'producto__antes');
        antes.appendChild(el('span', 'visualmente-oculto', 'Antes '));
        antes.appendChild(document.createTextNode(C.formatearPrecio(p.precioAntes)));
        precio.appendChild(antes);
        precio.appendChild(document.createTextNode(' ')); // que se lea «399 € Ahora», no «€Ahora»
      }
      var fuerte = el('strong');
      if (rebaja) fuerte.appendChild(el('span', 'visualmente-oculto', 'Ahora '));
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
    pintarTemporada(contenido);

    // Cuando llega lo del servidor, o el panel guarda en otra pestaña, se repinta
    C.alCambiar(function () {
      contenido = window.cargarContenido();
      pintarEscaparate(contenido);
      pintarTira(contenido);
      pintarPortada(contenido);
      pintarTemporada(contenido);
    });
  }

  // La ficha de producto (js/ficha.js) usa las mismas piezas que las tarjetas
  window.Escaparate = {
    crearTarjeta: crearTarjeta,
    pintarPortada: pintarPortada,
    // Para la vista previa del panel
    picto: picto,
    crearAnuncio: crearAnuncio,
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
