// Nevada de Navidad en la portada: un <canvas> detrás del texto (no resta contraste: copos blancos con
// transparencia sobre el verde). Tres capas con profundidad: al fondo, copos pequeños, lentos y algo
// difuminados; en medio, medianos; delante, pocos cristales de 6 puntas que giran despacio y a veces
// destellan. Caen con vaivén lateral (seno) y velocidades distintas. Arriba, estrellitas que titilan.
// Solo con la piel de Navidad («skin tema--navidad» en <html>); quieta con la portada fuera de la vista o la
// pestaña oculta («deco-quieta», que pone js/escaparate.js) y nada con «reducir movimiento».
(function () {
  'use strict';
  var lienzo = document.getElementById('nieve');
  if (!lienzo || !lienzo.getContext || !window.requestAnimationFrame) return;
  var ctx = lienzo.getContext('2d');
  var html = document.documentElement;
  var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var copos = [], estrellas = [], ancho = 0, alto = 0, dpr = 1, ultimo = 0, pedido = 0, pintado = 0;
  // Equipos modestos (pocos núcleos o poca memoria): menos copos y sin la capa difuminada del fondo
  var modesto = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  var pequeno = false; // pantalla de 680 px o menos: ~30 fotogramas por segundo

  function azar(a, b) { return a + Math.random() * (b - a); }
  function activa() {
    return html.classList.contains('skin') && html.classList.contains('tema--navidad') &&
      !(reducir && reducir.matches) && !html.classList.contains('deco-quieta') && !document.hidden;
  }
  function nuevoCopo(capa, arriba) {
    // capa 0: fondo · 1: medio · 2: delante (cristales)
    var t = [[1.4, 2.6], [2.6, 4], [8, 13]][capa];
    return {
      capa: capa, r: azar(t[0], t[1]), x: azar(0, ancho), y: arriba ? azar(-40, -10) : azar(0, alto),
      vy: [azar(10, 18), azar(20, 32), azar(30, 42)][capa], amp: azar(6, 22), fase: azar(0, 6.3), frec: azar(.4, 1.1),
      giro: azar(0, 6.3), vgiro: azar(-.6, .6), alfa: [azar(.45, .65), azar(.7, .9), azar(.8, 1)][capa], destello: 0
    };
  }
  function preparar() {
    var caja = lienzo.getBoundingClientRect();
    ancho = Math.max(1, caja.width); alto = Math.max(1, caja.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    lienzo.width = Math.round(ancho * dpr); lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Densidad: ~85 en escritorio, ~20 en el móvil y ~12 en equipos modestos
    pequeno = ancho <= 680;
    var n = pequeno ? 20 : 85;
    if (modesto) n = Math.min(n, 12);
    var reparto = [Math.round(n * .5), Math.round(n * .38)];
    reparto.push(n - reparto[0] - reparto[1]);
    copos = [];
    reparto.forEach(function (cuantos, capa) { for (var i = 0; i < cuantos; i++) copos.push(nuevoCopo(capa, false)); });
    estrellas = [];
    for (var j = 0; j < (ancho < 700 ? 8 : 18); j++) estrellas.push({ x: azar(0, ancho), y: azar(4, Math.min(70, alto * .15)), r: azar(.6, 1.4), fase: azar(0, 6.3), v: azar(1, 2.5) });
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
  function pintar(ahora) {
    pedido = 0;
    if (!activa()) { ultimo = 0; return; }
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
    copos.forEach(function (c, i) {
      c.y += c.vy * dt;
      c.fase += c.frec * dt;
      c.giro += c.vgiro * dt;
      var x = c.x + Math.sin(c.fase) * c.amp;
      if (c.y - c.r > alto) { copos[i] = nuevoCopo(c.capa, true); return; }
      if (c.capa === 2) {
        if (c.destello > 0) c.destello = Math.max(0, c.destello - dt * 1.5);
        else if (Math.random() < dt * .08) c.destello = 1;
        cristal({ x: x, y: c.y, r: c.r, giro: c.giro, alfa: c.alfa, destello: c.destello });
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + c.alfa + ')';
        if (c.capa === 0 && !modesto) {
          // Fondo: un poco difuminado (dos círculos, uno más grande y tenue)
          ctx.globalAlpha = .45; ctx.beginPath(); ctx.arc(x, c.y, c.r * 1.9, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(x, c.y, c.r, 0, 6.3); ctx.fill();
      }
    });
    seguir();
  }
  function seguir() { if (!pedido && activa()) pedido = window.requestAnimationFrame(pintar); }

  // Se enciende o se apaga sola cuando cambian las clases de <html> (piel, deco-quieta) o la pestaña
  new MutationObserver(function () {
    if (!activa()) { ctx.clearRect(0, 0, ancho, alto); ultimo = 0; return; }
    if (!copos.length) preparar();
    seguir();
  }).observe(html, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', seguir);
  if (reducir && reducir.addEventListener) reducir.addEventListener('change', function () { ctx.clearRect(0, 0, ancho, alto); seguir(); });
  var espera = null;
  window.addEventListener('resize', function () { clearTimeout(espera); espera = setTimeout(function () { if (activa()) preparar(); }, 200); });
  if (activa()) { preparar(); seguir(); }
})();
