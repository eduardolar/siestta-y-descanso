// Partículas de temporada en la portada: un <canvas> detrás del texto (no resta contraste). Cada tema pone sus
// formas; el motor (tamaño, ritmo, pausas) es el mismo:
// - Navidad: nevada en tres capas (al fondo, copos pequeños, lentos y algo difuminados; en medio, medianos;
//   delante, pocos cristales de 6 puntas que giran despacio y a veces destellan) y, arriba, estrellitas que titilan.
// - Rebajas: lluvia suave de «%» y etiquetas pequeñas (blanco, amarillo y rojo oscuro) con vaivén y giro.
// Caen con vaivén lateral (seno) y velocidades distintas. Solo con «skin tema--navidad» o «skin tema--rebajas» en
// <html>; quieto con la portada fuera de la vista o la pestaña oculta («deco-quieta», que pone js/escaparate.js) y
// nada con «reducir movimiento». En pantallas de 680 px o menos y en equipos modestos, menos partículas y ~30 fps.
(function () {
  'use strict';
  var lienzo = document.getElementById('particulas');
  if (!lienzo || !lienzo.getContext || !window.requestAnimationFrame) return;
  var ctx = lienzo.getContext('2d');
  var html = document.documentElement;
  var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var piezas = [], estrellas = [], ancho = 0, alto = 0, dpr = 1, ultimo = 0, pedido = 0, pintado = 0, tema = '';
  // Equipos modestos (pocos núcleos o poca memoria): menos partículas y sin la capa difuminada del fondo
  var modesto = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  var pequeno = false; // pantalla de 680 px o menos: ~30 fotogramas por segundo

  function azar(a, b) { return a + Math.random() * (b - a); }
  function temaActivo() {
    if (!html.classList.contains('skin')) return '';
    if (html.classList.contains('tema--navidad')) return 'navidad';
    if (html.classList.contains('tema--rebajas')) return 'rebajas';
    return '';
  }
  function activa() {
    return !!TEMAS[temaActivo()] && !(reducir && reducir.matches) && !html.classList.contains('deco-quieta') && !document.hidden;
  }

  // ---------- Navidad: copos y cristales ----------
  function nuevoCopo(capa, arriba) {
    // capa 0: fondo · 1: medio · 2: delante (cristales)
    var t = [[1.4, 2.6], [2.6, 4], [8, 13]][capa];
    return {
      capa: capa, r: azar(t[0], t[1]), x: azar(0, ancho), y: arriba ? azar(-40, -10) : azar(0, alto),
      vy: [azar(10, 18), azar(20, 32), azar(30, 42)][capa], amp: azar(6, 22), fase: azar(0, 6.3), frec: azar(.4, 1.1),
      giro: azar(0, 6.3), vgiro: azar(-.6, .6), alfa: [azar(.45, .65), azar(.7, .9), azar(.8, 1)][capa], destello: 0
    };
  }
  function cristal(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.giro);
    ctx.strokeStyle = 'rgba(255,255,255,' + c.alfa + ')';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var k = 0; k < 6; k++) {
      ctx.moveTo(0, 0); ctx.lineTo(0, -c.r);
      // ramitas
      ctx.moveTo(0, -c.r * .55); ctx.lineTo(c.r * .28, -c.r * .78);
      ctx.moveTo(0, -c.r * .55); ctx.lineTo(-c.r * .28, -c.r * .78);
      ctx.rotate(Math.PI / 3);
    }
    ctx.stroke();
    if (c.destello > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (c.destello * .9) + ')';
      ctx.beginPath(); ctx.arc(0, 0, c.r * .35, 0, 6.3); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Rebajas: «%» y etiquetas ----------
  var COLORES_REBAJAS = ['255,255,255', '255,212,0', '125,18,32'];
  function nuevaRebaja(capa, arriba) {
    // capa 0: «%» pequeño · 1: «%» mediano · 2: etiqueta
    return {
      capa: capa, r: [azar(9, 13), azar(14, 20), azar(10, 15)][capa], x: azar(0, ancho), y: arriba ? azar(-50, -20) : azar(0, alto),
      vy: [azar(16, 26), azar(26, 38), azar(22, 34)][capa], amp: azar(8, 26), fase: azar(0, 6.3), frec: azar(.4, 1),
      giro: azar(-.6, .6), vgiro: azar(-.9, .9), alfa: [azar(.35, .5), azar(.5, .7), azar(.6, .8)][capa],
      color: COLORES_REBAJAS[Math.floor(Math.random() * COLORES_REBAJAS.length)]
    };
  }
  function porcentaje(p, x) {
    ctx.save();
    ctx.translate(x, p.y);
    ctx.rotate(p.giro);
    ctx.fillStyle = 'rgba(' + p.color + ',' + p.alfa + ')';
    ctx.font = '900 ' + Math.round(p.r * 2) + 'px "Inter Display", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('%', 0, 0);
    ctx.restore();
  }
  function etiqueta(p, x) {
    var w = p.r * 1.5, h = p.r * 2.2;
    ctx.save();
    ctx.translate(x, p.y);
    ctx.rotate(p.giro);
    ctx.fillStyle = 'rgba(' + p.color + ',' + p.alfa + ')';
    ctx.beginPath();
    ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, -h / 2 + w * .45); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(-w / 2, -h / 2 + w * .45);
    ctx.closePath();
    ctx.fill();
    // agujero de la etiqueta
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(0, -h / 2 + w * .5, w * .14, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  // Cada tema: cuántas en escritorio y en el móvil, cómo se reparten por capas, cómo nacen y cómo se pintan
  var TEMAS = {
    navidad: {
      escritorio: 85, movil: 20, modesto: 12, reparto: [.5, .38], margen: 1,
      nueva: nuevoCopo,
      pintar: function (c, x, dt) {
        if (c.capa === 2) {
          if (c.destello > 0) c.destello = Math.max(0, c.destello - dt * 1.5);
          else if (Math.random() < dt * .08) c.destello = 1;
          cristal({ x: x, y: c.y, r: c.r, giro: c.giro, alfa: c.alfa, destello: c.destello });
          return;
        }
        ctx.fillStyle = 'rgba(255,255,255,' + c.alfa + ')';
        if (c.capa === 0 && !modesto) {
          // Fondo: un poco difuminado (dos círculos, uno más grande y tenue)
          ctx.globalAlpha = .45; ctx.beginPath(); ctx.arc(x, c.y, c.r * 1.9, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(x, c.y, c.r, 0, 6.3); ctx.fill();
      },
      estrellas: true
    },
    rebajas: {
      escritorio: 40, movil: 8, modesto: 6, reparto: [.45, .3], margen: 2,
      nueva: nuevaRebaja,
      pintar: function (p, x) { if (p.capa === 2) etiqueta(p, x); else porcentaje(p, x); },
      estrellas: false
    }
  };

  function preparar() {
    tema = temaActivo();
    var T = TEMAS[tema];
    var caja = lienzo.getBoundingClientRect();
    ancho = Math.max(1, caja.width); alto = Math.max(1, caja.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    lienzo.width = Math.round(ancho * dpr); lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    piezas = []; estrellas = [];
    if (!T) return;
    // Densidad: menos en pantallas pequeñas y aún menos en equipos modestos
    pequeno = ancho <= 680;
    var n = pequeno ? T.movil : T.escritorio;
    if (modesto) n = Math.min(n, T.modesto);
    var reparto = [Math.round(n * T.reparto[0]), Math.round(n * T.reparto[1])];
    reparto.push(n - reparto[0] - reparto[1]);
    reparto.forEach(function (cuantas, capa) { for (var i = 0; i < cuantas; i++) piezas.push(T.nueva(capa, false)); });
    if (T.estrellas) {
      for (var j = 0; j < (ancho < 700 ? 8 : 18); j++) estrellas.push({ x: azar(0, ancho), y: azar(4, Math.min(70, alto * .15)), r: azar(.6, 1.4), fase: azar(0, 6.3), v: azar(1, 2.5) });
    }
  }
  function pintar(ahora) {
    pedido = 0;
    if (!activa()) { ultimo = 0; return; }
    if (temaActivo() !== tema) preparar();
    var T = TEMAS[tema];
    // En pantallas pequeñas o equipos modestos, como mucho ~30 fotogramas por segundo
    if ((pequeno || modesto) && pintado && ahora - pintado < 32) { seguir(); return; }
    pintado = ahora;
    var dt = ultimo ? Math.min(.05, (ahora - ultimo) / 1000) : 0;
    ultimo = ahora;
    ctx.clearRect(0, 0, ancho, alto);
    var seg = ahora / 1000;
    estrellas.forEach(function (e) {
      ctx.fillStyle = 'rgba(255,240,190,' + (.35 + .45 * (.5 + .5 * Math.sin(seg * e.v + e.fase))) + ')';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.3); ctx.fill();
    });
    piezas.forEach(function (c, i) {
      c.y += c.vy * dt;
      c.fase += c.frec * dt;
      c.giro += c.vgiro * dt;
      var x = c.x + Math.sin(c.fase) * c.amp;
      if (c.y - c.r * T.margen > alto) { piezas[i] = T.nueva(c.capa, true); return; }
      T.pintar(c, x, dt);
    });
    seguir();
  }
  function seguir() { if (!pedido && activa()) pedido = window.requestAnimationFrame(pintar); }

  // Se enciende, se apaga o cambia de formas sola cuando cambian las clases de <html> (piel, tema, deco-quieta)
  new MutationObserver(function () {
    if (!activa()) { ctx.clearRect(0, 0, ancho, alto); ultimo = 0; return; }
    if (!piezas.length || temaActivo() !== tema) preparar();
    seguir();
  }).observe(html, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', seguir);
  if (reducir && reducir.addEventListener) reducir.addEventListener('change', function () { ctx.clearRect(0, 0, ancho, alto); seguir(); });
  var espera = null;
  window.addEventListener('resize', function () { clearTimeout(espera); espera = setTimeout(function () { if (activa()) preparar(); }, 200); });
  if (activa()) { preparar(); seguir(); }
})();
