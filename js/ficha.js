// Ficha de producto: se abre al tocar la foto o el nombre de una tarjeta, en un <dialog> modal.
// Tiene enlace propio (#p/SOF-02): al abrirla se añade al historial, así «atrás» la cierra, y al
// cargar la página con ese enlace se abre sola. Los vendidos y las referencias que no existen no se abren.
// Todo se pinta con textContent (nunca innerHTML con datos), con las piezas de js/escaparate.js.
(function () {
  'use strict';

  var C = window.Contenido;
  var E = window.Escaparate;
  if (!C || !E || !E.piezas) return;
  var P = E.piezas;
  var el = P.el;
  var PREFIJO = '#p/';

  var dialogo, cuerpo, contenido;
  var actual = null;     // id del producto que se ve
  var origen = null;     // { id, nodo }: la tarjeta desde la que se abrió, para devolverle el foco
  var empujada = false;  // la ficha tiene su propia entrada en el historial (cerrar = volver atrás)
  var temporizadorAviso;
  var pendiente = null;  // id de un enlace #p/… que se abrirá cuando llegue lo del servidor

  function movimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  // El id del enlace #p/{id} en mayúsculas (#p/col-01 vale); null si el hash no es de ficha
  function idDelHash() {
    var h = location.hash;
    if (h.indexOf(PREFIJO) !== 0) return null;
    try { return decodeURIComponent(h.slice(PREFIJO.length)).toUpperCase(); } catch (e) { return ''; }
  }
  function urlSinHash() { return location.pathname + location.search; }
  function urlFicha(id) { return location.href.split('#')[0] + PREFIJO + id; }

  // Solo se abren los que se ven en la web (los vendidos no)
  function buscar(id) {
    var lista = P.visibles(contenido);
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function enlaceWa(clase, texto, mensaje, etiqueta) {
    var a = el('a', clase, texto);
    a.href = C.enlaceWhatsApp(contenido.tienda.whatsapp, mensaje);
    a.setAttribute('aria-label', etiqueta);
    P.nuevaPestana(a);
    return a;
  }

  // ---------- Galería: deslizable, con miniaturas y (en escritorio) flechas ----------

  function crearGaleria(p) {
    var caja = el('div', 'galeria');
    var marco = el('div', 'galeria__marco');
    var fotos = p.fotos.filter(C.fotoValida);
    var pista = null;

    if (!fotos.length) {
      var marcador = el('div', 'galeria__marcador');
      marcador.appendChild(P.icono(p.categoria));
      marco.appendChild(marcador);
    } else {
      pista = el('ul', 'galeria__pista');
      if (fotos.length > 1) {
        pista.tabIndex = 0; // se puede mover con las flechas del teclado
        pista.setAttribute('aria-label', 'Fotos de ' + p.nombre);
      }
      fotos.forEach(function (f, i) {
        var li = el('li', 'galeria__foto');
        var img = el('img');
        img.src = P.srcFoto(f);
        img.alt = fotos.length > 1 ? p.nombre + ', foto ' + (i + 1) + ' de ' + fotos.length : p.nombre;
        img.decoding = 'async';
        // Si no carga, el marcador de «sin foto» en su sitio
        P.siFalla(img, P.marcadorEnLugar(p.categoria, 'galeria__marcador'));
        li.appendChild(img);
        pista.appendChild(li);
      });
      marco.appendChild(pista);
    }
    if (p.etiqueta) marco.appendChild(el('span', 'pastilla pastilla--' + p.etiqueta, C.ETIQUETAS[p.etiqueta]));
    if (p.estado === 'reservado') marco.appendChild(el('span', 'producto__sello', 'Reservado'));
    caja.appendChild(marco);
    if (fotos.length < 2) return caja;

    // «2/4» sobre la foto (las miniaturas ya lo dicen a los lectores de pantalla)
    var contador = el('span', 'galeria__contador');
    contador.setAttribute('aria-hidden', 'true');
    marco.appendChild(contador);

    var anterior = el('button', 'galeria__flecha galeria__flecha--ant');
    var siguiente = el('button', 'galeria__flecha galeria__flecha--sig');
    [[anterior, 'Foto anterior', 'M15 5l-7 7 7 7'], [siguiente, 'Foto siguiente', 'M9 5l7 7-7 7']].forEach(function (x) {
      x[0].type = 'button';
      x[0].setAttribute('aria-label', x[1]);
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('aria-hidden', 'true');
      var d = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      d.setAttribute('d', x[2]);
      s.appendChild(d);
      x[0].appendChild(s);
      marco.appendChild(x[0]);
    });

    var minis = el('div', 'galeria__miniaturas');
    var botones = fotos.map(function (f, i) {
      var b = el('button', 'galeria__mini');
      b.type = 'button';
      b.setAttribute('aria-label', 'Ver foto ' + (i + 1) + ' de ' + fotos.length);
      var img = el('img');
      img.src = P.srcFoto(f);
      img.alt = '';
      P.siFalla(img, function (i) { i.hidden = true; });
      b.appendChild(img);
      b.addEventListener('click', function () { ir(i); });
      minis.appendChild(b);
      return b;
    });
    caja.appendChild(minis);

    var indice = -1;
    function ir(i) {
      i = Math.max(0, Math.min(fotos.length - 1, i));
      pista.scrollTo({ left: i * pista.clientWidth, behavior: movimiento() });
      marcar(i);
    }
    function marcar(i) {
      if (i === indice) return;
      indice = i;
      botones.forEach(function (b, n) {
        if (n === i) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      anterior.disabled = i === 0;
      siguiente.disabled = i === fotos.length - 1;
      contador.textContent = (i + 1) + '/' + fotos.length;
    }
    var pendiente = false;
    pista.addEventListener('scroll', function () {
      if (pendiente) return;
      pendiente = true;
      window.requestAnimationFrame(function () {
        pendiente = false;
        if (pista.clientWidth) marcar(Math.round(pista.scrollLeft / pista.clientWidth));
      });
    });
    anterior.addEventListener('click', function () { ir(indice - 1); });
    siguiente.addEventListener('click', function () { ir(indice + 1); });
    marcar(0);
    return caja;
  }

  // ---------- Datos y acciones ----------

  function crearTexto(p) {
    var t = p.descripcionLarga || p.descripcion;
    if (!t) return null;
    var caja = el('div', 'detalle__texto');
    t.split(/\n{2,}/).forEach(function (parrafo) {
      var pe = el('p');
      parrafo.split('\n').forEach(function (linea, i) {
        if (i) pe.appendChild(el('br'));
        pe.appendChild(document.createTextNode(linea));
      });
      caja.appendChild(pe);
    });
    return caja;
  }

  function crearDetalles(p) {
    var filas = [];
    if (p.medidas) filas.push(['Medidas', p.medidas]);
    if (p.colores) filas.push(['Telas', p.colores]);
    // La firmeza solo tiene sentido en colchones y camas (si quedó puesta en otra categoría, no sale)
    if ((p.categoria === 'colchones' || p.categoria === 'camas') && p.firmeza) filas.push(['Firmeza', C.FIRMEZAS[p.firmeza]]);
    if (p.aMedida) filas.push(['A medida', 'Sí']);
    if (p.plazo) filas.push(['Plazo', p.plazo]);
    if (!filas.length) return null;
    var dl = el('dl', 'detalle__lista');
    filas.forEach(function (f) {
      dl.appendChild(el('dt', null, f[0]));
      dl.appendChild(el('dd', null, f[1]));
    });
    return dl;
  }

  function crearAcciones(p) {
    var caja = el('div', 'detalle__acciones');
    var reservado = p.estado === 'reservado';
    caja.appendChild(reservado
      ? enlaceWa('boton detalle__reservar', 'Avisadme si queda libre', P.mensajeAviso(p), 'Avisadme si queda libre: ' + p.nombre + ' (WhatsApp)')
      : enlaceWa('boton detalle__reservar', 'Reservar', P.mensajeReserva(p), 'Reservar ' + p.nombre + ' por WhatsApp'));
    caja.appendChild(enlaceWa('boton boton--linea', 'Preguntar', P.mensajePregunta(p), 'Preguntar por ' + p.nombre + ' por WhatsApp'));

    // Compartir: secundario, solo un icono (con su nombre para lectores de pantalla y al pasar el ratón)
    var compartir = el('button', 'detalle__compartir');
    compartir.type = 'button';
    compartir.title = 'Compartir';
    compartir.setAttribute('aria-label', 'Compartir ' + p.nombre);
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    ['M12 3v12', 'M7 8l5-5 5 5', 'M5 13v7h14v-7'].forEach(function (d) {
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      t.setAttribute('d', d);
      s.appendChild(t);
    });
    compartir.appendChild(s);
    compartir.addEventListener('click', function () { compartirFicha(p); });
    caja.appendChild(compartir);

    var aviso = el('p', 'detalle__aviso');
    aviso.id = 'detalle-aviso';
    aviso.setAttribute('role', 'status');
    caja.appendChild(aviso);
    return caja;
  }

  function crearDatos(p) {
    var d = el('div', 'detalle__datos');
    d.appendChild(el('p', 'producto__cat', C.CATEGORIAS[p.categoria]));
    var h = el('h2', 'detalle__nombre', p.nombre);
    h.id = 'detalle-nombre';
    h.tabIndex = -1;
    h.title = p.nombre; // se corta a 3 líneas: el nombre entero, al pasar el ratón
    d.appendChild(h);
    var precio = P.crearPrecio(p);
    precio.classList.add('detalle__precio');
    d.appendChild(precio);
    [crearTexto(p), crearDetalles(p)].forEach(function (n) { if (n) d.appendChild(n); });
    return d;
  }

  // Hasta 3 de la misma categoría; si no hay bastantes, se completa con otros
  function crearRelacionados(p) {
    var otros = P.visibles(contenido).filter(function (x) { return x.id !== p.id; });
    var lista = otros.filter(function (x) { return x.categoria === p.categoria; })
      .concat(otros.filter(function (x) { return x.categoria !== p.categoria; }))
      .slice(0, 3);
    if (!lista.length) return null;
    var mismos = lista.every(function (x) { return x.categoria === p.categoria; });
    var seccion = el('section', 'detalle__mas');
    seccion.setAttribute('aria-labelledby', 'detalle-mas');
    // «Otros» es un cajón de sastre: «Más otros» no se entiende, mejor «Más productos»
    var titulo = p.categoria === 'otros' ? 'Más productos' : 'Más ' + C.CATEGORIAS[p.categoria].toLowerCase();
    var h = el('h3', 'detalle__mas-titulo', mismos ? titulo : 'Más');
    h.id = 'detalle-mas';
    seccion.appendChild(h);
    var ul = el('ul', 'mini');
    lista.forEach(function (x) {
      var li = el('li');
      var a = el('a', 'mini__enlace');
      a.href = PREFIJO + x.id;
      var foto = el('span', 'mini__foto');
      var f = C.fotoPrincipal(x);
      if (f) {
        var img = el('img');
        img.src = P.srcFoto(f);
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        P.siFalla(img, function (i) { if (i.parentNode) i.parentNode.replaceChild(P.icono(x.categoria), i); });
        foto.appendChild(img);
      } else {
        foto.appendChild(P.icono(x.categoria));
      }
      a.appendChild(foto);
      a.appendChild(el('span', 'mini__nombre', x.nombre));
      a.appendChild(el('span', 'mini__precio' + (x.precio === null ? ' mini__precio--consultar' : ''),
        x.precio === null ? 'Consultar' : C.formatearPrecio(x.precio)));
      li.appendChild(a);
      ul.appendChild(li);
    });
    seccion.appendChild(ul);
    return seccion;
  }

  function pintar(p) {
    cuerpo.textContent = '';
    // Galería a la izquierda; a la derecha los datos, «Más …» y, al final, la barra de acciones,
    // que se queda pegada abajo mientras se baja (en escritorio esa columna hace scroll por dentro)
    var rejilla = el('div', 'detalle__rejilla');
    rejilla.appendChild(crearGaleria(p));
    var lado = el('div', 'detalle__lado');
    lado.appendChild(crearDatos(p));
    var mas = crearRelacionados(p);
    if (mas) lado.appendChild(mas);
    lado.appendChild(crearAcciones(p));
    rejilla.appendChild(lado);
    cuerpo.appendChild(rejilla);
    dialogo.classList.toggle('detalle--reservado', p.estado === 'reservado');
    cuerpo.scrollTop = 0;
    lado.scrollTop = 0;
  }

  // ---------- Compartir: el menú del sistema o, si no hay, copiar el enlace ----------

  function avisoFicha(texto) {
    var a = document.getElementById('detalle-aviso');
    if (!a) return;
    clearTimeout(temporizadorAviso);
    a.textContent = texto;
    temporizadorAviso = setTimeout(function () { a.textContent = ''; }, 4000);
  }

  function copiarAntiguo(texto) {
    return new Promise(function (resolver, rechazar) {
      var activo = document.activeElement;
      var t = document.createElement('textarea');
      t.value = texto;
      t.setAttribute('readonly', '');
      t.className = 'visualmente-oculto';
      dialogo.appendChild(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      t.remove();
      if (activo && activo.focus) activo.focus();
      if (ok) resolver(); else rechazar(new Error('copiar'));
    });
  }

  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(function () { return copiarAntiguo(texto); });
    }
    return copiarAntiguo(texto);
  }

  function compartirFicha(p) {
    var url = urlFicha(p.id);
    var porCopia = function () {
      copiar(url).then(function () { avisoFicha('Enlace copiado'); }, function () { avisoFicha('Copia este enlace: ' + url); });
    };
    if (typeof navigator.share === 'function') {
      navigator.share({ title: p.nombre + ' · Siestta y Descanso', url: url }).catch(function (e) {
        if (!e || e.name !== 'AbortError') porCopia(); // si la persona cancela, no se hace nada
      });
      return;
    }
    porCopia();
  }

  // ---------- Abrir y cerrar (y el historial) ----------

  // historial: 'nueva' (añade #p/{id} al historial), 'cambiar' (lo sustituye) u omitido (ya está en la URL)
  function abrir(id, opciones) {
    opciones = opciones || {};
    var p = buscar(id);
    if (!p) return false;
    actual = p.id;
    pintar(p);
    if (!dialogo.open) {
      origen = opciones.origen || null;
      document.documentElement.classList.add('con-ficha');
      dialogo.showModal();
    }
    try {
      if (opciones.historial === 'nueva' && location.hash !== PREFIJO + p.id) {
        history.pushState({ ficha: p.id }, '', PREFIJO + p.id);
        empujada = true;
      } else if (opciones.historial === 'cambiar') {
        history.replaceState(history.state, '', PREFIJO + p.id);
      }
    } catch (e) { /* sin historial (p. ej. abierto como archivo): la ficha funciona igual */ }
    document.getElementById('detalle-nombre').focus();
    return true;
  }

  function cerrar() { if (dialogo.open) dialogo.close(); }

  // El foco vuelve a lo que abrió la ficha; si se abrió por un enlace directo, a la tarjeta de ese
  // producto si está a la vista o, si no, al título de la sección de productos (nunca al body)
  function devolverFoco(idCerrado) {
    var o = origen || { id: idCerrado, nodo: null };
    origen = null;
    var nodo = o.nodo && o.nodo.isConnected ? o.nodo
      : o.id ? document.querySelector('#productos .producto[data-id="' + CSS.escape(o.id) + '"] .producto__enlace') : null;
    if (nodo) { nodo.focus(); return; }
    var titulo = document.getElementById('t-tenemos');
    if (titulo) {
      titulo.tabIndex = -1;
      titulo.focus({ preventScroll: true });
    }
  }

  // ¿La entrada actual del historial la añadió la propia ficha? Entonces cerrar = volver atrás
  function entradaNuestra() { return !!(history.state && history.state.ficha); }

  // Con la X, Esc o tocando fuera, el hash sigue siendo de ficha: se vuelve atrás o se limpia.
  // Si se cerró porque el hash cambió (atrás del navegador), no se toca el historial.
  function alCerrar() {
    document.documentElement.classList.remove('con-ficha');
    var cerrado = actual;
    actual = null;
    if (idDelHash() !== null) {
      try {
        if (empujada) history.back();
        else history.replaceState(null, '', urlSinHash());
      } catch (e) { /* nada */ }
    }
    empujada = false;
    devolverFoco(cerrado);
  }

  // Mantiene la ficha de acuerdo con la URL (atrás, adelante, un enlace #p/… escrito a mano).
  // Con un enlace escrito a mano, cerrar solo limpia el hash: volver atrás reabriría la ficha de antes.
  function sincronizar() {
    var id = idDelHash();
    if (id === null) { cerrar(); return; }
    if (dialogo.open && id === actual) return;
    if (abrir(id)) { empujada = entradaNuestra(); return; }
    try { history.replaceState(null, '', urlSinHash()); } catch (e) { /* nada */ }
    cerrar();
  }

  function alPulsar(e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    // En «Ahora en tienda» (y en la sección de la temporada) toda la tarjeta abre la ficha, menos «Reservar» y «Preguntar»
    var n = e.target.closest('a[href^="#p/"], [data-abrir-ficha]');
    if (!n) {
      var t = e.target.closest('.carrusel__pista .producto');
      if (!t || e.target.closest('.producto__acciones, a, button')) return;
      n = t.querySelector('.producto__enlace');
      if (!n) return;
    }
    var id = n.dataset.abrirFicha;
    if (!id) {
      try { id = decodeURIComponent(n.getAttribute('href').slice(PREFIJO.length)).toUpperCase(); } catch (err) { return; }
    }
    e.preventDefault();
    if (!buscar(id)) return;
    var tarjeta = n.closest('.producto');
    abrir(id, {
      // Desde una tarjeta, el foco vuelve a su nombre; desde la portada, a la tarjeta de la portada
      origen: tarjeta ? { id: tarjeta.dataset.id, nodo: tarjeta.querySelector('.producto__enlace') }
        : dialogo.contains(n) ? null : { id: '', nodo: n },
      historial: dialogo.open ? 'cambiar' : 'nueva'
    });
  }

  function iniciar() {
    dialogo = document.getElementById('detalle');
    cuerpo = document.getElementById('detalle-cuerpo');
    if (!dialogo || !cuerpo || typeof dialogo.showModal !== 'function') return;
    contenido = window.cargarContenido();

    document.addEventListener('click', alPulsar);
    document.getElementById('detalle-cerrar').addEventListener('click', cerrar);
    dialogo.addEventListener('click', function (e) { if (e.target === dialogo) cerrar(); }); // el fondo
    dialogo.addEventListener('close', alCerrar);
    window.addEventListener('popstate', sincronizar);
    window.addEventListener('hashchange', sincronizar);

    // Llega lo del servidor, o el panel cambia algo en otra pestaña: se repinta la ficha abierta, o se
    // cierra si ya no está a la venta. Si se entró con un enlace #p/… de un producto que aún no estaba
    // (la caché era vieja), se abre ahora
    C.alCambiar(function () {
      contenido = window.cargarContenido();
      if (!dialogo.open) {
        if (pendiente && idDelHash() === pendiente && buscar(pendiente)) {
          var idp = pendiente;
          pendiente = null;
          abrir(idp);
          empujada = entradaNuestra();
        }
        return;
      }
      var p = buscar(actual);
      if (!p) { cerrar(); return; }
      var conFoco = dialogo.contains(document.activeElement);
      pintar(p);
      if (conFoco) document.getElementById('detalle-nombre').focus();
    });

    // Enlace directo o recarga: se abre sin añadir nada al historial (recargar no apila entradas).
    // Si la entrada la había añadido la ficha (se ha recargado), cerrar sigue siendo volver atrás;
    // si no, cerrar solo limpia el hash. Si el producto no se ve en la web, se limpia el hash.
    var id = idDelHash();
    if (id === null) return;
    var p = buscar(id);
    // Aún no está en lo que hay (caché o ejemplo): se espera a lo del servidor antes de dar el enlace por malo
    var D = window.Datos;
    if (!p && id && D && D.primeraCarga) {
      pendiente = id;
      D.primeraCarga.then(function () {
        if (pendiente !== id) return;
        pendiente = null;
        if (idDelHash() === id && !buscar(id)) {
          try { history.replaceState(null, '', urlSinHash()); } catch (e) { /* nada */ }
        }
      });
      return;
    }
    try {
      if (!p) history.replaceState(null, '', urlSinHash());
      else history.replaceState(history.state, '', PREFIJO + p.id); // #p/col-01 → #p/COL-01
    } catch (e) { /* nada */ }
    if (!p) return;
    abrir(p.id);
    empujada = entradaNuestra();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
