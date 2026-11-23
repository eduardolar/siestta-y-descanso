// Pinta en la web lo que viene de js/contenido.js (aviso, portada, contacto y horario)
// y dice si la tienda está abierta ahora, con la hora de Tomelloso.
// El HTML ya lleva escritos los valores por defecto: sin JavaScript la página se ve bien.
(function () {
  'use strict';

  var C = window.Contenido;
  if (!C || !window.cargarContenido) return;

  var DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var DIA_INGLES = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  function pintarAviso(tienda) {
    var aviso = document.getElementById('aviso');
    if (!aviso) return;
    var activo = tienda.aviso.activo && tienda.aviso.texto;
    aviso.hidden = !activo;
    if (activo) aviso.querySelector('.aviso__texto').textContent = tienda.aviso.texto;
  }

  function pintarPortada(portada) {
    var h1 = document.querySelector('.portada h1');
    var entradilla = document.querySelector('.portada .entradilla');
    if (h1) {
      var lineas = portada.titular.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      h1.textContent = '';
      // La última línea va «escrita a mano», en rojo, como «Luego decides.»
      lineas.forEach(function (l, i) {
        if (i > 0) h1.appendChild(document.createElement('br'));
        if (i === lineas.length - 1 && lineas.length > 1) {
          var em = document.createElement('em');
          em.textContent = l;
          h1.appendChild(em);
        } else {
          h1.appendChild(document.createTextNode(l));
        }
      });
    }
    if (entradilla) entradilla.textContent = portada.entradilla;
  }

  function pintarContacto(tienda) {
    var tel = C.enlaceTelefono(tienda.telefono);
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="https://wa.me/"]'), function (a) {
      a.href = a.href.replace(/^https:\/\/wa\.me\/\d+/, 'https://wa.me/' + tienda.whatsapp);
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="tel:"]'), function (a) {
      a.href = tel;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-contenido="telefono"]'), function (n) {
      n.textContent = tienda.telefono;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-contenido="whatsapp"]'), function (n) {
      n.textContent = C.whatsappLegible(tienda.whatsapp);
    });
    // El teléfono de los datos para Google (application/ld+json) también sale del contenido
    var ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        var datos = JSON.parse(ld.textContent);
        var digitos = C.soloDigitos(tienda.telefono);
        datos.telephone = digitos.length === 9 ? '+34 ' + tienda.telefono : '+' + digitos;
        ld.textContent = JSON.stringify(datos, null, 2);
      } catch (e) { /* se queda el del HTML */ }
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-contenido="direccion"]'), function (n) {
      n.textContent = '';
      tienda.direccion.split('\n').forEach(function (linea, i) {
        if (i > 0) n.appendChild(document.createElement('br'));
        n.appendChild(document.createTextNode(linea));
      });
    });
  }

  function pintarHorario(tienda) {
    var caja = document.querySelector('.abierto__horario');
    if (!caja) return;
    caja.textContent = '';
    tienda.horario.forEach(function (tramo) {
      var fila = document.createElement('span');
      fila.className = 'horario__tramo';
      var dias = document.createElement('strong');
      dias.textContent = tramo.dias;
      fila.appendChild(dias);
      var horas = document.createElement('span');
      horas.textContent = tramo.horas || 'Cerrado';
      fila.appendChild(horas);
      caja.appendChild(fila);
    });
  }

  // Hora y día de la semana en Tomelloso (Europe/Madrid), aunque el móvil esté en otra zona
  function ahoraEnMadrid() {
    var partes = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date()).forEach(function (p) { partes[p.type] = p.value; });
    return {
      dia: DIA_INGLES[partes.weekday],
      minutos: (parseInt(partes.hour, 10) % 24) * 60 + parseInt(partes.minute, 10)
    };
  }

  function hora(m) { return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
  // «hasta las 13:30», o «hasta medianoche» si cierra a las 24:00
  function hasta(m) { return m >= 24 * 60 ? 'hasta medianoche' : 'hasta las ' + hora(m); }

  // «Abierto ahora · hasta las 13:30», «Ahora cerrado · abrimos hoy a las 17:00»,
  // «Cerrado · abrimos mañana a las 10:00», «Cerrado · abrimos el lunes a las 10:00»
  function textoEstado(semana, ahora) {
    var hoy = semana[ahora.dia] || [];
    for (var i = 0; i < hoy.length; i++) {
      if (ahora.minutos >= hoy[i][0] && ahora.minutos < hoy[i][1]) {
        return { texto: 'Abierto ahora · ' + hasta(hoy[i][1]), abierto: true };
      }
      if (ahora.minutos < hoy[i][0]) {
        return { texto: 'Ahora cerrado · abrimos hoy a las ' + hora(hoy[i][0]), abierto: false };
      }
    }
    for (var n = 1; n <= 7; n++) {
      var d = (ahora.dia + n) % 7;
      if (semana[d].length) {
        var cuando = n === 1 ? 'mañana' : 'el ' + DIAS_SEMANA[d];
        return { texto: 'Cerrado · abrimos ' + cuando + ' a las ' + hora(semana[d][0][0]), abierto: false };
      }
    }
    return null; // sin horario conocido
  }

  // El estado sale en la barra de arriba y en «¿Está abierto ahora?»
  function pintarEstado(tienda) {
    var cajas = document.querySelectorAll('[data-estado]');
    if (!cajas.length || !window.Intl) return;
    var r;
    try { r = textoEstado(C.horarioPorDia(tienda.horario), ahoraEnMadrid()); } catch (e) { r = null; }
    Array.prototype.forEach.call(cajas, function (estado) {
      if (!r) { estado.hidden = true; return; }
      estado.textContent = r.texto;
      if (r.abierto) estado.dataset.abierto = 'si';
      else delete estado.dataset.abierto;
      estado.hidden = false;
    });
  }

  function pintarDesde(desde) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-contenido^="desde"]'), function (n) {
      n.hidden = !desde;
      n.textContent = desde ? ' · Desde ' + desde : '';
    });
  }

  function formatoNota(n) { return String(n).replace('.', ','); }

  // Opiniones de Google: nota, estrellas, total, enlace y citas. Lo que falta no se enseña.
  function pintarOpiniones(op) {
    var seccion = document.getElementById('opiniones');
    if (!seccion) return;
    var hayNota = op.nota !== null;
    var nota = document.getElementById('opiniones-nota');
    nota.hidden = !hayNota;
    if (hayNota) {
      document.getElementById('opiniones-cifra').textContent = formatoNota(op.nota);
      var estrellas = document.getElementById('opiniones-estrellas');
      estrellas.setAttribute('aria-label', formatoNota(op.nota) + ' de 5 estrellas');
      estrellas.querySelector('.estrellas__fila--llena').style.width = (op.nota / 5 * 100) + '%';
      var total = document.getElementById('opiniones-total');
      total.hidden = op.total === null;
      total.textContent = op.total === 1 ? '1 opinión' : op.total + ' opiniones';
      document.getElementById('opiniones-enlace').href = op.enlace;
    }
    var ul = document.getElementById('citas');
    ul.textContent = '';
    op.lista.forEach(function (o) {
      var li = document.createElement('li');
      li.className = 'cita';
      var q = document.createElement('blockquote');
      q.textContent = o.texto; // la comilla la pone el CSS (una sola)
      li.appendChild(q);
      // Autor: burbuja con la inicial, el nombre y «Opinión en Google»
      var autor = document.createElement('div');
      autor.className = 'cita__firma';
      var m = /[\p{L}\p{N}]/u.exec(o.autor || '');
      var inicial = document.createElement('span');
      inicial.className = 'cita__inicial';
      inicial.setAttribute('aria-hidden', 'true');
      inicial.textContent = m ? m[0].toLocaleUpperCase('es') : 'G';
      autor.appendChild(inicial);
      var datos = document.createElement('span');
      datos.className = 'cita__datos';
      if (o.autor) {
        var nombre = document.createElement('span');
        nombre.className = 'cita__nombre';
        nombre.textContent = o.autor;
        datos.appendChild(nombre);
      }
      var fuente = document.createElement('span');
      fuente.className = 'cita__fuente';
      fuente.textContent = 'Opinión en Google';
      datos.appendChild(fuente);
      autor.appendChild(datos);
      li.appendChild(autor);
      ul.appendChild(li);
    });
    ul.hidden = op.lista.length === 0;
    carruselCitas.montar();
    seccion.hidden = !hayNota && op.lista.length === 0 && !seccion.querySelector('#marcas:not([hidden])');
  }

  // Carrusel de opiniones: 1 a la vez en el móvil y 2 desde 640 px; pasa sola cada 10 s (salvo con «reducir
  // movimiento»), se espera con el ratón encima, con el foco dentro o con la pestaña oculta, y SE PARA DEL
  // TODO (sin volver a girar) en cuanto la persona toca, desliza, usa la rueda o las flechas y puntos.
  // Si caben todas, no hay carrusel.
  var carruselCitas = (function () {
    var caja, ul, controles, puntos, ant, sig;
    // actual: la primera opinión a la vista; posiciones: cuántos «saltos» hay (n − las que caben + 1)
    var actual = 0, n = 0, visibles = 1, posiciones = 1;
    var temporizador = null, encima = false, conFoco = false, mirando = null, parado = false;
    var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var listo = false;

    function diapositivas() { return Array.prototype.slice.call(ul.children); }
    function ir(i, aMano) {
      if (posiciones < 2) return;
      actual = (i + posiciones) % posiciones;
      // Al moverse a mano se anuncia; girando sola, no
      ul.setAttribute('aria-live', aMano ? 'polite' : 'off');
      ul.scrollTo({ left: diapositivas()[actual].offsetLeft, behavior: reducir ? 'auto' : 'smooth' });
      marcar();
    }
    function marcar() {
      Array.prototype.forEach.call(puntos.children, function (b, i) {
        if (i === actual) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      diapositivas().forEach(function (li, i) {
        li.setAttribute('aria-hidden', i >= actual && i < actual + visibles ? 'false' : 'true');
      });
    }
    function gira() { return posiciones > 1 && !reducir && !parado && !encima && !conFoco && !document.hidden; }
    // La persona ha tomado el mando: ya no gira sola
    function parar() { if (!parado) { parado = true; programar(); } }
    function programar() {
      clearInterval(temporizador);
      temporizador = null;
      if (gira()) temporizador = setInterval(function () { ir(actual + 1, false); }, 10000);
    }
    // Cuántas caben a la vez (lo decide el CSS: 1 en el móvil, 2 desde 640 px) y, con eso, puntos y flechas
    function medir() {
      var li = ul.children[0];
      visibles = li ? Math.max(1, Math.round((ul.clientWidth + 16) / (li.offsetWidth + 16))) : 1;
      posiciones = Math.max(1, n - visibles + 1);
      var es = posiciones > 1;
      controles.hidden = !es;
      ant.hidden = !es;
      sig.hidden = !es;
      puntos.textContent = '';
      for (var i = 0; es && i < posiciones; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'citas-carrusel__punto';
        b.dataset.i = i;
        b.setAttribute('aria-label', visibles > 1 ? 'Ver desde la opinión ' + (i + 1) : 'Ver la opinión ' + (i + 1));
        puntos.appendChild(b);
      }
      if (actual >= posiciones) actual = 0;
      ul.scrollLeft = ul.children[actual] ? ul.children[actual].offsetLeft : 0;
      if (es) { marcar(); ul.setAttribute('aria-live', 'off'); }
      else { ul.removeAttribute('aria-live'); diapositivas().forEach(function (x) { x.removeAttribute('aria-hidden'); }); }
      programar();
    }
    function iniciar() {
      caja = document.getElementById('citas-carrusel');
      ul = document.getElementById('citas');
      if (!caja || !ul) return false;
      controles = document.getElementById('citas-controles');
      puntos = document.getElementById('citas-puntos');
      ant = document.getElementById('citas-ant');
      sig = document.getElementById('citas-sig');
      ant.addEventListener('click', function () { parar(); ir(actual - 1, true); });
      sig.addEventListener('click', function () { parar(); ir(actual + 1, true); });
      puntos.addEventListener('click', function (e) {
        var b = e.target.closest('[data-i]');
        if (b) { parar(); ir(parseInt(b.dataset.i, 10), true); }
      });
      // Tocar o deslizar (dedo, ratón, rueda o teclado dentro del carrusel) lo para para siempre
      ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (tipo) {
        caja.addEventListener(tipo, parar, { passive: true });
      });
      caja.addEventListener('mouseenter', function () { encima = true; programar(); });
      caja.addEventListener('mouseleave', function () { encima = false; programar(); });
      caja.addEventListener('focusin', function () { conFoco = true; programar(); });
      caja.addEventListener('focusout', function (e) { if (!caja.contains(e.relatedTarget)) { conFoco = false; programar(); } });
      document.addEventListener('visibilitychange', programar);
      var medida = null;
      window.addEventListener('resize', function () { clearTimeout(medida); medida = setTimeout(function () { if (n) medir(); }, 150); });
      // Al deslizar con el dedo: la que queda a la izquierda pasa a ser la actual (y se reinicia la cuenta)
      ul.addEventListener('scroll', function () {
        clearTimeout(mirando);
        mirando = setTimeout(function () {
          var lis = diapositivas();
          var i = 0;
          lis.forEach(function (li, k) {
            if (Math.abs(li.offsetLeft - ul.scrollLeft) < Math.abs(lis[i].offsetLeft - ul.scrollLeft)) i = k;
          });
          i = Math.min(i, posiciones - 1);
          if (i !== actual) { actual = i; marcar(); programar(); }
        }, 120);
      }, { passive: true });
      return true;
    }
    function montar() {
      if (!listo) listo = iniciar();
      if (!listo) return;
      n = ul.children.length;
      caja.classList.toggle('es-carrusel', n > 1);
      diapositivas().forEach(function (li, i) {
        if (n > 1) {
          li.setAttribute('role', 'group');
          li.setAttribute('aria-roledescription', 'diapositiva');
          li.setAttribute('aria-label', 'Opinión ' + (i + 1) + ' de ' + n);
        }
      });
      actual = 0;
      medir();
    }
    return { montar: montar };
  })();

  function pintarFinanciacion(fin) {
    var chip = document.getElementById('ventaja-financiacion');
    var banda = document.getElementById('banda-financiacion');
    if (chip) {
      chip.hidden = !fin.activa;
      chip.querySelector('.ventajas__texto').textContent = fin.texto ? 'Financiación: ' + fin.texto : 'Financiación disponible';
      if (fin.texto) chip.title = fin.texto; else chip.removeAttribute('title');
    }
    if (banda) {
      banda.hidden = !(fin.activa && fin.texto);
      banda.textContent = fin.activa && fin.texto ? 'Financiación: ' + fin.texto + '.' : '';
    }
  }

  // La entrega no llega a todas partes: se dice la zona, o «consulta zona» si el panel la deja vacía
  function pintarEntrega(tienda) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-contenido="zona"]'), function (n) {
      n.textContent = tienda.zonaEntrega || 'Consulta tu zona';
    });
    var chip = document.getElementById('ventaja-entrega');
    if (chip) {
      chip.querySelector('.ventajas__texto').textContent = tienda.zonaEntrega
        ? 'Entrega en ' + tienda.zonaEntrega : 'Entrega a domicilio · consulta zona';
    }
  }

  function pintarMarcas(marcas) {
    var p = document.getElementById('marcas');
    if (!p) return;
    p.textContent = '';
    p.hidden = marcas.length === 0;
    if (!marcas.length) return;
    var t = document.createElement('strong');
    t.textContent = 'Marcas: ';
    p.appendChild(t);
    p.appendChild(document.createTextNode(marcas.join(' · ')));
  }

  function pintarTodo() {
    var contenido = window.cargarContenido();
    pintarAviso(contenido.tienda);
    pintarPortada(contenido.portada);
    pintarContacto(contenido.tienda);
    pintarEntrega(contenido.tienda);
    pintarHorario(contenido.tienda);
    pintarEstado(contenido.tienda);
    pintarDesde(contenido.desde);
    pintarMarcas(contenido.marcas);
    pintarOpiniones(contenido.opiniones);
    pintarFinanciacion(contenido.financiacion);
  }

  // Aparición suave al bajar: solo con IntersectionObserver y sin «reducir movimiento».
  // Sin JavaScript (o si no se cumple) todo está visible desde el principio.
  function animarAlBajar() {
    if (!('IntersectionObserver' in window) || !window.matchMedia ||
        !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    var elementos = Array.prototype.filter.call(document.querySelectorAll('.revela'), function (n) {
      return n.getBoundingClientRect().top > window.innerHeight; // lo que ya se ve, no se anima
    });
    if (!elementos.length) return;
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    elementos.forEach(function (n) { io.observe(n); });
    document.documentElement.classList.add('anima');
    Array.prototype.forEach.call(document.querySelectorAll('.revela'), function (n) {
      if (elementos.indexOf(n) === -1) n.classList.add('visto');
    });
  }

  // Acceso escondido al panel: 5 toques (o clics) seguidos en el logo de la cabecera, en menos de 3 s
  // entre el primero y el quinto, llevan a admin.html. Los toques 1 a 4 hacen lo de siempre (subir
  // arriba). Es el evento «click», así que Enter sobre el logo cuenta igual que un toque.
  function accesoEscondido() {
    var logo = document.querySelector('.cabecera .marca');
    if (!logo) return;
    var toques = [];
    logo.addEventListener('click', function (e) {
      var t = Date.now();
      toques = toques.filter(function (x) { return t - x < 3000; });
      toques.push(t);
      if (toques.length >= 5) {
        e.preventDefault();
        toques = [];
        window.location.href = 'admin.html';
      }
    });
  }

  pintarTodo();
  animarAlBajar();
  accesoEscondido();
  // Cada minuto se revisa el «abierto / cerrado»; y cuando llega lo del servidor (o el panel guarda en
  // otra pestaña), se repinta
  setInterval(function () { pintarEstado(window.cargarContenido().tienda); }, 60000);
  C.alCambiar(pintarTodo);

  // Para las pruebas: calcula el estado a una hora concreta sin tocar el reloj
  window.Horario = { textoEstado: textoEstado };
})();
