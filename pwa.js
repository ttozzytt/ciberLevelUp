'use strict';

/* LevelUp: SPA ligera, hidratación controlada y delegación de eventos. */
const LEVELUP_VIEWS = ['inicio', 'computadoras', 'cuenta', 'servicios', 'contacto'];
const VIEW_LABELS = { inicio: 'Inicio', computadoras: 'Computadoras', cuenta: 'Mi cuenta', servicios: 'Servicios', contacto: 'Contacto' };
const STORAGE = {
  accounts: 'levelup_accounts_v1',
  activePhone: 'levelup_active_phone_v1',
  machines: 'levelup_machine_states_v2',
  pending: 'levelup_pending_actions_v1'
};
const state = {
  machines: [], accounts: [], activeUser: null, currentFilter: 'all',
  selectedMachine: null, booking: null, pendingMachineId: null,
  rechargeAmount: 20, rechargeMethod: 'QR',
  hydrationComplete: false, networkState: 'checking',
  networkCheckId: 0, networkTimer: null, sessionTimer: null,
  toastTimer: null, viewTransitionTimer: null, currentView: 'inicio',
  intersectionObserver: null
};
const $document = $(document);
const modalReturnFocus = new WeakMap();

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
function money(value) { return `Bs ${Number(value || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`; }
function pad(value) { return String(value).padStart(2, '0'); }
function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`;
}
function formatHold(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
function parseElapsed(value) {
  const parts = String(value || '0').split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number.isFinite(parts[0]) ? parts[0] : 0;
}
function getMachine(id) { return state.machines.find(machine => machine.id === Number(id)) || null; }
function isReserved(machine) { return Boolean(machine.reservationExpiresAt && machine.reservationExpiresAt > Date.now()); }
function isAvailable(machine) { return Boolean(machine.available && !isReserved(machine)); }

/* Avisos: un solo temporizador, limpiado antes de mostrar el siguiente mensaje. */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', type === 'error');
  toast.classList.add('show');
  state.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200);
}

/* Navegación por vistas: equivalente al patrón del proyecto Personal. */
function showView(name, updateHistory = true) {
  if (!LEVELUP_VIEWS.includes(name)) return;
  const target = document.getElementById(`view-${name}`);
  if (!target) return;
  const previousIndex = LEVELUP_VIEWS.indexOf(state.currentView);
  const nextIndex = LEVELUP_VIEWS.indexOf(name);
  const viewChanged = state.currentView !== name;
  if (viewChanged) {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active', 'from-left', 'from-right');
      view.setAttribute('aria-hidden', 'true');
    });
    target.classList.add('active');
    target.setAttribute('aria-hidden', 'false');
    window.clearTimeout(state.viewTransitionTimer);
    target.classList.add(nextIndex >= previousIndex ? 'from-right' : 'from-left');
    state.viewTransitionTimer = window.setTimeout(() => {
      target.classList.remove('from-left', 'from-right');
      state.viewTransitionTimer = null;
    }, 280);
  }
  document.querySelectorAll('[data-view-target]').forEach(item => {
    const active = item.dataset.viewTarget === name;
    item.classList.toggle('active', active);
    if (item.matches('button')) item.setAttribute('aria-current', active ? 'page' : 'false');
  });
  $('#pageName').text(VIEW_LABELS[name]);
  $('#mainContent').scrollTop(0);
  state.currentView = name;
  if (updateHistory && location.hash !== `#${name}`) {
    try { history.pushState({ levelupView: name }, '', `#${name}`); } catch (_) { location.hash = name; }
  }
  closeMobileMenu();
  if (name === 'computadoras') requestAnimationFrame(updateCarouselPosition);
  if (name === 'cuenta') renderAccount();
}
function closeMobileMenu() {
  $('#mobileMenu').removeClass('open');
  $('#mobileMenuToggle').attr({ 'aria-expanded': 'false', 'aria-label': 'Abrir menú' }).text('☰');
}

/* Catálogo asíncrono propio de LevelUp. */
async function loadMachineCatalog() {
  const response = await fetch('./data/computadoras.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`La solicitud del catálogo respondió HTTP ${response.status}.`);
  const catalog = await response.json();
  if (!Array.isArray(catalog) || catalog.length < 15) throw new Error('El catálogo debe contener al menos 15 estaciones.');
  const usedIds = new Set();
  state.machines = catalog.map(item => {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id < 1 || usedIds.has(id)) throw new Error('Hay identificadores de estación inválidos o repetidos.');
    if (!['standard', 'pro', 'vip'].includes(item.type)) throw new Error(`La categoría de la estación ${id} no es válida.`);
    if (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0) throw new Error(`El precio de la estación ${id} no es válido.`);
    if (!item.cpu || !item.gpu || !item.ram || !item.storage || !item.monitor) throw new Error(`Faltan especificaciones en la estación ${id}.`);
    usedIds.add(id);
    return {
      ...item,
      id,
      price: Number(item.price),
      available: Boolean(item.available),
      elapsed: String(item.elapsed || ''),
      image: String(item.image || './imagenes/pc-gamer.webp'),
      imageAlt: String(item.imageAlt || `Gabinete gamer representativo de la estación ${id}`),
      sessionStartedAt: null,
      sessionEndsAt: null,
      reservationExpiresAt: null
    };
  });
  restoreMachineStates();
}
function restoreMachineStates() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE.machines) || '[]');
    if (Array.isArray(stored)) stored.forEach(saved => {
      const machine = getMachine(saved.id);
      if (!machine) return;
      ['available', 'sessionStartedAt', 'sessionEndsAt', 'reservationExpiresAt'].forEach(key => {
        if (saved[key] !== undefined) machine[key] = saved[key];
      });
    });
  } catch (error) { console.warn('No se pudieron recuperar los estados guardados de los equipos.', error); }
  state.machines.forEach(machine => {
    if (!machine.available && !machine.reservationExpiresAt && !machine.sessionEndsAt && !machine.sessionStartedAt) {
      machine.sessionStartedAt = Date.now() - parseElapsed(machine.elapsed) * 1000;
    }
    if (machine.reservationExpiresAt && machine.reservationExpiresAt <= Date.now()) {
      machine.available = true;
      machine.reservationExpiresAt = null;
      machine.sessionStartedAt = null;
    }
  });
  saveMachineStates();
}
function saveMachineStates() {
  try {
    const snapshot = state.machines.map(machine => ({
      id: machine.id,
      available: machine.available,
      sessionStartedAt: machine.sessionStartedAt || null,
      sessionEndsAt: machine.sessionEndsAt || null,
      reservationExpiresAt: machine.reservationExpiresAt || null
    }));
    localStorage.setItem(STORAGE.machines, JSON.stringify(snapshot));
  } catch (error) { showToast('No se pudieron guardar los estados en este navegador.', 'error'); }
}

/* Filtros de tres capas: categoría -> procesador -> gráfica. */
function fillSelect(select, placeholder, values, disabled = false) {
  const element = document.getElementById(select);
  if (!element) return;
  element.replaceChildren(new Option(placeholder, ''));
  values.forEach(value => element.add(new Option(value, value)));
  element.disabled = disabled;
}
function updateCpuOptions() {
  const category = $('#filterCategory').val();
  const cpus = [...new Set(state.machines.filter(machine => !category || machine.type === category).map(machine => machine.cpu))].sort();
  fillSelect('filterCPU', category ? 'Todos los procesadores' : 'Primero elige categoría', cpus, !category);
  fillSelect('filterGPU', 'Primero elige procesador', [], true);
  applyMachineFilters(true);
}
function updateGpuOptions() {
  const category = $('#filterCategory').val();
  const cpu = $('#filterCPU').val();
  const gpus = [...new Set(state.machines.filter(machine => (!category || machine.type === category) && (!cpu || machine.cpu === cpu)).map(machine => machine.gpu))].sort();
  fillSelect('filterGPU', cpu ? 'Todas las gráficas' : 'Primero elige procesador', gpus, !cpu);
  applyMachineFilters(true);
}
function getFilteredMachines() {
  const query = ($('#searchPC').val() || '').trim().toLocaleLowerCase('es');
  const category = $('#filterCategory').val();
  const cpu = $('#filterCPU').val();
  const gpu = $('#filterGPU').val();
  return state.machines.filter(machine => {
    const reserved = isReserved(machine);
    const available = isAvailable(machine);
    const matchesQuick = state.currentFilter === 'all'
      || (state.currentFilter === 'available' && available)
      || (state.currentFilter === 'occupied' && !available)
      || machine.type === state.currentFilter;
    const matchesCategory = !category || machine.type === category;
    const matchesCpu = !cpu || machine.cpu === cpu;
    const matchesGpu = !gpu || machine.gpu === gpu;
    const searchText = `pc ${pad(machine.id)} ${machine.label} ${machine.cpu} ${machine.gpu} ${machine.ram} ${machine.storage} ${machine.monitor}`.toLocaleLowerCase('es');
    return matchesQuick && matchesCategory && matchesCpu && matchesGpu && (!query || searchText.includes(query));
  });
}
function cardStatus(machine) {
  if (isReserved(machine)) return { label: 'Reservada', className: 'reserved' };
  if (isAvailable(machine)) return { label: 'Disponible', className: 'available' };
  return { label: 'Ocupada', className: 'occupied' };
}
function renderMachines() {
  const grid = document.getElementById('pcGrid');
  if (!grid) return;
  const filtered = getFilteredMachines();
  $('#resultCount').text(filtered.length);
  $('#emptyState').prop('hidden', filtered.length !== 0);
  $('#pcCarousel').toggle(filtered.length !== 0);
  $('#catalogStatus').text(`${filtered.length} ${filtered.length === 1 ? 'equipo encontrado' : 'equipos encontrados'}`);
  grid.innerHTML = filtered.map(machine => {
    const status = cardStatus(machine);
    const number = pad(machine.id);
    const usage = isReserved(machine)
      ? `<div class="pc-usage">Apartada · <strong data-hold-timer="${machine.id}">${formatHold(machine.reservationExpiresAt - Date.now())}</strong></div>`
      : machine.sessionEndsAt
        ? `<div class="pc-usage">Tiempo restante · <strong data-session-timer="${machine.id}">${formatClock(machine.sessionEndsAt - Date.now())}</strong></div>`
        : `<div class="pc-usage">En uso · <strong data-elapsed-timer="${machine.id}">${formatClock((Date.now() - (machine.sessionStartedAt || Date.now())) * 1)}</strong></div>`;
    const action = status.className === 'available'
      ? `<button class="select-pc-btn" type="button" data-select-machine="${machine.id}" data-hidratado="true">Elegir esta PC →</button>`
      : usage;
    return `<article class="pc-card ${status.className}" data-machine-card="${machine.id}" data-type="${machine.type}">
      <div class="pc-card-top"><span class="pc-name">ESTACIÓN #${number}</span><span class="pc-status ${status.className}">${status.label}</span></div>
      <button class="pc-photo" type="button" data-photo-open data-photo="${escapeHTML(machine.image)}" data-caption="Estación #${number} · ${escapeHTML(machine.label)} · Imagen representativa del gabinete gamer" aria-label="Ampliar imagen de la estación ${number}" data-hidratado="true"><img src="${escapeHTML(machine.image)}" alt="${escapeHTML(machine.imageAlt)}" width="225" height="225" loading="lazy" decoding="async"></button>
      <div class="pc-card-body"><div class="pc-card-title"><strong>${escapeHTML(machine.label)}</strong><span class="pc-price">${money(machine.price)} <small>/h</small></span></div>
        <div class="pc-specs"><span>${escapeHTML(machine.cpu)}</span><span>${escapeHTML(machine.gpu)}</span><span>${escapeHTML(machine.ram)}</span><span>${escapeHTML(machine.storage)}</span><span>${escapeHTML(machine.monitor)}</span></div>
        <div class="pc-card-foot">${action}</div>
      </div>
    </article>`;
  }).join('');
  requestAnimationFrame(updateCarouselPosition);
  updateStats();
}
function applyMachineFilters(resetScroll = false) {
  renderMachines();
  if (resetScroll) document.getElementById('pcCarousel')?.scrollTo({ left: 0, behavior: 'smooth' });
}
function updateStats() {
  const available = state.machines.filter(isAvailable).length;
  const busy = state.machines.length - available;
  $('#totalCount').text(state.machines.length || 15);
  $('#freeCount').text(available);
  $('#busyCount').text(busy);
  renderOccupancyChart();
}
function renderOccupancyChart() {
  const chart = document.getElementById('occupancyChart');
  if (!chart || !state.machines.length) return;
  const categories = [
    { id: 'standard', label: 'Estándar' },
    { id: 'pro', label: 'Pro' },
    { id: 'vip', label: 'VIP' }
  ];
  const rows = categories.map(category => {
    const machines = state.machines.filter(machine => machine.type === category.id);
    const occupied = machines.filter(machine => !isAvailable(machine)).length;
    const free = machines.length - occupied;
    const ratio = machines.length ? Math.round(occupied / machines.length * 100) : 0;
    return `<div class="occupancy-row">
      <div class="occupancy-row-head"><strong>${category.label}</strong><span>${occupied} de ${machines.length} en uso · ${free} libres</span></div>
      <div class="occupancy-meter" role="img" aria-label="${category.label}: ${ratio}% de ocupación"><span style="width:${ratio}%"></span></div>
    </div>`;
  }).join('');
  chart.innerHTML = rows;
  $('#occupancySummary').text(`${state.machines.length} equipos · ${state.machines.filter(isAvailable).length} libres`);
}
function updateCarouselPosition() {
  const carousel = document.getElementById('pcCarousel');
  const cards = [...document.querySelectorAll('#pcGrid .pc-card')];
  if (!carousel || !cards.length) {
    $('#pcCarouselPosition').text('0 de 0');
    $('#pcScrollPrev, #pcScrollNext').prop('disabled', true);
    $('#carouselProgress').css('width', '0%');
    return;
  }
  const maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
  const current = carousel.scrollLeft;
  const firstVisible = cards.findIndex(card => card.offsetLeft + card.offsetWidth > current + 3);
  const visible = cards.filter(card => card.offsetLeft < current + carousel.clientWidth - 3).length;
  const first = Math.max(0, firstVisible) + 1;
  const last = Math.min(cards.length, first + Math.max(0, visible - 1));
  $('#pcCarouselPosition').text(`${first}–${last} de ${cards.length}`);
  $('#pcScrollPrev').prop('disabled', current <= 3);
  $('#pcScrollNext').prop('disabled', current >= maxScroll - 3);
  $('#carouselProgress').css('width', `${maxScroll ? current / maxScroll * 100 : 100}%`);
}
async function initializeCatalog() {
  $('#catalogError').prop('hidden', true);
  $('#catalogStatus').text('Cargando catálogo…');
  $('#pcGrid').html('<div class="catalog-state"><strong>Preparando las estaciones…</strong>Estamos leyendo el archivo de datos.</div>');
  try {
    await loadMachineCatalog();
    fillSelect('filterCategory', 'Todas las categorías', [
      ['standard', 'Estándar'], ['pro', 'Pro'], ['vip', 'VIP']
    ].map(item => item[0]), false);
    const categorySelect = document.getElementById('filterCategory');
    [...categorySelect.options].forEach(option => {
      if (option.value === 'standard') option.textContent = 'Estándar';
      if (option.value === 'pro') option.textContent = 'Pro';
      if (option.value === 'vip') option.textContent = 'VIP';
    });
    fillSelect('filterCPU', 'Primero elige categoría', [], true);
    fillSelect('filterGPU', 'Primero elige procesador', [], true);
    renderMachines();
    startSessionTicker();
  } catch (error) {
    console.error('Error al cargar el catálogo de LevelUp:', error);
    $('#pcGrid').empty();
    $('#catalogStatus').text('No se pudo cargar el catálogo');
    $('#catalogErrorText').text(error.message);
    $('#catalogError').prop('hidden', false);
  }
}

/* Cuentas y actividad local. Se conservan las claves usadas por el prototipo anterior. */
function loadAccounts() {
  try {
    const accounts = JSON.parse(localStorage.getItem(STORAGE.accounts) || '[]');
    state.accounts = Array.isArray(accounts) ? accounts : [];
    const phone = localStorage.getItem(STORAGE.activePhone);
    state.activeUser = state.accounts.find(account => account.phone === phone) || null;
  } catch (error) {
    state.accounts = [];
    state.activeUser = null;
  }
}
function saveAccounts() {
  try {
    localStorage.setItem(STORAGE.accounts, JSON.stringify(state.accounts));
    if (state.activeUser) localStorage.setItem(STORAGE.activePhone, state.activeUser.phone);
    else localStorage.removeItem(STORAGE.activePhone);
  } catch (error) { showToast('El navegador no permitió guardar la cuenta.', 'error'); }
}
function saveActiveUser() {
  if (!state.activeUser) return;
  const index = state.accounts.findIndex(account => account.phone === state.activeUser.phone);
  if (index >= 0) state.accounts[index] = state.activeUser;
  else state.accounts.push(state.activeUser);
  saveAccounts();
  renderAccount();
}
function renderAccount() {
  renderPendingActions();
  const loggedIn = Boolean(state.activeUser);
  $('#accountAccessPanel').prop('hidden', loggedIn);
  $('#accountDashboard').prop('hidden', !loggedIn);
  if (!loggedIn) return;
  const user = state.activeUser;
  $('#accountDisplayName').text(user.name);
  $('#accountDisplayPhone').text(`Celular · ${user.phone}`);
  $('#accountDisplayBalance').text(money(user.balance));
  const history = Array.isArray(user.history) ? [...user.history].reverse().slice(0, 8) : [];
  $('#accountHistory').html(history.length ? history.map(entry => {
    const date = entry.date ? new Date(entry.date).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }) : 'Fecha no disponible';
    const amount = Number(entry.amount || 0);
    const details = entry.machine ? `Estación #${pad(entry.machine)} · ${entry.hours || 1} h` : (entry.method || 'Movimiento local');
    return `<div class="history-item"><div><strong>${escapeHTML(entry.type || 'Movimiento')}</strong><small>${escapeHTML(details)} · ${escapeHTML(date)}</small></div><span class="history-amount ${amount >= 0 ? 'positive' : 'negative'}">${amount >= 0 ? '+' : '−'}${money(Math.abs(amount))}</span></div>`;
  }).join('') : '<div class="history-empty">Todavía no tienes movimientos. Cuando recargues o completes una sesión aparecerán aquí.</div>');
}
function switchAccountTab(tab) {
  const register = tab === 'register';
  $('#registerForm').prop('hidden', !register);
  $('#loginForm').prop('hidden', register);
  $('#showRegister').toggleClass('active', register).attr('aria-pressed', String(register));
  $('#showLogin').toggleClass('active', !register).attr('aria-pressed', String(!register));
}
function normalizePhone(input) { input.value = input.value.replace(/\D/g, '').slice(0, 8); }
function setFieldError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const wrapper = field?.closest('.form-field');
  if (wrapper) wrapper.classList.toggle('invalid', Boolean(message));
  if (field) {
    field.setAttribute('aria-invalid', String(Boolean(message)));
    field.setAttribute('aria-describedby', errorId);
  }
  $(`#${errorId}`).text(message || '');
  return !message;
}
function validateAccountName() {
  const value = $('#accountName').val().trim();
  return setFieldError('accountName', 'accountNameError', !value ? 'Escribe tu nombre.' : value.length < 3 ? 'Debe tener al menos 3 caracteres.' : '');
}
function validateAccountPhone() {
  const value = $('#accountPhone').val();
  return setFieldError('accountPhone', 'accountPhoneError', /^\d{8}$/.test(value) ? '' : 'Ingresa los 8 dígitos del celular.');
}
function validateLoginPhone() {
  const value = $('#loginPhone').val();
  return setFieldError('loginPhone', 'loginPhoneError', /^\d{8}$/.test(value) ? '' : 'Ingresa los 8 dígitos del celular.');
}
function validateBookingName() {
  const value = $('#customerName').val().trim();
  return setFieldError('customerName', 'customerNameError', !value ? 'Escribe tu nombre.' : value.length < 3 ? 'Debe tener al menos 3 caracteres.' : '');
}
function validateBookingPhone() {
  const value = $('#customerPhone').val();
  return setFieldError('customerPhone', 'customerPhoneError', /^\d{8}$/.test(value) ? '' : 'Ingresa un celular de 8 dígitos.');
}
function validateContactName() {
  const name = $('#contactName').val().trim();
  return setFieldError('contactName', 'contactNameError', name.length >= 3 ? '' : 'Escribe al menos 3 caracteres.');
}
function validateContactPhone() {
  const phone = $('#contactPhone').val();
  return setFieldError('contactPhone', 'contactPhoneError', /^\d{8}$/.test(phone) ? '' : 'Ingresa un celular de 8 dígitos.');
}
function validateContactMessage() {
  const message = $('#contactMessage').val().trim();
  return setFieldError('contactMessage', 'contactMessageError', message.length >= 8 ? '' : 'Escribe una consulta de al menos 8 caracteres.');
}
function validateContactForm() {
  const validName = validateContactName();
  const validPhone = validateContactPhone();
  const validMessage = validateContactMessage();
  return validName && validPhone && validMessage;
}

/* Almacenamiento local de solicitudes pendientes. Sin API de servidor no se afirma que hayan sido enviadas. */
function readPendingActions() {
  try {
    const queue = JSON.parse(localStorage.getItem(STORAGE.pending) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch (_) { return []; }
}
function renderPendingActions() {
  const queue = readPendingActions();
  const panel = document.getElementById('pendingSyncNotice');
  if (!panel) return;
  panel.hidden = queue.length === 0;
  $('#pendingSyncCount').text(`${queue.length} ${queue.length === 1 ? 'acción guardada' : 'acciones guardadas'}`);
  $('#pendingSyncText').text('Guardadas únicamente en este navegador y pendientes de un servidor. GitHub Pages no recibe ni sincroniza estos registros automáticamente.');
}
function queueLocalAction(type, payload) {
  try {
    const queue = readPendingActions();
    queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, payload, createdAt: new Date().toISOString(), status: 'pendiente de servidor' });
    localStorage.setItem(STORAGE.pending, JSON.stringify(queue.slice(-100)));
    renderPendingActions();
  } catch (error) { console.warn('No se pudo guardar la acción pendiente localmente.', error); }
}

/* Capas modales accesibles y visor de imágenes. */
function openModal(selector) {
  const layer = document.querySelector(selector);
  if (!layer) return;
  modalReturnFocus.set(layer, document.activeElement);
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => layer.querySelector('input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus(), 50);
}
function closeModal(selector) {
  const layer = document.querySelector(selector);
  if (!layer) return;
  layer.classList.remove('open');
  layer.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-backdrop.open, .photo-viewer.open')) document.body.style.overflow = '';
  const returnFocus = modalReturnFocus.get(layer);
  modalReturnFocus.delete(layer);
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
}
function openPhotoViewer(button) {
  const photo = button.dataset.photo;
  if (!photo) return;
  $('#photoViewerImage').attr({ src: photo, alt: button.querySelector('img')?.alt || 'Imagen de LevelUp' });
  $('#photoViewerCaption').text(button.dataset.caption || 'LevelUp Cibercafé');
  openModal('#photoViewer');
}
function closePhotoViewer() {
  closeModal('#photoViewer');
  $('#photoViewerImage').attr('src', '');
}

/* Reserva temporal y temporizadores. */
function showBookingStep(step) {
  $('#bookingStep').prop('hidden', step !== 'booking');
  $('#paymentStep').prop('hidden', step !== 'payment');
  $('#successStep').prop('hidden', step !== 'success');
}
function updateBookingCountdown() {
  if (!state.selectedMachine?.reservationExpiresAt) return;
  const remaining = state.selectedMachine.reservationExpiresAt - Date.now();
  if (remaining <= 0) { expireReservation(); return; }
  $('#bookingCountdown').text(formatHold(remaining));
  $('#bookingHoldNotice').toggleClass('expiring', remaining <= 15000);
}
function releaseReservation(showMessage = false) {
  const machine = state.selectedMachine;
  if (!machine?.reservationExpiresAt) return;
  const id = machine.id;
  machine.reservationExpiresAt = null;
  machine.available = true;
  machine.sessionStartedAt = null;
  machine.sessionEndsAt = null;
  state.selectedMachine = null;
  state.booking = null;
  saveMachineStates();
  renderMachines();
  if (showMessage) showToast(`Reserva cancelada. La estación #${pad(id)} vuelve a estar disponible.`);
}
function expireReservation() {
  if (!state.selectedMachine?.reservationExpiresAt) return;
  const id = state.selectedMachine.id;
  releaseReservation(false);
  closeModal('#bookingModal');
  closeModal('#rechargeModal');
  showToast(`Se agotó el minuto de reserva. La estación #${pad(id)} quedó libre.`, 'error');
}
function openBooking(machineId) {
  const machine = getMachine(machineId);
  if (!machine || !isAvailable(machine)) {
    showToast('Esta estación ya no está disponible. Actualizamos el catálogo.', 'error');
    renderMachines();
    return;
  }
  if (!state.activeUser) {
    state.pendingMachineId = machine.id;
    showView('cuenta');
    showToast('Registra tu cuenta o inicia sesión para continuar con la reserva.');
    return;
  }
  state.selectedMachine = machine;
  state.booking = null;
  machine.available = false;
  machine.reservationExpiresAt = Date.now() + 60000;
  machine.sessionStartedAt = null;
  machine.sessionEndsAt = null;
  $('#selectedMachineName').text(`ESTACIÓN #${pad(machine.id)} · ${machine.label}`);
  $('#selectedMachineSpecs').text(`${machine.cpu} · ${machine.gpu} · ${machine.ram}`);
  $('#selectedMachineRate').text(`${money(machine.price)}/h`);
  $('#customerName').val(state.activeUser.name);
  $('#customerPhone').val(state.activeUser.phone);
  $('#sessionHours').val('1');
  setFieldError('customerName', 'customerNameError', '');
  setFieldError('customerPhone', 'customerPhoneError', '');
  updateBookingTotal();
  showBookingStep('booking');
  updateBookingCountdown();
  saveMachineStates();
  renderMachines();
  showView('computadoras');
  openModal('#bookingModal');
}
function updateBookingTotal() {
  const hours = Number($('#sessionHours').val() || 1);
  const amount = state.selectedMachine ? state.selectedMachine.price * hours : 0;
  $('#bookingTotal').text(money(amount));
  return amount;
}
function updatePaymentState() {
  if (!state.booking || !state.activeUser) return;
  const balance = Number(state.activeUser.balance || 0);
  const difference = Math.max(0, state.booking.total - balance);
  $('#currentBalance').text(money(balance));
  $('#balanceWarning').prop('hidden', difference === 0).text(difference ? `Te faltan ${money(difference)}. Recarga tu saldo para continuar.` : '');
  $('#confirmPayment').prop('disabled', difference > 0);
  $('#rechargeFromPayment').prop('hidden', difference === 0);
}
function startPaymentStep() {
  if (!state.selectedMachine || !state.selectedMachine.reservationExpiresAt || state.selectedMachine.reservationExpiresAt <= Date.now()) {
    expireReservation();
    return;
  }
  const nameValid = validateBookingName();
  const phoneValid = validateBookingPhone();
  if (!nameValid || !phoneValid) {
    document.querySelector(!nameValid ? '#customerName' : '#customerPhone').focus();
    return;
  }
  const hours = Number($('#sessionHours').val());
  state.booking = { name: $('#customerName').val().trim(), phone: $('#customerPhone').val(), hours, total: updateBookingTotal() };
  $('#paymentMachine').text(`Estación #${pad(state.selectedMachine.id)} · ${state.selectedMachine.label}`);
  $('#paymentSummary').text(`${hours} ${hours === 1 ? 'hora' : 'horas'} · la sesión comienza al confirmar`);
  $('#paymentTotal').text(money(state.booking.total));
  showBookingStep('payment');
  updatePaymentState();
}
function confirmSessionPayment() {
  const machine = state.selectedMachine;
  const user = state.activeUser;
  if (!machine || !user || !state.booking || !machine.reservationExpiresAt || machine.reservationExpiresAt <= Date.now()) {
    expireReservation();
    return;
  }
  if (Number(user.balance) < state.booking.total) { updatePaymentState(); return; }
  user.balance = Number(user.balance) - state.booking.total;
  user.history = Array.isArray(user.history) ? user.history : [];
  const session = { type: 'Sesión', machine: machine.id, hours: state.booking.hours, amount: -state.booking.total, date: new Date().toISOString() };
  user.history.push(session);
  saveActiveUser();
  machine.available = false;
  machine.reservationExpiresAt = null;
  machine.sessionStartedAt = Date.now();
  machine.sessionEndsAt = Date.now() + state.booking.hours * 3600000;
  if (state.networkState !== 'online') queueLocalAction('sesion-local', session);
  saveMachineStates();
  renderMachines();
  const message = `${state.booking.name}, se asignó la estación #${pad(machine.id)} durante ${state.booking.hours} ${state.booking.hours === 1 ? 'hora' : 'horas'}. Se descontaron ${money(state.booking.total)}. Saldo restante: ${money(user.balance)}.`;
  $('#successText').text(message);
  $('#syncNote').text(state.networkState === 'online'
    ? 'El pago es simulado y quedó guardado localmente en este navegador.'
    : 'Sin Internet: la operación quedó guardada en este dispositivo y pendiente de un servidor de sincronización.');
  showBookingStep('success');
  updateBookingCountdown();
}
function closeBooking(release = true) {
  if (release) releaseReservation(false);
  closeModal('#bookingModal');
  state.selectedMachine = null;
  state.booking = null;
}

/* Recargas: simulación local, sin procesar dinero real. */
function openRecharge() {
  if (!state.activeUser) {
    showView('cuenta');
    showToast('Primero crea tu cuenta o inicia sesión.');
    return;
  }
  $('#rechargeAmountLabel').text(money(state.rechargeAmount));
  openModal('#rechargeModal');
}
function confirmRecharge() {
  if (!state.activeUser) return;
  const amount = Number(state.rechargeAmount);
  state.activeUser.balance = Number(state.activeUser.balance || 0) + amount;
  state.activeUser.history = Array.isArray(state.activeUser.history) ? state.activeUser.history : [];
  const recharge = { type: 'Recarga simulada', amount, method: state.rechargeMethod, date: new Date().toISOString() };
  state.activeUser.history.push(recharge);
  saveActiveUser();
  if (state.networkState !== 'online') queueLocalAction('recarga-local', recharge);
  closeModal('#rechargeModal');
  updatePaymentState();
  showToast(`${money(amount)} añadidos al saldo de demostración.`);
}

/* Temporizador único: se actualizan los textos, no se adjuntan listeners a cada tarjeta. */
function tickSessions() {
  const now = Date.now();
  let changed = false;
  const expiredReservations = [];
  const finishedSessions = [];
  state.machines.forEach(machine => {
    if (machine.reservationExpiresAt) {
      const remaining = machine.reservationExpiresAt - now;
      if (remaining <= 0) {
        machine.reservationExpiresAt = null;
        machine.available = true;
        machine.sessionStartedAt = null;
        expiredReservations.push(machine.id);
        changed = true;
      } else {
        $(`[data-hold-timer="${machine.id}"]`).text(formatHold(remaining));
        if (state.selectedMachine?.id === machine.id) updateBookingCountdown();
      }
    }
    if (machine.sessionEndsAt) {
      const remaining = machine.sessionEndsAt - now;
      if (remaining <= 0) {
        machine.available = true;
        machine.sessionEndsAt = null;
        machine.sessionStartedAt = null;
        finishedSessions.push(machine.id);
        changed = true;
      } else $(`[data-session-timer="${machine.id}"]`).text(formatClock(remaining));
    } else if (!machine.available && !machine.reservationExpiresAt && machine.sessionStartedAt) {
      const elapsed = now - machine.sessionStartedAt;
      $(`[data-elapsed-timer="${machine.id}"]`).text(formatClock(elapsed));
    }
  });
  if (expiredReservations.length) {
    expiredReservations.forEach(id => {
      if (state.selectedMachine?.id === id) {
        state.selectedMachine = null;
        state.booking = null;
        closeModal('#bookingModal');
        showToast(`La reserva de la estación #${pad(id)} venció y fue liberada.`, 'error');
      } else showToast(`La reserva temporal de la estación #${pad(id)} venció.`);
    });
  }
  if (changed) { saveMachineStates(); renderMachines(); }
  finishedSessions.forEach(id => showToast(`Terminó la sesión de la estación #${pad(id)}. Ya está disponible.`));
}
function startSessionTicker() {
  if (state.sessionTimer !== null) window.clearInterval(state.sessionTimer);
  tickSessions();
  state.sessionTimer = window.setInterval(tickSessions, 1000);
}

/* Visor de imágenes. */
function handlePhotoOpen(target) { openPhotoViewer(target); }

/* Conectividad real del propio sitio. El SW excluye la petición de health-check de la caché. */
function paintNetwork(status) {
  state.networkState = status;
  const label = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Comprobando…';
  const badge = document.getElementById('networkStatus');
  if (badge) {
    badge.dataset.state = status;
    $('#networkStatusText').text(label);
    badge.querySelector('.status-dot')?.classList.toggle('online', status === 'online');
    badge.querySelector('.status-dot')?.classList.toggle('offline', status === 'offline');
  }
  $('#sidebarStatusText').text(label);
  $('#sidebarStatusDot').toggleClass('online', status === 'online').toggleClass('offline', status === 'offline');
  renderPendingActions();
}
async function hasRealInternet() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const url = `./manifest.json?__levelup_health=${Date.now()}`;
    const response = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) return false;
    const manifest = await response.json();
    return Boolean(manifest && manifest.short_name === 'LevelUp');
  } catch (_) {
    return false;
  } finally {
    window.clearTimeout(timeout);
    controller.abort();
  }
}
async function refreshNetworkStatus(initial = false) {
  const sequence = ++state.networkCheckId;
  if (initial) paintNetwork('checking');
  const connected = await hasRealInternet();
  if (sequence !== state.networkCheckId) return;
  paintNetwork(connected ? 'online' : 'offline');
}

/* Instalación PWA. En navegadores sin beforeinstallprompt se explican los pasos. */
let deferredInstallPrompt = null;
function setupPWA() {
  const installButton = document.getElementById('installAppButton');
  if (installButton) installButton.hidden = false;
  if ('serviceWorker' in navigator) {
    const registerWorker = () => navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
      registration.update().catch(() => {});
      console.info('Service Worker LevelUp registrado:', registration.scope);
    }).catch(error => console.error('No se pudo registrar el Service Worker:', error));
    if (document.readyState === 'complete') registerWorker();
    else window.addEventListener('load', registerWorker, { once: true });
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) installButton.textContent = '＋ Instalar app';
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installButton) installButton.textContent = '✓ Instalada';
    showToast('LevelUp quedó instalada en este dispositivo.');
  });
}
async function requestInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice?.outcome === 'accepted') showToast('Se aceptó la instalación de LevelUp.');
    else showToast('La instalación no se completó. Puedes intentarlo desde el menú del navegador.');
    return;
  }
  showToast('Para instalar: abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio». En iPhone: Compartir → Añadir a pantalla de inicio.');
}

/* Contacto: valida y prepara un WhatsApp real; no simula envío a una API. */
function sendContactMessage() {
  if (!validateContactForm()) {
    $('#contactStatus').text('Revisa los campos marcados.').attr('class', 'form-status error');
    document.querySelector('#contactForm .form-field.invalid input, #contactForm .form-field.invalid textarea')?.focus();
    return;
  }
  const name = $('#contactName').val().trim();
  const phone = $('#contactPhone').val();
  const message = $('#contactMessage').val().trim();
  const text = `Hola, soy ${name}. Mi celular es ${phone}. Consulta para LevelUp: ${message}`;
  const url = `https://wa.me/59164133234?text=${encodeURIComponent(text)}`;
  if (state.networkState === 'offline') {
    queueLocalAction('consulta-contacto', { name, phone, message });
    $('#contactStatus').text('Sin conexión. La consulta quedó guardada en este navegador; abre WhatsApp cuando recuperes Internet.').attr('class', 'form-status error');
    showToast('Consulta guardada localmente. No se envió todavía.');
    return;
  }
  $('#contactStatus').text('Abriendo WhatsApp con tu consulta. Confirma el envío desde esa aplicación.').attr('class', 'form-status success');
  window.location.assign(url);
}

/* Hidratar: los controles nacen inactivos; se conectan los listeners y recién se habilitan. */
function markHydrated() {
  const pending = document.querySelectorAll('[data-hidratado="false"]');
  pending.forEach(element => {
    element.disabled = false;
    element.dataset.hidratado = 'true';
  });
  document.getElementById('appShell')?.setAttribute('data-hidratado', 'true');
  const remaining = document.querySelectorAll('button[data-hidratado="false"]');
  if (remaining.length) console.error('Quedaron controles sin hidratar:', [...remaining].map(item => item.id || item.textContent.trim()));
  else console.info(`Hidratación LevelUp completada: ${document.querySelectorAll('[data-hidratado="true"]').length} controles activados.`);
}
function bindLevelUpEvents() {
  /* Limpieza previa: evita duplicar escuchadores si se ejecuta una segunda hidratación. */
  $document.off('.levelupNavigation .levelupCatalog .levelupFilters .levelupAccount .levelupBooking .levelupModal .levelupViewer .levelupContact .levelupInstall .levelupAccordion .levelupValidation');
  $(window).off('.levelupRuntime .levelupCarousel');

  $document.on('click.levelupNavigation', '[data-view-target]', function (event) {
    event.preventDefault();
    const requestedView = this.dataset.viewTarget;
    const requestedFilter = this.dataset.statFilter;
    if (requestedFilter) setQuickFilter(requestedFilter);
    showView(requestedView);
    if (this.dataset.closeMobile === 'true') closeMobileMenu();
  });
  $document.on('click.levelupNavigation', '#mobileMenuToggle', function () {
    const isOpen = $('#mobileMenu').toggleClass('open').hasClass('open');
    $(this).attr({ 'aria-expanded': String(isOpen), 'aria-label': isOpen ? 'Cerrar menú' : 'Abrir menú' }).text(isOpen ? '×' : '☰');
  });
  $document.on('click.levelupNavigation', '#brandHome', function (event) { event.preventDefault(); showView('inicio'); });

  /* Filtros y navegación del carrusel. */
  $document.on('click.levelupFilters', '[data-filter]', function () {
    setQuickFilter(this.dataset.filter);
  });
  $document.on('input.levelupFilters', '#searchPC', () => applyMachineFilters(true));
  $document.on('change.levelupFilters', '#filterCategory', updateCpuOptions);
  $document.on('change.levelupFilters', '#filterCPU', updateGpuOptions);
  $document.on('change.levelupFilters', '#filterGPU', () => applyMachineFilters(true));
  $document.on('click.levelupCatalog', '#pcScrollPrev', () => scrollCarousel(-1));
  $document.on('click.levelupCatalog', '#pcScrollNext', () => scrollCarousel(1));
  $document.on('click.levelupCatalog', '[data-select-machine]', function () { openBooking(Number(this.dataset.selectMachine)); });
  $document.on('click.levelupCatalog', '#retryCatalogButton', initializeCatalog);
  const carousel = document.getElementById('pcCarousel');
  if (carousel) $(carousel).off('scroll.levelupCarousel').on('scroll.levelupCarousel', updateCarouselPosition);
  $(window).off('resize.levelupCarousel').on('resize.levelupCarousel', updateCarouselPosition);

  /* Cuenta, formularios y validación progresiva input/blur. */
  $document.on('click.levelupAccount', '#showRegister', () => switchAccountTab('register'));
  $document.on('click.levelupAccount', '#showLogin', () => switchAccountTab('login'));
  $document.on('submit.levelupAccount', '#registerForm', function (event) {
    event.preventDefault();
    const validName = validateAccountName();
    const validPhone = validateAccountPhone();
    if (!validName || !validPhone) { document.getElementById(!validName ? 'accountName' : 'accountPhone').focus(); return; }
    const name = $('#accountName').val().trim();
    const phone = $('#accountPhone').val();
    if (state.accounts.some(account => account.phone === phone)) {
      $('#accountPhoneError').text('');
      switchAccountTab('login');
      $('#loginPhone').val(phone);
      $('#loginPhoneError').text('Este número ya tiene una cuenta. Inicia sesión.');
      return;
    }
    state.activeUser = { name, phone, balance: 0, history: [], createdAt: new Date().toISOString() };
    state.accounts.push(state.activeUser);
    saveAccounts();
    renderAccount();
    showToast(`Bienvenido, ${name.split(' ')[0]}. Tu cuenta de demostración está lista.`);
    continuePendingBooking();
  });
  $document.on('submit.levelupAccount', '#loginForm', function (event) {
    event.preventDefault();
    if (!validateLoginPhone()) { document.getElementById('loginPhone').focus(); return; }
    const found = state.accounts.find(account => account.phone === $('#loginPhone').val());
    if (!found) { $('#loginPhoneError').text('No hay una cuenta con ese número. Regístrate primero.'); return; }
    state.activeUser = found;
    saveAccounts();
    renderAccount();
    showToast(`Bienvenido nuevamente, ${found.name.split(' ')[0]}.`);
    continuePendingBooking();
  });
  $document.on('input.levelupValidation', '#accountName', validateAccountName);
  $document.on('blur.levelupValidation', '#accountName', validateAccountName);
  $document.on('input.levelupValidation', '#accountPhone, #loginPhone, #customerPhone, #contactPhone', function () {
    normalizePhone(this);
    if (this.id === 'accountPhone') validateAccountPhone();
    if (this.id === 'loginPhone') validateLoginPhone();
    if (this.id === 'customerPhone') validateBookingPhone();
    if (this.id === 'contactPhone') validateContactPhone();
  });
  $document.on('blur.levelupValidation', '#accountPhone', validateAccountPhone);
  $document.on('blur.levelupValidation', '#loginPhone', validateLoginPhone);
  $document.on('input.levelupValidation blur.levelupValidation', '#customerName', validateBookingName);
  $document.on('blur.levelupValidation', '#customerPhone', validateBookingPhone);
  $document.on('click.levelupAccount', '#logoutButton', function () {
    state.activeUser = null;
    saveAccounts();
    renderAccount();
    showToast('Sesión cerrada.');
  });
  $document.on('click.levelupAccount', '#openRechargeButton', openRecharge);
  $document.on('click.levelupInstall', '#installAppButton', requestInstall);

  /* Recarga simulada. */
  $document.on('click.levelupAccount', '[data-recharge-amount]', function () {
    state.rechargeAmount = Number(this.dataset.rechargeAmount);
    $('[data-recharge-amount]').removeClass('active').attr('aria-pressed', 'false');
    $(this).addClass('active').attr('aria-pressed', 'true');
    $('#rechargeAmountLabel').text(money(state.rechargeAmount));
  });
  $document.on('click.levelupAccount', '[data-recharge-method]', function () {
    state.rechargeMethod = this.dataset.rechargeMethod;
    $('[data-recharge-method]').removeClass('active').attr('aria-pressed', 'false');
    $(this).addClass('active').attr('aria-pressed', 'true');
  });
  $document.on('click.levelupAccount', '#confirmRecharge', confirmRecharge);
  $document.on('click.levelupAccount', '#cancelRecharge, #closeRecharge', () => closeModal('#rechargeModal'));

  /* Reserva, pago y cancelación. */
  $document.on('submit.levelupBooking', '#bookingForm', function (event) { event.preventDefault(); startPaymentStep(); });
  $document.on('change.levelupBooking', '#sessionHours', updateBookingTotal);
  $document.on('click.levelupBooking', '#confirmPayment', confirmSessionPayment);
  $document.on('click.levelupBooking', '#rechargeFromPayment', openRecharge);
  $document.on('click.levelupBooking', '#backToBooking', () => showBookingStep('booking'));
  $document.on('click.levelupBooking', '#cancelBooking, #cancelBookingPayment, #closeBooking', () => closeBooking(true));
  $document.on('click.levelupBooking', '#finishBooking', function () {
    state.selectedMachine = null;
    state.booking = null;
    closeModal('#bookingModal');
    showView('cuenta');
    renderAccount();
    showToast(`Saldo disponible: ${money(state.activeUser?.balance || 0)}.`);
  });
  $document.on('click.levelupBooking', '#bookingModal', function (event) {
    if (event.target === this) closeBooking(true);
  });
  $document.on('click.levelupAccount', '#rechargeModal', function (event) {
    if (event.target === this) closeModal('#rechargeModal');
  });

  /* Acordeones desplegables de información. */
  $document.on('click.levelupAccordion', '[data-accordion]', function () {
    const panel = document.getElementById(this.dataset.accordion);
    if (!panel) return;
    const expanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
    this.querySelector('span')?.replaceChildren(document.createTextNode(expanded ? '＋' : '−'));
  });

  /* Galería: evento delegado para fotos de la portada y para las tarjetas JSON que se generan después. */
  $document.on('click.levelupViewer', '[data-photo-open]', function () { handlePhotoOpen(this); });
  $document.on('click.levelupViewer', '#closePhotoViewer', closePhotoViewer);
  $document.on('click.levelupViewer', '#photoViewer', function (event) { if (event.target === this) closePhotoViewer(); });
  $document.on('keydown.levelupModal', function (event) {
    const openLayers = [...document.querySelectorAll('.modal-backdrop.open, .photo-viewer.open')];
    const activeLayer = openLayers.at(-1);
    if (event.key === 'Tab' && activeLayer) {
      const focusable = [...activeLayer.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), a[href]')]
        .filter(element => element.offsetParent !== null);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !activeLayer.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
      return;
    }
    if (event.key !== 'Escape') return;
    if ($('#photoViewer').hasClass('open')) closePhotoViewer();
    else if ($('#rechargeModal').hasClass('open')) closeModal('#rechargeModal');
    else if ($('#bookingModal').hasClass('open')) closeBooking(true);
    else closeMobileMenu();
  });

  /* Contacto: validación y preparación del mensaje para WhatsApp. */
  $document.on('input.levelupValidation blur.levelupValidation', '#contactName', validateContactName);
  $document.on('input.levelupValidation blur.levelupValidation', '#contactMessage', function () {
    validateContactMessage();
    $('#contactMessageCounter').text(`${this.value.length} / 300`);
  });
  $document.on('submit.levelupContact', '#contactForm', function (event) { event.preventDefault(); sendContactMessage(); });
}
function setQuickFilter(filter) {
  state.currentFilter = filter;
  $('[data-filter]').each(function () {
    const active = this.dataset.filter === filter;
    $(this).toggleClass('active', active).attr('aria-pressed', String(active));
  });
  applyMachineFilters(true);
}
function scrollCarousel(direction) {
  const carousel = document.getElementById('pcCarousel');
  if (!carousel) return;
  const amount = Math.max(250, Math.round(carousel.clientWidth * .78));
  carousel.scrollBy({ left: amount * direction, behavior: 'smooth' });
}
function continuePendingBooking() {
  if (state.pendingMachineId === null) return;
  const id = state.pendingMachineId;
  state.pendingMachineId = null;
  showView('computadoras');
  window.setTimeout(() => openBooking(id), 80);
}
function hydrateLevelUp() {
  const shell = document.getElementById('appShell');
  if (!shell || shell.dataset.hidratado === 'true') return;
  bindLevelUpEvents();
  markHydrated();
  state.hydrationComplete = true;
  loadAccounts();
  renderAccount();
  const initialView = location.hash.slice(1);
  showView(LEVELUP_VIEWS.includes(initialView) ? initialView : 'inicio', false);
  setupPWA();
  refreshNetworkStatus(true);
  if (state.networkTimer !== null) window.clearInterval(state.networkTimer);
  state.networkTimer = window.setInterval(() => refreshNetworkStatus(), 25000);
  initializeCatalog();
}

/* Historial de vistas y ciclo de vida: no se acumulan temporizadores. */
function syncViewFromLocation() {
  const name = location.hash.slice(1);
  if (LEVELUP_VIEWS.includes(name)) showView(name, false);
}
window.addEventListener('popstate', syncViewFromLocation);
window.addEventListener('hashchange', syncViewFromLocation);
window.addEventListener('online', () => { if (state.hydrationComplete) refreshNetworkStatus(); });
window.addEventListener('offline', () => { if (state.hydrationComplete) refreshNetworkStatus(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.hydrationComplete) {
    refreshNetworkStatus();
    tickSessions();
  }
});
window.addEventListener('pagehide', () => {
  if (state.networkTimer !== null) window.clearInterval(state.networkTimer);
  if (state.sessionTimer !== null) window.clearInterval(state.sessionTimer);
  if (state.toastTimer !== null) window.clearTimeout(state.toastTimer);
  if (state.viewTransitionTimer !== null) window.clearTimeout(state.viewTransitionTimer);
  $(window).off('resize.levelupCarousel');
  $('#pcCarousel').off('scroll.levelupCarousel');
  state.networkTimer = null;
  state.sessionTimer = null;
  state.toastTimer = null;
  state.viewTransitionTimer = null;
});
window.addEventListener('pageshow', event => {
  if (event.persisted && state.hydrationComplete) {
    refreshNetworkStatus();
    startSessionTicker();
    const carousel = document.getElementById('pcCarousel');
    if (carousel) $(carousel).off('scroll.levelupCarousel').on('scroll.levelupCarousel', updateCarouselPosition);
    $(window).off('resize.levelupCarousel').on('resize.levelupCarousel', updateCarouselPosition);
    if (state.networkTimer === null) state.networkTimer = window.setInterval(() => refreshNetworkStatus(), 25000);
  }
});

/* El DOM aparece estático primero. Después de la hidratación los controles se conectan y se habilitan. */
$(function () {
  window.setTimeout(hydrateLevelUp, 420);
});
