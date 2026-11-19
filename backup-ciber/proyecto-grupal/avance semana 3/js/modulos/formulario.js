'use strict';

/* Módulo Formulario: demostración local; no crea una reserva real en el negocio. */
(() => {
  const form = document.getElementById('lcgReservationForm');
  const feedback = document.getElementById('lcgFormFeedback');
  const key = 'levelup-backup-ciber-grupal-solicitudes-demo-v1';
  if (!form || !feedback) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const customer = String(data.get('customer') || '').trim();
    const category = String(data.get('category') || '').trim();
    if (customer.length < 2 || !category) {
      feedback.dataset.state = 'error';
      feedback.textContent = 'Escribe un nombre de al menos 2 caracteres y elige una categoría.';
      return;
    }

    const request = { customer, category, createdAt: new Date().toISOString(), mode: 'demostracion-local' };
    try {
      const previous = JSON.parse(localStorage.getItem(key) || '[]');
      const requests = Array.isArray(previous) ? previous : [];
      requests.push(request);
      localStorage.setItem(key, JSON.stringify(requests.slice(-10)));
    } catch (error) {
      console.warn('[PWA Grupal] No se pudo guardar en localStorage:', error);
    }

    feedback.dataset.state = 'success';
    feedback.textContent = 'Solicitud simulada guardada en este dispositivo. No se envió al local.';
    window.dispatchEvent(new CustomEvent('lcg:request-saved', { detail: { customer, category } }));
    form.reset();
  });
})();