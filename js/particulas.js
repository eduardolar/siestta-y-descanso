// Partículas de temporada en la portada: un <canvas> detrás del texto (no resta contraste). Cada tema pone sus
// formas; el motor (tamaño, ritmo, pausas) es el mismo:
// - Navidad: nevada en tres capas (al fondo, copos pequeños, lentos y algo difuminados; en medio, medianos;
//   delante, pocos cristales de 6 puntas que giran despacio y a veces destellan) y, arriba, estrellitas que titilan.
// - Rebajas: lluvia suave de «%» y etiquetas pequeñas (blanco, amarillo y rojo oscuro) con vaivén y giro; y, cuando las
//   tijeras terminan de cortar el cupón, una ráfaga de confeti rojo y blanco donde acaba el corte.
// - Feria: confeti (rectángulos y tiras de colores que caen girando) y fuegos artificiales en la parte alta: un cohete
//   sube con su estela y estalla en una palmera de chispas que caen con gravedad y se apagan (2-3 a la vez como mucho).
// - Black Friday: lluvia de etiquetas de precio amarillas y negras, sin cifras (vacías, «%», «BF» u «OFERTA»), girando.
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
    if (html.classList.contains('tema--feria')) return 'feria';
    if (html.classList.contains('tema--black-friday')) return 'black-friday';
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

  // ---------- Rebajas: ráfaga de confeti al terminar el corte del cupón ----------
  // El corte termina al 44 % de la animación «cupon-pista» (28 s, css/estilos.css): se mira su tiempo en cada fotograma
  var animCorte = null, tiempoAntes = 0, rafaga = [];
  function corteTerminado() {
    if (!animCorte || animCorte.playState === 'idle') {
      var pista = document.querySelector('.cupon__pista');
      animCorte = pista && pista.getAnimations ? pista.getAnimations()[0] || null : null;
      if (!animCorte) return false;
    }
    var t = (animCorte.currentTime || 0) % 28000, fin = 28000 * .44;
    var cruza = tiempoAntes < fin && t >= fin;
    tiempoAntes = t;
    return cruza;
  }
  function soltarRafaga() {
    // Donde acaba la línea del cupón (su último trozo visible), en coordenadas del lienzo
    var trozos = document.querySelectorAll('.cupon__trozo');
    var ultimo = null;
    Array.prototype.forEach.call(trozos, function (t) { if (t.offsetWidth) ultimo = t; });
    if (!ultimo) return;
    var r = ultimo.getBoundingClientRect(), c = lienzo.getBoundingClientRect();
    var x = Math.min(r.left - c.left, ancho - 20), y = r.top - c.top;
    var n = modesto ? 8 : pequeno ? 14 : 30;
    for (var i = 0; i < n; i++) {
      var ang = azar(-3.1, 0), v = azar(90, 220);
      rafaga.push({ x: x, y: y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, giro: azar(0, 6.3), vgiro: azar(-8, 8), vida: azar(1.2, 1.8), edad: 0,
        w: azar(6, 10), h: azar(10, 16), color: Math.random() < .5 ? '196,32,50' : '255,255,255' });
    }
  }
  function rebajasExtra(dt) {
    if (corteTerminado()) soltarRafaga();
    rafaga = rafaga.filter(function (p) {
      p.edad += dt;
      if (p.edad >= p.vida) return false;
      p.vy += 260 * dt; p.vx *= 1 - .8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.giro += p.vgiro * dt;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.giro);
      ctx.fillStyle = 'rgba(' + p.color + ',' + (1 - p.edad / p.vida).toFixed(2) + ')';
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeStyle = 'rgba(125,18,32,' + (.6 * (1 - p.edad / p.vida)).toFixed(2) + ')'; ctx.lineWidth = .8;
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      return true;
    });
  }

  // ---------- Feria: confeti y fuegos artificiales ----------
  // Colores de la marca que se ven sobre el amarillo de la feria (el amarillo no: desaparecería)
  var COLORES_FERIA = ['196,32,50', '26,111,176', '46,155,72', '26,20,20', '255,255,255'];
  function nuevoConfeti(capa, arriba) {
    // capa 0 y 1: rectángulos · 2: tiras largas
    return {
      capa: capa, r: capa === 2 ? azar(9, 14) : azar(5, 8), x: azar(0, ancho), y: arriba ? azar(-40, -10) : azar(0, alto),
      vy: azar(30, 55), amp: azar(6, 18), fase: azar(0, 6.3), frec: azar(.6, 1.4),
      giro: azar(0, 6.3), vgiro: azar(-3, 3), vuelta: azar(0, 6.3), alfa: azar(.7, .95),
      color: COLORES_FERIA[Math.floor(Math.random() * COLORES_FERIA.length)]
    };
  }
  function confeti(p, x, dt) {
    // El giro en el aire: el lado corto se estrecha y se ensancha (como un papel que da vueltas)
    p.vuelta += dt * 5;
    var w = p.capa === 2 ? 3 : p.r * 1.4, h = p.capa === 2 ? p.r * 2.4 : p.r;
    ctx.save();
    ctx.translate(x, p.y);
    ctx.rotate(p.giro);
    ctx.scale(1, Math.max(.15, Math.abs(Math.cos(p.vuelta))));
    ctx.fillStyle = 'rgba(' + p.color + ',' + p.alfa + ')';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  var COLORES_FUEGOS = ['196,32,50', '26,111,176', '46,155,72', '158,23,38']; // sin blanco ni amarillo: sobre el amarillo no se verían
  var cohetes = [], chispas = [], destellos = [], esperaCohete = 0, grupo = 0;
  function maxFuegos() { return modesto ? 1 : pequeno ? 2 : 3; }
  function lanzar() {
    // Sale de la mitad de abajo y estalla en la franja de arriba (por detrás del texto). En escritorio, sobre la
    // columna del texto (la foto, a la derecha, lo taparía)
    var x = pequeno ? azar(ancho * .1, ancho * .9) : azar(ancho * .06, ancho * .5);
    cohetes.push({ x: x, y: alto * azar(.55, .75), vy: -azar(260, 340), fin: alto * azar(.08, .26), color: COLORES_FUEGOS[Math.floor(Math.random() * COLORES_FUEGOS.length)], estela: [] });
  }
  function estallar(c) {
    var n = modesto ? 16 : pequeno ? 26 : 44;
    var base = c.color;
    grupo++;
    destellos.push({ x: c.x, y: c.y, edad: 0, color: base });
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * 6.283 + azar(-.1, .1), v = azar(165, 315);
      chispas.push({ g: grupo, x: c.x, y: c.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vida: azar(1.3, 1.9), edad: 0,
        color: Math.random() < .25 ? COLORES_FUEGOS[Math.floor(Math.random() * COLORES_FUEGOS.length)] : base });
    }
  }
  function fuegos(dt) {
    esperaCohete -= dt;
    // Fuegos en marcha: cohetes subiendo + palmeras que aún tienen chispas
    var vivas = {};
    chispas.forEach(function (p) { vivas[p.g] = true; });
    if (esperaCohete <= 0 && cohetes.length + Object.keys(vivas).length < maxFuegos()) {
      lanzar();
      esperaCohete = azar(1.4, 2.8);
    }
    ctx.lineCap = 'round';
    cohetes = cohetes.filter(function (c) {
      c.estela.push([c.x, c.y]);
      if (c.estela.length > 8) c.estela.shift();
      c.y += c.vy * dt;
      c.x += Math.sin(c.y * .05) * .3;
      // Estela con un borde oscuro debajo, para que se vea sobre el amarillo
      ctx.beginPath();
      c.estela.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.lineTo(c.x, c.y);
      ctx.strokeStyle = 'rgba(26,20,20,.35)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = 'rgba(' + c.color + ',.8)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(' + c.color + ',1)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 3.4, 0, 6.3); ctx.fill();
      if (c.y <= c.fin) { estallar(c); return false; }
      return true;
    });
    chispas = chispas.filter(function (p) {
      p.edad += dt;
      if (p.edad >= p.vida) return false;
      p.vy += 120 * dt;                       // gravedad
      p.vx *= 1 - .9 * dt; p.vy *= 1 - .4 * dt; // frenan en el aire
      var x0 = p.x, y0 = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      var a = 1 - p.edad / p.vida;
      // Chispa con estela: trazo oscuro fino debajo y el color encima (destaca sobre el amarillo)
      ctx.beginPath(); ctx.moveTo(x0 - p.vx * .06, y0 - p.vy * .06); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = 'rgba(26,20,20,' + (a * .35).toFixed(2) + ')'; ctx.lineWidth = 4.6; ctx.stroke();
      ctx.strokeStyle = 'rgba(' + p.color + ',' + a.toFixed(2) + ')'; ctx.lineWidth = 2.8; ctx.stroke();
      return true;
    });
    // Destello breve en el centro al estallar (crece y se apaga en ~0,3 s)
    destellos = destellos.filter(function (d) {
      d.edad += dt;
      if (d.edad > .3) return false;
      var k = d.edad / .3;
      ctx.fillStyle = 'rgba(' + d.color + ',' + (.45 * (1 - k)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, 10 + 34 * k, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (1 - k).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, 7 * (1 - k) + 2, 0, 6.3); ctx.fill();
      return true;
    });
  }

  // ---------- Black Friday: etiquetas de precio (sin cifras) ----------
  var TEXTOS_BF = ['', '', '%', 'BF', 'OFERTA'];
  function nuevaEtiquetaBF(capa, arriba) {
    // capa 0: pequeñas y tenues · 1: medianas · 2: grandes, con texto
    return {
      capa: capa, r: [azar(8, 11), azar(12, 16), azar(18, 24)][capa], x: azar(0, ancho), y: arriba ? azar(-60, -20) : azar(0, alto),
      vy: [azar(18, 26), azar(26, 36), azar(34, 46)][capa], amp: azar(8, 24), fase: azar(0, 6.3), frec: azar(.4, 1),
      giro: azar(-.7, .7), vgiro: azar(-.8, .8), alfa: [azar(.35, .5), azar(.55, .75), azar(.8, .95)][capa],
      negra: Math.random() < .35, texto: capa === 2 ? TEXTOS_BF[Math.floor(Math.random() * TEXTOS_BF.length)] : ''
    };
  }
  function etiquetaBF(p, x) {
    var w = p.r * 1.6, h = p.r * 2.3;
    ctx.save();
    ctx.translate(x, p.y);
    ctx.rotate(p.giro);
    ctx.globalAlpha = p.alfa;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, -h / 2 + w * .45); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(-w / 2, -h / 2 + w * .45);
    ctx.closePath();
    ctx.fillStyle = p.negra ? '#111' : '#ffd400';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = p.negra ? '#ffd400' : '#111';
    ctx.stroke();
    ctx.fillStyle = p.negra ? '#ffd400' : '#111';
    ctx.beginPath(); ctx.arc(0, -h / 2 + w * .5, w * .13, 0, 6.3); ctx.fill();
    if (p.texto) {
      ctx.font = '900 ' + Math.round(p.texto.length > 2 ? w * .3 : w * .55) + 'px "Inter Display", "Inter", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.texto, 0, h * .12);
    }
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
      estrellas: false,
      extra: rebajasExtra
    },
    'black-friday': {
      escritorio: 34, movil: 8, modesto: 6, reparto: [.45, .35], margen: 2,
      nueva: nuevaEtiquetaBF,
      pintar: etiquetaBF,
      estrellas: false
    },
    feria: {
      escritorio: 60, movil: 18, modesto: 10, reparto: [.4, .35], margen: 3,
      nueva: nuevoConfeti,
      pintar: confeti,
      estrellas: false,
      extra: fuegos
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
    piezas = []; estrellas = []; cohetes = []; chispas = []; destellos = []; rafaga = []; animCorte = null; esperaCohete = 2;
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
    if (T.extra) T.extra(dt);
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
