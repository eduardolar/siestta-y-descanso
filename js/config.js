// Datos del proyecto de Supabase que usa la web. Son PÚBLICOS por diseño: la clave «publishable»
// solo deja hacer lo que permiten las reglas de la base de datos (leer productos no vendidos y
// ajustes). Para editar hace falta entrar en el panel con un usuario dado de alta en «editores».
// NUNCA pongas aquí la clave secreta (sb_secret_… o service_role). Ver supabase/LEEME.md.
window.SIESTTA_CONFIG = Object.freeze({
  url: 'https://elhpoyycvgcrsuttjfpp.supabase.co',
  clave: 'sb_publishable_Cf1DRtcbnKLyfZbjDjdWDg_w5V-ApDt',
  // Tiempo máximo de espera de cada petición (ms): si el servidor no contesta, la web sigue con lo que tiene
  espera: 8000
});
