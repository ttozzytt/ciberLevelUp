'use strict';

/* Módulo Panel: escucha eventos de catálogo y formulario sin acoplar sus archivos. */
(() => {
  const count = document.getElementById('lcgSelectedCount');
  const lastSelected = document.getElementById('lcgLastSelected');
  const lastRequest = document.getElementById('lcgLastRequest');

  window.addEventListener('lcg:selection-change', event => {
    const selected = event.detail?.selected || [];
    if (count) count.textContent = String(selected.length);
    if (lastSelected) lastSelected.textContent = event.detail?.last || 'Ninguna';
  });

  window.addEventListener('lcg:request-saved', event => {
    const detail = event.detail || {};
    if (lastRequest) lastRequest.textContent = detail.customer + ' · ' + detail.category;
  });
})();