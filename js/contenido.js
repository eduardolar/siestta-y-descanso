// Contenido de la web: datos de la tienda, textos de portada y productos del escaparate.
// La fuente de verdad es la base de datos (Supabase, ver js/datos.js). Aquí están el modelo, la
// revisión de todo lo que llega (normalizar) y una CACHÉ en este navegador (localStorage) con el
// último contenido bueno, para que la web cargue al instante; si no hay caché, o falla, el ejemplo.
(function () {
  'use strict';

  var CLAVE = 'siestta-contenido-v1';
  var VERSION = 3;

  var CATEGORIAS = {
    sofas: 'Sofás',
    sillones: 'Sillones',
    colchones: 'Colchones',
    camas: 'Camas'
  };
  var ETIQUETAS = {
    '': 'Ninguna',
    exposicion: 'Exposición',
    oferta: 'Oferta',
    ultimas: 'Últimas unidades'
  };
  var ESTADOS = {
    disponible: 'Disponible',
    reservado: 'Reservado',
    vendido: 'Vendido'
  };
  // Firmeza del colchón (solo se enseña en los colchones)
  var FIRMEZAS = {
    '': 'Sin indicar',
    blanda: 'Blanda',
    media: 'Media',
    firme: 'Firme',
    'muy firme': 'Muy firme'
  };
  var LIMITES = { nombre: 60, descripcion: 140, aviso: 120, titular: 80, entradilla: 220, direccion: 140, productos: 200, lineasTitular: 3, lineasDireccion: 3,
    opiniones: 6, opinion: 220, autor: 40, financiacion: 80, marcas: 12, marca: 30,
    fotos: 4, descripcionLarga: 1000, medidas: 120, colores: 160, plazo: 60, zonaEntrega: 80 };
  // La entradilla de antes de la versión 3 prometía la entrega a todos: si sigue sin tocar, se cambia
  var ENTRADILLA_V2 = 'En Tomelloso, con quien te atiende en persona. Pruébalo, elegimos contigo medida, tela y color, y te lo llevamos a casa.';
  // Enlace a las opiniones: solo Google Maps, con el dominio anclado (igual que la base de datos)
  var RE_ENLACE_OPINIONES = /^https:\/\/(www\.)?google\.(com|es)\/maps([/?]|$)|^https:\/\/maps\.app\.goo\.gl\/|^https:\/\/g\.page\//;
  var ENLACE_GOOGLE = 'https://www.google.com/maps/search/?api=1&query=Siestta%20y%20Descanso%20Tomelloso';

  // Productos de EJEMPLO para enseñar el escaparate. Los tres precios son los publicados
  // en sus redes (pueden haber cambiado); el resto va como «Consultar» para no inventar.
  // Los que no tienen foto propia salen con un cartel con icono en vez de una foto equivocada.
  var CONTENIDO_EJEMPLO = {
    version: VERSION,
    tienda: {
      telefono: '621 23 05 88',
      whatsapp: '34621230588',
      direccion: 'Calle Herradores 65, esquina vía de servicio\n13700 Tomelloso (Ciudad Real)',
      horario: [
        { dias: 'Lunes a viernes', horas: '10:00–13:30 y 17:00–20:30' },
        { dias: 'Sábados', horas: '10:00–13:30' }
      ],
      aviso: { activo: false, texto: 'En feria abrimos de 10:00 a 14:00' },
      // La entrega a domicilio no llega a todas partes: la web enseña esta zona (vacía = «consulta zona»)
      zonaEntrega: 'Tomelloso y pueblos cercanos'
    },
    // La sociedad Siestta y Descanso S.L. se constituyó el 5-11-2003
    desde: '2003',
    // Opiniones reales de su ficha de Google (nota y número de opiniones a 22-11-2026)
    opiniones: {
      nota: 4.4,
      total: 28,
      enlace: ENLACE_GOOGLE,
      lista: [
        { texto: 'Super contentos con la compra que hemos hecho con ellos… super amables y muy profesionales.', autor: 'Brian L.' },
        { texto: 'Buen trato, personal muy cercano y atento a escuchar nuestras necesidades… mejor calidad precio de todos los que habíamos visto.', autor: 'Rubén C.' },
        { texto: 'Calidad-precio inmejorable. He buscado por toda la provincia y no he encontrado nada mejor.', autor: 'Sara Victoria M.' }
      ]
    },
    // Sí ofrecen financiación; las condiciones no se conocen, así que no se inventan
    financiacion: { activa: true, texto: '' },
    marcas: [],
    portada: {
      titular: 'Siéntate. Túmbate.\nLuego decides.',
      entradilla: 'Pruébalo en la tienda y elige con nosotros medida, tela y color.',
      // Producto destacado en la portada (su foto y su precio); '' = solo la foto de la tienda.
      // Uno disponible, con foto propia y precio, para que la foto y el precio coincidan.
      destacado: 'COL-01',
      foto: 'img/tienda-sofa-blanco.jpg'
    },
    // Detalles de la ficha: solo lo que se sabe seguro. Medidas, firmeza y plazos se dejan
    // vacíos (son opcionales y no salen); la cama lleva dos fotos porque es la misma de las dos fotos.
    productos: [
      {
        id: 'SOF-01', nombre: 'Conjunto de sofás 3+2', categoria: 'sofas',
        precio: 699, precioAntes: null, etiqueta: 'exposicion', estado: 'disponible', fotos: [],
        descripcion: 'Sofá de tres plazas y otro de dos. Pieza de exposición: se vende tal cual la ves.',
        descripcionLarga: 'Un sofá de tres plazas y otro de dos, de la exposición de la tienda. Se vende tal cual lo ves.',
        destacado: false
      },
      {
        id: 'COL-01', nombre: 'Colchón 150×190', categoria: 'colchones',
        precio: 299, precioAntes: null, etiqueta: 'exposicion', estado: 'disponible', fotos: ['img/colchon-detalle.jpg'],
        descripcion: 'Túmbate en él en la tienda antes de llevártelo. Con su almohada a juego.',
        descripcionLarga: 'Colchón de 150×190 de la exposición, con su almohada a juego.',
        destacado: true
      },
      {
        id: 'SIL-01', nombre: 'Sillón de exposición', categoria: 'sillones',
        precio: 99, precioAntes: null, etiqueta: 'exposicion', estado: 'disponible', fotos: [],
        descripcion: 'Pieza de exposición con descuento. Cuando se acaba, se acaba.',
        destacado: false
      },
      {
        id: 'SOF-02', nombre: 'Sofá chaiselongue azul', categoria: 'sofas',
        precio: null, precioAntes: null, etiqueta: '', estado: 'disponible', fotos: ['img/sofa-chaiselongue.jpg'],
        descripcion: 'Chaiselongue con arcón. Te lo pedimos con tu medida, tela y color.',
        descripcionLarga: 'Chaiselongue con arcón para guardar mantas y cojines.',
        colores: 'Varias telas y colores en tienda', aMedida: true,
        destacado: true
      },
      {
        id: 'SOF-03', nombre: 'Sofá chaiselongue blanco', categoria: 'sofas',
        precio: null, precioAntes: null, etiqueta: 'ultimas', estado: 'reservado', fotos: ['img/tienda-sofa-blanco.jpg'],
        descripcion: 'El de la entrada de la tienda. Tela clara y asientos amplios.',
        colores: 'Varias telas y colores en tienda', aMedida: true,
        destacado: true
      },
      {
        id: 'SIL-02', nombre: 'Sillón relax camel', categoria: 'sillones',
        precio: null, precioAntes: null, etiqueta: '', estado: 'disponible', fotos: ['img/sillon-relax.jpg'],
        descripcion: 'Respaldo alto y reposapiés, para sentarse y levantarse sin esfuerzo.',
        destacado: true
      },
      {
        id: 'CAM-01', nombre: 'Cama con canapé y cabecero', categoria: 'camas',
        precio: null, precioAntes: null, etiqueta: '', estado: 'disponible', fotos: ['img/colchon-cabecero.jpg', 'img/colchon-detalle.jpg'],
        descripcion: 'Canapé abatible de madera clara y cabecero tapizado con tachuelas.',
        descripcionLarga: 'Canapé abatible de madera clara, con hueco para guardar, y cabecero tapizado con tachuelas.',
        destacado: false
      }
    ]
  };

  // ---------- Utilidades ----------

  function copiar(o) { return JSON.parse(JSON.stringify(o)); }

  function texto(valor, max, porDefecto) {
    if (typeof valor !== 'string') return porDefecto;
    var t = valor.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
    return max ? Array.from(t).slice(0, max).join('') : t;
  }

  function unaLinea(valor, max, porDefecto) {
    var t = texto(valor, 0, null);
    if (t === null) return porDefecto;
    t = t.replace(/\s+/g, ' ');
    return Array.from(t).slice(0, max).join('');
  }

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    var n = valor;
    if (typeof valor !== 'number') {
      var t = String(valor).replace(/\s/g, '');
      if (/^[.,]/.test(t)) return null; // «.5» es ambiguo: mejor pedir el número completo
      // «1.299,90» o «299,90»: la coma es el decimal. «299.90»: un punto con 1-2 cifras detrás también.
      if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
      else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
      n = /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
    }
    if (!isFinite(n) || n < 0 || n > 1000000) return null;
    return Math.round(n * 100) / 100;
  }

  // Fotos: una ruta de la carpeta img/ (las que van con la web) o una ruta del bucket «fotos» de
  // Supabase: productos/{ref}/{uuid}.jpg o portada/{uuid}.jpg (como las reglas de la base de datos).
  // Las fotos incrustadas (data:…) del prototipo ya no valen: las fotos se suben al bucket.
  var RE_IMG = /^img\/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp)$/i;
  var RE_ALMACEN = /^(productos\/[A-Z]{3}-\d{2,4}|portada)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

  function esRutaImg(foto) { return typeof foto === 'string' && foto.length <= 200 && RE_IMG.test(foto) && foto.indexOf('..') === -1; }
  function esRutaAlmacen(foto) { return typeof foto === 'string' && RE_ALMACEN.test(foto); }
  function fotoValida(foto) { return esRutaImg(foto) || esRutaAlmacen(foto); }
  // De un producto: de img/ o de su propia carpeta del bucket (productos/{ref}/…)
  function fotoDeProducto(foto, ref) {
    return esRutaImg(foto) || (esRutaAlmacen(foto) && foto.indexOf('productos/' + ref + '/') === 0);
  }
  function fotoDePortada(foto) { return esRutaImg(foto) || (esRutaAlmacen(foto) && foto.indexOf('portada/') === 0); }

  // Dirección de una foto para <img>: las de img/ son relativas (con ?v= para la caché del navegador);
  // las del bucket, su URL pública (el nombre es un uuid nuevo cada vez: no hace falta ?v=)
  function urlFoto(foto, version) {
    if (esRutaAlmacen(foto)) {
      var cfg = window.SIESTTA_CONFIG || {};
      return String(cfg.url || '').replace(/\/+$/, '') + '/storage/v1/object/public/fotos/' + foto;
    }
    return foto + (version ? '?v=' + version : '');
  }

  // Hasta 4 fotos válidas y sin repetir; la primera es la principal. Con ref, solo las de ese producto
  function normalizarFotos(fotos, ref) {
    var vistas = {};
    return (Array.isArray(fotos) ? fotos : []).filter(function (f) {
      if (!(ref ? fotoDeProducto(f, ref) : fotoValida(f)) || vistas[f]) return false;
      vistas[f] = true;
      return true;
    }).slice(0, LIMITES.fotos);
  }

  // La foto principal (la de la tarjeta), o '' si no tiene. Úsese siempre esta, no p.fotos[0]
  function fotoPrincipal(p) {
    return p && Array.isArray(p.fotos) && fotoValida(p.fotos[0]) ? p.fotos[0] : '';
  }

  // Texto de varios párrafos: sin caracteres de control, con saltos de línea y como mucho una línea en blanco seguida
  function parrafos(valor, max) {
    if (typeof valor !== 'string') return '';
    var t = valor.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
      .split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).join('\n')
      .replace(/\n{3,}/g, '\n\n').trim();
    return Array.from(t).slice(0, max).join('').trim();
  }

  function soloDigitos(t) { return String(t || '').replace(/\D/g, ''); }

  function whatsappValido(t) { return /^34\d{9}$/.test(String(t || '')); }

  // Acepta «621 23 05 88», «621-230-588», «+34 621…», «0034 621…» o «34621…» y devuelve «34621230588».
  // Si no es un móvil español válido, devuelve ''.
  function normalizarWhatsapp(t) {
    var crudo = String(t || '').trim();
    if (/[^\d\s+().-]/.test(crudo)) return '';
    var d = soloDigitos(crudo);
    if (/^0034\d{9}$/.test(d)) d = d.slice(2);
    if (/^[6789]\d{8}$/.test(d)) d = '34' + d;
    return whatsappValido(d) ? d : '';
  }

  // «34621230588» → «621 23 05 88»
  function whatsappLegible(wa) {
    var d = whatsappValido(wa) ? wa.slice(2) : soloDigitos(wa);
    return d.length === 9 ? d.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : d;
  }

  // 699 → «699 €»; 1299 → «1.299 €»; 99.5 → «99,50 €»
  function formatearPrecio(n) {
    if (typeof n !== 'number' || !isFinite(n)) return 'Consultar';
    var entero = Math.floor(n);
    var dec = Math.round((n - entero) * 100);
    var miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return miles + (dec ? ',' + String(dec).padStart(2, '0') : '') + ' €';
  }

  function enlaceWhatsApp(numeroWa, mensaje) {
    var n = whatsappValido(numeroWa) ? numeroWa : CONTENIDO_EJEMPLO.tienda.whatsapp;
    return 'https://wa.me/' + n + (mensaje ? '?text=' + encodeURIComponent(mensaje) : '');
  }

  function enlaceTelefono(telefono) {
    var d = soloDigitos(telefono);
    if (d.length === 9) d = '34' + d;
    return 'tel:+' + d;
  }

  // ---------- Horario: «Lunes a viernes» + «10:00–13:30 y 17:00–20:30» ----------
  // Días de 0 (lunes) a 6 (domingo).

  var NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var PLURAL_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

  function sinTildes(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function leerDias(textoDias) {
    var t = sinTildes(textoDias);
    var re = /(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)/g;
    var claves = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    var hallados = [];
    var m;
    while ((m = re.exec(t))) {
      var nombre = m[1].replace(/^(sabado|domingo)s$/, '$1');
      hallados.push({ dia: claves.indexOf(nombre), desde: m.index, hasta: re.lastIndex });
    }
    var dias = [];
    for (var i = 0; i < hallados.length; i++) {
      var h = hallados[i];
      if (h.dia < 0) continue;
      var sig = hallados[i + 1];
      if (sig && /^\s*(a|al|hasta|-|–|—)\s*$/.test(t.slice(h.hasta, sig.desde))) {
        for (var d = h.dia; ; d = (d + 1) % 7) {
          if (dias.indexOf(d) === -1) dias.push(d);
          if (d === sig.dia) break;
        }
        i++;
      } else if (dias.indexOf(h.dia) === -1) {
        dias.push(h.dia);
      }
    }
    return dias.sort();
  }

  function leerHoras(textoHoras) {
    var t = String(textoHoras || '');
    var re = /(\d{1,2})[:.h](\d{2})\s*(?:-|–|—|a)\s*(\d{1,2})[:.h](\d{2})/g;
    var tramos = [];
    var m;
    while ((m = re.exec(t))) {
      var a = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      var b = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
      if (a < b && b <= 24 * 60) tramos.push([a, b]);
    }
    return tramos;
  }

  function hhmm(minutos) {
    return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
  }

  function componerHoras(tramos) {
    return tramos.map(function (t) { return hhmm(t[0]) + '–' + hhmm(t[1]); }).join(' y ');
  }

  function mayuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function componerDias(dias) {
    dias = dias.slice().sort();
    if (!dias.length) return '';
    if (dias.length === 1) return mayuscula(PLURAL_DIA[dias[0]]);
    var seguidos = dias.every(function (d, i) { return i === 0 || d === dias[i - 1] + 1; });
    if (seguidos && dias.length >= 3) return mayuscula(NOMBRES_DIA[dias[0]] + ' a ' + NOMBRES_DIA[dias[dias.length - 1]]);
    var nombres = dias.map(function (d) { return PLURAL_DIA[d]; });
    return mayuscula(nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1]);
  }

  // Horario por día: [[[600, 810], [1020, 1230]], ...] de lunes a domingo.
  function horarioPorDia(horario) {
    var semana = [[], [], [], [], [], [], []];
    (horario || []).forEach(function (tramo) {
      var horas = leerHoras(tramo.horas);
      leerDias(tramo.dias).forEach(function (d) { semana[d] = semana[d].concat(horas); });
    });
    semana.forEach(function (t) { t.sort(function (a, b) { return a[0] - b[0]; }); });
    return semana;
  }

  // ---------- Normalizar: todo lo que sale de localStorage se revisa ----------

  function normalizarProducto(p, usados) {
    if (!p || typeof p !== 'object') return null;
    var nombre = unaLinea(p.nombre, LIMITES.nombre, '');
    if (!nombre) return null;
    var categoria = CATEGORIAS.hasOwnProperty(p.categoria) ? p.categoria : 'sofas';
    var id = unaLinea(p.id, 20, '');
    if (!/^[A-Z]{3}-\d{2,4}$/.test(id) || usados[id]) id = nuevoId(categoria, usados);
    usados[id] = true;
    var precio = numero(p.precio);
    var antes = numero(p.precioAntes);
    if (precio !== null && precio <= 0) precio = null; // 0 € se enseña como «Consultar»
    if (precio === null || antes === null || antes <= precio) antes = null;
    return {
      id: id,
      nombre: nombre,
      categoria: categoria,
      precio: precio,
      precioAntes: antes,
      etiqueta: ETIQUETAS.hasOwnProperty(p.etiqueta) ? p.etiqueta : '',
      estado: ESTADOS.hasOwnProperty(p.estado) ? p.estado : 'disponible',
      // Datos sin migrar con la foto suelta (p.foto): se aceptan como su única foto
      fotos: normalizarFotos(Array.isArray(p.fotos) ? p.fotos : [p.foto], id),
      descripcion: unaLinea(p.descripcion, LIMITES.descripcion, ''),
      descripcionLarga: parrafos(p.descripcionLarga, LIMITES.descripcionLarga),
      medidas: unaLinea(p.medidas, LIMITES.medidas, ''),
      colores: unaLinea(p.colores, LIMITES.colores, ''),
      // Se guarda aunque cambie la categoría; la web solo la enseña en los colchones
      firmeza: FIRMEZAS.hasOwnProperty(p.firmeza) ? p.firmeza : '',
      aMedida: p.aMedida === true,
      plazo: unaLinea(p.plazo, LIMITES.plazo, ''),
      destacado: p.destacado === true
    };
  }

  function nuevoId(categoria, usados) {
    var prefijo = { sofas: 'SOF', sillones: 'SIL', colchones: 'COL', camas: 'CAM' }[categoria] || 'PRO';
    for (var n = 1; n < 10000; n++) {
      var id = prefijo + '-' + String(n).padStart(2, '0');
      if (!usados[id]) return id;
    }
    return prefijo + '-' + Date.now() % 10000;
  }

  function normalizar(c) {
    var ej = CONTENIDO_EJEMPLO;
    c = c && typeof c === 'object' ? c : {};
    var t = c.tienda && typeof c.tienda === 'object' ? c.tienda : {};
    var p = c.portada && typeof c.portada === 'object' ? c.portada : {};
    var aviso = t.aviso && typeof t.aviso === 'object' ? t.aviso : {};

    var horario = Array.isArray(t.horario) ? t.horario.slice(0, 7).map(function (h) {
      return h && typeof h === 'object'
        ? { dias: unaLinea(h.dias, 60, ''), horas: unaLinea(h.horas, 60, '') }
        : null;
    }).filter(function (h) { return h && h.dias; }) : copiar(ej.tienda.horario);

    var usados = {};
    var productos = Array.isArray(c.productos)
      ? c.productos.slice(0, LIMITES.productos).map(function (x) { return normalizarProducto(x, usados); }).filter(Boolean)
      : copiar(ej.productos);

    var wa = normalizarWhatsapp(t.whatsapp);
    var destacado = p.destacado === undefined ? ej.portada.destacado : unaLinea(p.destacado, 20, '');

    // Bloques de confianza: si no vienen (datos de la versión 1), se usan los del ejemplo;
    // si vienen vacíos, se respetan (y la web no los enseña)
    var op = c.opiniones && typeof c.opiniones === 'object' ? c.opiniones : copiar(ej.opiniones);
    var nota = numero(op.nota);
    var total = numero(op.total);
    var enlace = typeof op.enlace === 'string' &&
      RE_ENLACE_OPINIONES.test(op.enlace) && op.enlace.length <= 500 && !/[\s<>"']/.test(op.enlace)
      ? op.enlace : ENLACE_GOOGLE;
    var lista = Array.isArray(op.lista) ? op.lista.slice(0, LIMITES.opiniones).map(function (o) {
      return o && typeof o === 'object'
        ? { texto: unaLinea(o.texto, LIMITES.opinion, ''), autor: unaLinea(o.autor, LIMITES.autor, '') }
        : null;
    }).filter(function (o) { return o && o.texto; }) : [];
    var fin = c.financiacion && typeof c.financiacion === 'object' ? c.financiacion : ej.financiacion;
    var vistas = {};
    var marcas = (Array.isArray(c.marcas) ? c.marcas : []).map(function (m) { return unaLinea(m, LIMITES.marca, ''); })
      .filter(function (m) { var k = m.toLowerCase(); if (!m || vistas[k]) return false; vistas[k] = true; return true; })
      .slice(0, LIMITES.marcas);
    var desde = c.desde === undefined ? ej.desde : String(c.desde || '').trim();
    if (desde && (!/^(19|20)\d{2}$/.test(desde) || parseInt(desde, 10) > new Date().getFullYear())) desde = '';

    return {
      version: VERSION,
      tienda: {
        telefono: unaLinea(t.telefono, 20, '') || ej.tienda.telefono,
        whatsapp: whatsappValido(wa) ? wa : ej.tienda.whatsapp,
        direccion: texto(t.direccion, LIMITES.direccion, '') || ej.tienda.direccion,
        horario: horario,
        aviso: { activo: aviso.activo === true, texto: unaLinea(aviso.texto, LIMITES.aviso, '') },
        // Si no viene (datos anteriores a la versión 3), la del ejemplo; si viene vacía, se respeta
        zonaEntrega: t.zonaEntrega === undefined ? ej.tienda.zonaEntrega : unaLinea(t.zonaEntrega, LIMITES.zonaEntrega, '')
      },
      portada: {
        titular: texto(p.titular, LIMITES.titular, '') || ej.portada.titular,
        entradilla: unaLinea(p.entradilla, LIMITES.entradilla, '') || ej.portada.entradilla,
        // Solo si es un producto que se ve en la web: si se vende o se borra, la portada se queda sin destacado
        destacado: productos.some(function (x) { return x.id === destacado && x.estado !== 'vendido'; }) ? destacado : '',
        foto: fotoDePortada(p.foto) ? p.foto : ej.portada.foto
      },
      desde: desde,
      opiniones: {
        nota: nota !== null && nota >= 1 && nota <= 5 ? Math.round(nota * 10) / 10 : null,
        total: total !== null ? Math.min(Math.round(total), 100000) : null,
        enlace: enlace,
        lista: lista
      },
      financiacion: { activa: fin.activa === true, texto: unaLinea(fin.texto, LIMITES.financiacion, '') },
      marcas: marcas,
      productos: productos
    };
  }

  // Cambios de esquema. v0 → v1: no había versiones. v1 → v2: llegan desde, opiniones,
  // financiación y marcas; como no existen en los datos viejos, normalizar() pone los del ejemplo.
  // v2 → v3: la foto suelta (foto) pasa a ser la lista de fotos (fotos: [foto]); los campos nuevos
  // de la ficha (descripcionLarga, medidas, colores, firmeza, aMedida, plazo) quedan vacíos. Llega la zona
  // de entrega (la del ejemplo), el destacado de la portada y su foto; si la entradilla era la de antes, se pone la nueva.
  function migrar(c) {
    if (!c || typeof c !== 'object') return null;
    var v = typeof c.version === 'number' ? c.version : 0;
    if (v > VERSION) return null; // guardado por una versión más nueva: no lo tocamos
    if (v < 2) {
      delete c.desde; delete c.opiniones; delete c.financiacion; delete c.marcas;
    }
    if (v < 3 && c.tienda && typeof c.tienda === 'object') delete c.tienda.zonaEntrega;
    if (v < 3 && c.portada && typeof c.portada === 'object' && c.portada.entradilla === ENTRADILLA_V2) {
      c.portada.entradilla = CONTENIDO_EJEMPLO.portada.entradilla;
    }
    // Antes la portada enseñaba sola la primera pieza de exposición con precio: se conserva como destacado
    if (v < 3 && c.portada && typeof c.portada === 'object') {
      var expo = (Array.isArray(c.productos) ? c.productos : []).filter(function (x) {
        return x && x.etiqueta === 'exposicion' && x.estado === 'disponible' && numero(x.precio) !== null && numero(x.precio) > 0;
      })[0];
      c.portada.destacado = expo && typeof expo.id === 'string' ? expo.id : '';
      delete c.portada.foto;
    }
    if (v < 3 && Array.isArray(c.productos)) {
      c.productos.forEach(function (p) {
        if (!p || typeof p !== 'object') return;
        p.fotos = p.foto ? [p.foto] : [];
        delete p.foto;
        ['descripcionLarga', 'medidas', 'colores', 'firmeza', 'aMedida', 'plazo'].forEach(function (k) { delete p[k]; });
      });
    }
    return c;
  }

  // ---------- Caché en este navegador (el último contenido bueno que llegó del servidor) ----------

  // Lo que hay en la caché, revisado; si no hay nada o no se puede leer, el ejemplo
  function cargarContenido() {
    if (memoria) return copiar(memoria);
    try {
      var crudo = window.localStorage.getItem(CLAVE);
      if (!crudo) return normalizar(copiar(CONTENIDO_EJEMPLO));
      var datos = migrar(JSON.parse(crudo));
      var bueno = datos ? cacheValida(datos) : null;
      if (bueno) return bueno;
      // Caché estropeada (o de una versión más nueva): se descarta y se usa el ejemplo
      if (datos) window.localStorage.removeItem(CLAVE);
      return normalizar(copiar(CONTENIDO_EJEMPLO));
    } catch (e) {
      return normalizar(copiar(CONTENIDO_EJEMPLO));
    }
  }

  // La caché normalizada, o null si no es de fiar: tienda y portada tienen que ser objetos y TODOS sus
  // productos tienen que seguir siendo válidos tras revisarlos (si alguno se pierde, algo la ha estropeado)
  function cacheValida(c) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.productos)) return null;
    if (!c.tienda || typeof c.tienda !== 'object' || !c.portada || typeof c.portada !== 'object') return null;
    var n = normalizar(c);
    if (n.productos.length !== Math.min(c.productos.length, LIMITES.productos)) return null;
    var ids = {};
    for (var i = 0; i < c.productos.length && i < LIMITES.productos; i++) {
      var p = c.productos[i];
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || ids[p.id]) return null;
      ids[p.id] = true;
    }
    return n;
  }

  // Guarda en la caché y avisa a esta pestaña (las demás se enteran por el evento «storage»).
  // Si no se puede (modo privado, sin espacio), no pasa nada: la web sigue con lo que tiene.
  // También se queda en memoria, por si este navegador no deja guardar (modo privado).
  var EVENTO = 'siestta:contenido';
  var memoria = null;
  function guardarContenido(c) {
    var nuevo = normalizar(c);
    var texto = JSON.stringify(nuevo);
    var antes = memoria ? JSON.stringify(memoria) : null;
    var ok = true;
    memoria = nuevo;
    try {
      antes = antes || window.localStorage.getItem(CLAVE);
      if (antes !== texto) window.localStorage.setItem(CLAVE, texto);
    } catch (e) {
      ok = false;
    }
    if (antes === texto) return { ok: ok, igual: true };
    try { window.dispatchEvent(new CustomEvent(EVENTO)); } catch (e) { /* navegador muy antiguo */ }
    return { ok: ok };
  }

  // Llama a fn cuando cambia el contenido: aquí (llega lo del servidor) o en otra pestaña (la caché)
  function alCambiar(fn) {
    window.addEventListener(EVENTO, function () { fn(); });
    window.addEventListener('storage', function (e) {
      if (e.key !== CLAVE && e.key !== null) return;
      memoria = null;
      fn();
    });
  }

  window.CONTENIDO_EJEMPLO = CONTENIDO_EJEMPLO;
  window.cargarContenido = cargarContenido;
  window.guardarContenido = guardarContenido;

  window.Contenido = {
    CLAVE: CLAVE,
    VERSION: VERSION,
    CATEGORIAS: CATEGORIAS,
    ETIQUETAS: ETIQUETAS,
    ESTADOS: ESTADOS,
    FIRMEZAS: FIRMEZAS,
    LIMITES: LIMITES,
    fotoPrincipal: fotoPrincipal,
    normalizarFotos: normalizarFotos,
    esRutaAlmacen: esRutaAlmacen,
    fotoDeProducto: fotoDeProducto,
    urlFoto: urlFoto,
    alCambiar: alCambiar,
    NOMBRES_DIA: NOMBRES_DIA,
    normalizar: normalizar,
    normalizarProducto: normalizarProducto,
    ENLACE_GOOGLE: ENLACE_GOOGLE,
    nuevoId: nuevoId,
    fotoValida: fotoValida,
    whatsappValido: whatsappValido,
    normalizarWhatsapp: normalizarWhatsapp,
    whatsappLegible: whatsappLegible,
    soloDigitos: soloDigitos,
    numero: numero,
    formatearPrecio: formatearPrecio,
    enlaceWhatsApp: enlaceWhatsApp,
    enlaceTelefono: enlaceTelefono,
    leerDias: leerDias,
    leerHoras: leerHoras,
    componerDias: componerDias,
    componerHoras: componerHoras,
    horarioPorDia: horarioPorDia,
    hhmm: hhmm
  };
})();
