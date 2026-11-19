
'use strict';

// Hidratación: enlazar los botones una sola vez al cargar el módulo.
(function bindCardSimulation() {
  if (document.documentElement.dataset.cardSimulationBound === 'true') return;

  // Estado: solo cambia la tarjeta donde se hizo clic.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest('.btn-simular')
      : null;
    if (!target) return;

    const tarjeta = target.closest('.card-item');
    if (!tarjeta) return;

    const estado = tarjeta.querySelector('.card-item__estado');
    if (!estado) return;

    const activo = tarjeta.classList.toggle('card-item--activo');
    estado.textContent = activo
      ? 'Estado: Seleccionado (Simulación)'
      : 'Estado: Disponible';
    target.setAttribute('aria-pressed', String(activo));
    target.textContent = activo ? 'Quitar simulación' : 'Simular Selección';
  });

  document.documentElement.dataset.cardSimulationBound = 'true';
})();
