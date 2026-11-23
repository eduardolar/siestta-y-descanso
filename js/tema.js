// Tema de temporada ANTES de pintar la página (sin parpadeo): va sin defer en el <head> y solo lee la
// temporada de la caché (localStorage) para poner en <html> las clases «skin tema--navidad» (o la que sea).
// Lo demás (y lo que llegue luego del servidor) lo hace js/escaparate.js con la misma regla
// (Contenido.temporadaActiva). Sin caché, sin temporada o caducada: la web queda tal cual.
(function () {
  'use strict';
  var TIPOS = { navidad: 1, 'black-friday': 1, rebajas: 1, feria: 1 };
  function hoyMadrid() {
    try {
      var p = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  try {
    var c = JSON.parse(window.localStorage.getItem('siestta-contenido-v1') || 'null');
    var t = c && c.temporada;
    if (!t || !TIPOS.hasOwnProperty(t.tipo)) return;
    if (t.hasta && (typeof t.hasta !== 'string' || hoyMadrid() > t.hasta)) return;
    document.documentElement.classList.add('skin', 'tema--' + t.tipo);
  } catch (e) { /* sin caché: sin tema */ }
})();
