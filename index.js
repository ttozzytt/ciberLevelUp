// El indicador comprueba si este sitio responde por Internet; no se basa solo en navigator.onLine.
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
