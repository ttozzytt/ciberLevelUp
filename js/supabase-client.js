/* Cliente público Supabase para LevelUp Cibercafé.
 * La publishable key está diseñada para el navegador.
 * La seguridad real depende de RLS y políticas de la base de datos.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://anrahvomosswfebewvdn.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_tHs7jgadyL7U0D52Wd-ltQ_aoj9gzzZ';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('Supabase JS no cargó. LevelUp usará sus catálogos JSON locales.');
    window.levelupSupabase = null;
    return;
  }

  try {
    window.levelupSupabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );
    console.info('Cliente Supabase de LevelUp inicializado.');
  } catch (error) {
    window.levelupSupabase = null;
    console.error('No se pudo inicializar el cliente Supabase de LevelUp:', error);
  }
})();
