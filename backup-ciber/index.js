document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.imageFallbackApplied === 'true') {
    image.hidden = true;
    return;
  }
  image.dataset.imageFallbackApplied = 'true';
  image.src = './imagenes/imagen-respaldo.svg';
}, true);

    const entryStatus = document.getElementById('entryNetworkStatus');
    let entryNetworkTimer = null;
    let entryNetworkSequence = 0;
    async function updateEntryNetworkStatus() {
      const sequence = ++entryNetworkSequence;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(`./manifest.json?__levelup_health=${Date.now()}`, {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal
        });
        const manifest = response.ok ? await response.json() : null;
        if (sequence !== entryNetworkSequence) return;
        const online = Boolean(manifest && manifest.short_name === 'LevelUp');
        entryStatus.dataset.state = online ? 'online' : 'offline';
        entryStatus.querySelector('b').textContent = online ? 'Online' : 'Offline';
      } catch (_) {
        if (sequence !== entryNetworkSequence) return;
        entryStatus.dataset.state = 'offline';
        entryStatus.querySelector('b').textContent = 'Offline';
      } finally {
        window.clearTimeout(timeout);
        controller.abort();
      }
    }
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.error('Registro PWA:', error)), { once: true });
    }
    updateEntryNetworkStatus();
    window.addEventListener('online', updateEntryNetworkStatus);
    window.addEventListener('offline', updateEntryNetworkStatus);
    entryNetworkTimer = window.setInterval(updateEntryNetworkStatus, 25000);
    window.addEventListener('pagehide', () => {
      if (entryNetworkTimer !== null) window.clearInterval(entryNetworkTimer);
      entryNetworkTimer = null;
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted && entryNetworkTimer === null) {
        updateEntryNetworkStatus();
        entryNetworkTimer = window.setInterval(updateEntryNetworkStatus, 25000);
      }
    });

(function hydrateEntryTheme(){
  const button=document.getElementById('entryThemeToggle');
  const meta=document.getElementById('themeColorMeta');
  if(!button||button.dataset.hidratado==='true')return;
  const key='levelup-backup-ciber-theme-v1';
  function apply(theme){
    const light=theme==='light';
    document.documentElement.dataset.theme=light?'light':'dark';
    try{localStorage.setItem(key,light?'light':'dark')}catch(_){}
    if(meta)meta.content=light?'#f3f6fc':'#0b0c16';
    button.querySelector('.theme-toggle__icon').textContent=light?'☾':'☀';
    button.querySelector('.theme-toggle__label').textContent=light?'Modo oscuro':'Modo claro';
    button.setAttribute('aria-label',light?'Activar modo oscuro':'Activar modo claro');
    button.setAttribute('aria-pressed',String(light));
  }
  apply(document.documentElement.dataset.theme==='light'?'light':'dark');
  button.addEventListener('click',()=>apply(document.documentElement.dataset.theme==='light'?'dark':'light'));
  button.disabled=false;
  button.dataset.hidratado='true';
})();
