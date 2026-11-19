'use strict';

/* Layout global: simulación de una columna y registro offline de esta PWA. */
(() => {
  const grid = document.getElementById('lcgCatalogGrid');
  const button = document.getElementById('lcgSimulateView');
  const status = document.getElementById('lcgViewStatus');

  if (grid && button) {
    button.addEventListener('click', () => {
      const mobile = grid.classList.toggle('sim-movil');
      button.setAttribute('aria-pressed', String(mobile));
      button.textContent = mobile ? 'Restaurar vista adaptable' : 'Simular vista móvil';
      if (status) status.textContent = mobile ? 'Simulación móvil: 1 columna' : 'Vista responsive real';
    });
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch(error => console.error('[PWA Grupal] No se pudo registrar el Service Worker:', error));
    }, { once: true });
  }
})();