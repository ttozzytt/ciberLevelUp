'use strict';

/* Módulo Cabecera: estado online/offline de esta PWA. */
(() => {
  const status = document.getElementById('lcgNetwork');
  if (!status) return;
  const paint = () => {
    const online = navigator.onLine;
    status.dataset.state = online ? 'online' : 'offline';
    status.textContent = online ? 'Conexión disponible' : 'Modo sin conexión';
  };
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  paint();
})();