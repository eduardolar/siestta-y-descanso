// Contra el «clickjacking»: la web y el panel no se dejan meter dentro de un marco (iframe) de otra web.
// Va sin defer en el <head>. En el panel, css/marco.css oculta la página hasta comprobarlo: si está
// en su propia ventana, se quita esa hoja; si está dentro de un marco, se sale del marco.
(function () {
  'use strict';
  if (window.top === window.self) {
    var oculto = document.getElementById('anti-marco');
    if (oculto) oculto.parentNode.removeChild(oculto);
  } else {
    try { window.top.location = window.self.location.href; } catch (e) { /* el marco no lo permite: sigue oculta */ }
  }
})();
