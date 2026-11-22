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
    tienda.horario.forEach(function (tramo, i) {
      if (i > 0) caja.appendChild(document.createElement('br'));
      var dias = document.createElement('strong');
      dias.textContent = tramo.dias;
      caja.appendChild(dias);
      caja.appendChild(document.createTextNode(' ' + (tramo.horas || 'Cerrado')));
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

  // «Abierto ahora · hasta las 13:30», «Ahora cerrado · abrimos hoy a las 17:00»,
  // «Cerrado · abrimos mañana a las 10:00», «Cerrado · abrimos el lunes a las 10:00»
  function textoEstado(semana, ahora) {
    var hoy = semana[ahora.dia] || [];
    for (var i = 0; i < hoy.length; i++) {
      if (ahora.minutos >= hoy[i][0] && ahora.minutos < hoy[i][1]) {
        return { texto: 'Abierto ahora · hasta las ' + hora(hoy[i][1]), abierto: true };
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
      q.textContent = '«' + o.texto + '»';
      li.appendChild(q);
      if (o.autor) {
        var autor = document.createElement('p');
        autor.className = 'cita__autor';
        autor.textContent = o.autor;
        li.appendChild(autor);
      }
      ul.appendChild(li);
    });
    ul.hidden = op.lista.length === 0;
    seccion.hidden = !hayNota && op.lista.length === 0 && !seccion.querySelector('#marcas:not([hidden])');
  }

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

  function pintarMarcas(marcas) {
    var p = document.getElementById('marcas');
    if (!p) return;
    p.textContent = '';
    p.hidden = marcas.length === 0;
    if (!marcas.length) return;
    var t = document.createElement('strong');
    t.textContent = 'Marcas con las que trabajamos: ';
    p.appendChild(t);
    p.appendChild(document.createTextNode(marcas.join(' · ')));
  }

  function pintarTodo() {
    var contenido = window.cargarContenido();
    pintarAviso(contenido.tienda);
    pintarPortada(contenido.portada);
    pintarContacto(contenido.tienda);
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

  pintarTodo();
  animarAlBajar();
  // Cada minuto se revisa el «abierto / cerrado»; y si el panel guarda en otra pestaña, se repinta
  setInterval(function () { pintarEstado(window.cargarContenido().tienda); }, 60000);
  window.addEventListener('storage', function (e) {
    if (e.key === C.CLAVE || e.key === null) pintarTodo();
  });

  // Para las pruebas: calcula el estado a una hora concreta sin tocar el reloj
  window.Horario = { textoEstado: textoEstado };
})();
