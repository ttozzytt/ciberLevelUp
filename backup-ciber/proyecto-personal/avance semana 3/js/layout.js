'use strict';

/* Demostración solicitada en Parte 2: alterna una clase de simulación sin sustituir CSS responsive. */
(() => {
  const grid = document.getElementById('catalogoGrid');
  const button = document.getElementById('btnSimularVista');
  const status = document.getElementById('estadoVista');
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
        .catch(error => console.error('[PWA Personal] No se pudo registrar el Service Worker:', error));
    }, { once: true });
  }
})();