'use strict';

/* LevelUp: SPA ligera, hidratación controlada y delegación de eventos. */
const LEVELUP_VIEWS = ['inicio', 'computadoras', 'consolas', 'cuenta', 'servicios', 'contacto'];
const VIEW_LABELS = { inicio: 'Inicio', computadoras: 'Computadoras', consolas: 'PlayStation', cuenta: 'Mi cuenta', servicios: 'Servicios', contacto: 'Contacto' };
const STORAGE = {
  accounts: 'levelup_accounts_v1',
  activePhone: 'levelup_active_phone_v1',
  machines: 'levelup_machine_states_v3',
  consoles: 'levelup_console_states_v1',
  pending: 'levelup_pending_actions_v1',
  scheduledReservations: 'levelup_scheduled_reservations_v1',
  accessoryQueue: 'levelup_accessory_queue_v1'
};
const state = {
  machines: [], consoles: [], accounts: [], scheduledReservations: [], accessoryQueue: [], activeUser: null, currentFilter: 'all',
  selectedMachine: null, selectedResourceType: null, booking: null, pendingMachineId: null, pendingConsoleId: null,
  rechargeAmount: 20, rechargeMethod: 'QR',
  hydrationComplete: false, networkState: 'checking',
  networkCheckId: 0, networkTimer: null, sessionTimer: null,
  toastTimer: null, viewTransitionTimer: null, currentView: 'inicio'
};
const $document = $(document);
const modalReturnFocus = new WeakMap();

function money(value) { return `Bs ${Number(value || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`; }
function createTextElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? '');
  return element;
}
function safeCatalogImage(path, fallback) {
  const value = String(path || '');
  return /^\.\/imagenes\/[a-z0-9._-]+\.(?:webp|png|jpe?g)$/i.test(value) ? value : fallback;
}
function createUsageTimer(label, id, attribute, value) {
  const wrapper = createTextElement('div', 'pc-usage');
  const timer = createTextElement('strong', '', value);
  timer.setAttribute(attribute, String(id));
  wrapper.append(document.createTextNode(`${label} · `), timer);
  return wrapper;
}
function createPhotoButton({ className, path, fallback, caption, alt, width, height, label }) {
  const button = createTextElement('button', className);
  button.type = 'button';
  button.dataset.photoOpen = '';
  button.dataset.photo = safeCatalogImage(path, fallback);
  button.dataset.caption = String(caption || 'Fotografía LevelUp');
  button.setAttribute('aria-label', String(label || 'Ampliar fotografía'));
  button.dataset.hidratado = 'true';
  const image = document.createElement('img');
  image.src = button.dataset.photo;
  image.alt = String(alt || 'Imagen representativa de LevelUp');
  image.width = width;
  image.height = height;
  image.loading = 'lazy';
  image.decoding = 'async';
  button.append(image);
  return button;
}
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
function getConsole(id) { return state.consoles.find(consoleUnit => consoleUnit.id === Number(id)) || null; }
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

/* Catálogo asíncrono propio de LevelUp. El fetch informa rutas/HTTP y usa Cache Storage como respaldo offline. */
async function readCatalogJSON(relativePath, label) {
  const url = new URL(relativePath, document.baseURI);
  let networkError = null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url.href, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (response.ok) {
      const raw = await response.text();
      if (/^\s*</.test(raw)) throw new Error('GitHub Pages respondió HTML en lugar de JSON. Revisa que el archivo exista en data/.');
      try { return JSON.parse(raw); }
      catch (_) { throw new Error('El archivo existe, pero su contenido no es JSON válido.'); }
    }
    networkError = new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
  } catch (error) {
    networkError = error.name === 'AbortError'
      ? new Error('La solicitud agotó el tiempo de espera (9 segundos).')
      : error;
  } finally {
    window.clearTimeout(timeout);
    controller.abort();
  }

  // Si no responde la red o el servidor devuelve 404/HTML, intenta la copia offline instalada.
  if ('caches' in window) {
    try {
      const cached = await caches.match(url.href, { ignoreSearch: true });
      if (cached && cached.ok) {
        const raw = await cached.text();
        const parsed = JSON.parse(raw);
        console.info(`${label}: se utilizó la copia guardada en Cache Storage.`);
        return parsed;
      }
    } catch (cacheError) {
      console.warn(`No se pudo recuperar ${label} desde la caché:`, cacheError);
    }
  }
  throw new Error(`${label}: no se pudo leer ${url.pathname}. ${networkError?.message || 'Comprueba la carpeta data y vuelve a publicar el archivo.'}`);
}

async function loadMachineCatalog() {
  const catalog = await readCatalogJSON('./data/computadoras.json?v=15', 'Catálogo de computadoras');
  if (!Array.isArray(catalog) || catalog.length < 15) throw new Error('computadoras.json debe contener al menos 15 estaciones.');
  const usedIds = new Set();
  state.machines = catalog.map(item => {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id < 1 || usedIds.has(id)) throw new Error(`computadoras.json: ID inválido o repetido en la estación ${item.id}.`);
    if (!['basic', 'standard', 'premium'].includes(item.type)) throw new Error(`computadoras.json: categoría no válida en la estación ${id}.`);
    if (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0) throw new Error(`computadoras.json: precio no válido en la estación ${id}.`);
    if (!item.cpu || !item.gpu || !item.ram || !item.storage || !item.monitor) throw new Error(`computadoras.json: faltan especificaciones en la estación ${id}.`);
    usedIds.add(id);
    return {
      ...item,
      id,
      price: Number(item.price),
      available: Boolean(item.available),
      elapsed: String(item.elapsed || ''),
      image: String(item.image || './imagenes/pc-gamer.webp'),
      imageAlt: String(item.imageAlt || `Gabinete gamer representativo de la estación ${id}`),
      seat: String(item.seat || 'Asiento estándar'),
      features: Array.isArray(item.features) ? item.features.map(String) : [],
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

async function loadConsoleCatalog() {
  const catalog = await readCatalogJSON('./data/consolas.json?v=15', 'Catálogo PlayStation');
  if (!Array.isArray(catalog) || catalog.length !== 4) throw new Error('consolas.json debe contener exactamente cuatro consolas.');
  const ids = new Set();
  state.consoles = catalog.map(item => {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id < 101 || id > 104 || ids.has(id)) throw new Error(`consolas.json: identificador no válido o repetido (${item.id}).`);
    // La tarifa comercial de PlayStation se define aquí y en consolas.json.
    // Si GitHub Pages o el navegador entrega un JSON antiguo sin precio (o con otra tarifa),
    // se normaliza a la tarifa vigente en vez de bloquear las cuatro consolas.
    const suppliedRate = Number(item.price ?? item.hourlyRate ?? item.pricePerHour);
    if (!Number.isFinite(suppliedRate) || suppliedRate !== 15) {
      console.warn(`consolas.json: tarifa antigua/incompleta en la consola ${id - 100}; se aplicará Bs 15 por hora.`);
    }
    ids.add(id);
    return {
      ...item,
      id,
      kind: 'console',
      price: 15,
      hourlyRate: 15,
      priceNote: 'Tarifa LevelUp · Bs 15 por hora',
      controllersIncluded: 1,
      extraControllerFee: 6,
      available: Boolean(item.available),
      elapsed: String(item.elapsed || ''),
      image: String(item.image || './imagenes/playstation.webp'),
      imageAlt: String(item.imageAlt || `PlayStation ${id - 100}`),
      sessionStartedAt: null,
      sessionEndsAt: null,
      reservationExpiresAt: null
    };
  });
  restoreConsoleStates();
}
function restoreConsoleStates() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE.consoles) || '[]');
    if (Array.isArray(stored)) stored.forEach(saved => {
      const consoleUnit = getConsole(saved.id);
      if (!consoleUnit) return;
      ['available', 'sessionStartedAt', 'sessionEndsAt', 'reservationExpiresAt'].forEach(key => {
        if (saved[key] !== undefined) consoleUnit[key] = saved[key];
      });
    });
  } catch (error) { console.warn('No se pudieron recuperar los estados de las consolas.', error); }
  state.consoles.forEach(consoleUnit => {
    if (consoleUnit.reservationExpiresAt && consoleUnit.reservationExpiresAt <= Date.now()) {
      consoleUnit.available = true;
      consoleUnit.reservationExpiresAt = null;
      consoleUnit.sessionStartedAt = null;
    }
  });
  saveConsoleStates();
}
function saveConsoleStates() {
  try {
    const snapshot = state.consoles.map(consoleUnit => ({
      id: consoleUnit.id,
      available: consoleUnit.available,
      sessionStartedAt: consoleUnit.sessionStartedAt || null,
      sessionEndsAt: consoleUnit.sessionEndsAt || null,
      reservationExpiresAt: consoleUnit.reservationExpiresAt || null
    }));
    localStorage.setItem(STORAGE.consoles, JSON.stringify(snapshot));
  } catch (error) { showToast('No se pudieron guardar los estados de las consolas.', 'error'); }
}
function renderConsoles() {
  const grid = document.getElementById('consoleGrid');
  if (!grid) return;
  $('#consoleCount').text(state.consoles.length);
  const fragment = document.createDocumentFragment();
  state.consoles.forEach(consoleUnit => {
    const status = cardStatus(consoleUnit);
    const number = String(consoleUnit.id - 100).padStart(2, '0');
    const card = createTextElement('article', `console-card ${status.className}`);
    card.dataset.consoleCard = String(consoleUnit.id);

    const top = createTextElement('div', 'console-card-top');
    top.append(
      createTextElement('span', '', `PLAYSTATION 5 · #${number}`),
      createTextElement('span', `pc-status ${status.className}`, status.label)
    );
    card.append(top);
    card.append(createPhotoButton({
      className: 'console-photo', path: consoleUnit.image, fallback: './imagenes/playstation.webp',
      caption: `PlayStation 5 · Consola #${number}`, alt: consoleUnit.imageAlt,
      width: 800, height: 800, label: `Ampliar imagen de PlayStation 5 número ${number}`
    }));

    const body = createTextElement('div', 'console-card-body');
    const title = createTextElement('div', 'console-card-title');
    title.append(createTextElement('strong', '', consoleUnit.label));
    const price = createTextElement('span', '', money(consoleUnit.price));
    price.append(createTextElement('small', '', '/ hora'));
    title.append(price);
    body.append(title, createTextElement('p', 'console-rate-note', consoleUnit.priceNote || 'Tarifa por hora'));

    const details = createTextElement('div', 'console-details');
    details.append(
      createTextElement('span', '', '🎮 1 mando incluido'),
      createTextElement('span', '', `＋ Segundo mando: ${money(consoleUnit.extraControllerFee)} por sesión`),
      createTextElement('span', '', `🛋 ${consoleUnit.seat || 'Asiento cómodo'}`)
    );
    body.append(details);

    const action = createTextElement('div', 'console-card-action');
    if (isReserved(consoleUnit)) {
      action.append(createUsageTimer('Apartada', consoleUnit.id, 'data-hold-timer', formatHold(consoleUnit.reservationExpiresAt - Date.now())));
    } else if (consoleUnit.sessionEndsAt) {
      action.append(createUsageTimer('Tiempo restante', consoleUnit.id, 'data-session-timer', formatClock(consoleUnit.sessionEndsAt - Date.now())));
    } else if (!consoleUnit.available) {
      action.append(createUsageTimer('En uso', consoleUnit.id, 'data-elapsed-timer', formatClock(Date.now() - (consoleUnit.sessionStartedAt || Date.now()))));
    } else {
      const reserve = createTextElement('button', 'select-pc-btn console-select-btn', 'Reservar consola →');
      reserve.type = 'button';
      reserve.dataset.selectConsole = String(consoleUnit.id);
      reserve.dataset.hidratado = 'true';
      action.append(reserve);
    }
    body.append(action);
    card.append(body);
    fragment.append(card);
  });
  grid.replaceChildren(fragment);
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
    const searchText = `pc ${pad(machine.id)} ${machine.label} ${machine.cpu} ${machine.gpu} ${machine.ram} ${machine.storage} ${machine.monitor} ${machine.seat} ${(machine.features || []).join(' ')}`.toLocaleLowerCase('es');
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

  const fragment = document.createDocumentFragment();
  filtered.forEach(machine => {
    const status = cardStatus(machine);
    const number = pad(machine.id);
    const card = createTextElement('article', `pc-card ${status.className}`);
    card.dataset.machineCard = String(machine.id);
    card.dataset.type = String(machine.type);

    const top = createTextElement('div', 'pc-card-top');
    top.append(
      createTextElement('span', 'pc-name', `ESTACIÓN #${number}`),
      createTextElement('span', `pc-status ${status.className}`, status.label)
    );
    card.append(top);
    card.append(createPhotoButton({
      className: 'pc-photo', path: machine.image, fallback: './imagenes/pc-gamer.webp',
      caption: `Estación #${number} · ${machine.label} · ${machine.cpu} · ${machine.gpu} · Imagen representativa de la categoría`,
      alt: machine.imageAlt, width: 225, height: 225, label: `Ampliar imagen de la estación ${number}`
    }));

    const body = createTextElement('div', 'pc-card-body');
    const title = createTextElement('div', 'pc-card-title');
    title.append(createTextElement('strong', '', machine.label));
    const price = createTextElement('span', 'pc-price', money(machine.price));
    price.append(createTextElement('small', '', '/h'));
    title.append(price);
    body.append(title);

    const specs = createTextElement('div', 'pc-specs');
    [machine.cpu, machine.gpu, machine.ram, machine.storage, machine.monitor, `🪑 ${machine.seat}`]
      .forEach(value => specs.append(createTextElement('span', '', value)));
    (Array.isArray(machine.features) ? machine.features : []).forEach(feature => {
      specs.append(createTextElement('span', 'pc-feature-pill', feature));
    });
    body.append(specs);

    const foot = createTextElement('div', 'pc-card-foot');
    if (status.className === 'available') {
      const select = createTextElement('button', 'select-pc-btn', 'Elegir esta PC →');
      select.type = 'button';
      select.dataset.selectMachine = String(machine.id);
      select.dataset.hidratado = 'true';
      foot.append(select);
    } else if (isReserved(machine)) {
      foot.append(createUsageTimer('Apartada', machine.id, 'data-hold-timer', formatHold(machine.reservationExpiresAt - Date.now())));
    } else if (machine.sessionEndsAt) {
      foot.append(createUsageTimer('Tiempo restante', machine.id, 'data-session-timer', formatClock(machine.sessionEndsAt - Date.now())));
    } else {
      foot.append(createUsageTimer('En uso', machine.id, 'data-elapsed-timer', formatClock(Date.now() - (machine.sessionStartedAt || Date.now()))));
    }
    body.append(foot);
    card.append(body);
    fragment.append(card);
  });
  grid.replaceChildren(fragment);
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
    { id: 'basic', label: 'Básica' },
    { id: 'standard', label: 'Estándar' },
    { id: 'premium', label: 'Premium' }
  ];
  const fragment = document.createDocumentFragment();
  categories.forEach(category => {
    const machines = state.machines.filter(machine => machine.type === category.id);
    const occupied = machines.filter(machine => !isAvailable(machine)).length;
    const free = machines.length - occupied;
    const ratio = machines.length ? Math.min(100, Math.round(occupied / machines.length * 100)) : 0;
    const row = createTextElement('div', 'occupancy-row');
    const head = createTextElement('div', 'occupancy-row-head');
    head.append(
      createTextElement('strong', '', category.label),
      createTextElement('span', '', `${occupied} de ${machines.length} en uso · ${free} libres`)
    );
    const meter = createTextElement('div', 'occupancy-meter');
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', `${category.label}: ${ratio}% de ocupación`);
    const fill = document.createElement('span');
    fill.style.width = `${ratio}%`;
    meter.append(fill);
    row.append(head, meter);
    fragment.append(row);
  });
  chart.replaceChildren(fragment);
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
function setCatalogLoadingState(containerId, title, detail) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const stateBox = createTextElement('div', 'catalog-state');
  stateBox.append(createTextElement('strong', '', title), document.createTextNode(detail));
  container.replaceChildren(stateBox);
}

async function initializeCatalog() {
  $('#catalogError, #consoleCatalogError').prop('hidden', true);
  $('#catalogStatus').text('Cargando catálogo…');
  setCatalogLoadingState('pcGrid', 'Preparando las estaciones…', 'Estamos leyendo data/computadoras.json.');
  setCatalogLoadingState('consoleGrid', 'Preparando las consolas…', 'Estamos leyendo data/consolas.json.');

  const [machinesResult, consolesResult] = await Promise.allSettled([
    loadMachineCatalog(),
    loadConsoleCatalog()
  ]);

  if (machinesResult.status === 'fulfilled') {
    fillSelect('filterCategory', 'Todas las categorías', ['basic', 'standard', 'premium'], false);
    const categoryLabels = { basic: 'Básica', standard: 'Estándar', premium: 'Premium' };
    [...document.getElementById('filterCategory').options].forEach(option => {
      if (categoryLabels[option.value]) option.textContent = categoryLabels[option.value];
    });
    fillSelect('filterCPU', 'Primero elige categoría', [], true);
    fillSelect('filterGPU', 'Primero elige procesador', [], true);
    renderMachines();
    $('#catalogStatus').text(`${state.machines.length} estaciones listas`);
  } else {
    const error = machinesResult.reason;
    console.error('Error en data/computadoras.json:', error);
    state.machines = [];
    document.getElementById('pcGrid')?.replaceChildren();
    $('#catalogStatus').text('No se pudo cargar el catálogo de computadoras');
    $('#catalogErrorText').text(error?.message || 'Comprueba que data/computadoras.json esté publicado.');
    $('#catalogError').prop('hidden', false);
    updateStats();
  }

  if (consolesResult.status === 'fulfilled') {
    renderConsoles();
    $('#consoleCatalogError').prop('hidden', true);
  } else {
    const error = consolesResult.reason;
    console.error('Error en data/consolas.json:', error);
    state.consoles = [];
    document.getElementById('consoleGrid')?.replaceChildren();
    $('#consoleCatalogErrorText').text(error?.message || 'Comprueba que data/consolas.json esté publicado.');
    $('#consoleCatalogError').prop('hidden', false);
  }
  populateReservationResources();
  setReservationDateMinimum();
  renderScheduledReservations();
  startSessionTicker();
}

/* Reservas futuras de turno: ejercicio local de validación y persistencia, separado del apartado de reserva inmediata. */
const RESERVATION_DURATIONS = [1, 2, 3, 5, 8];
function loadScheduledReservations() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE.scheduledReservations) || '[]');
    const now = Date.now();
    const source = Array.isArray(stored) ? stored : [];
    state.scheduledReservations = source
      .filter(item => item && typeof item === 'object' && typeof item.id === 'string'
        && typeof item.name === 'string' && typeof item.resourceKey === 'string'
        && typeof item.startsAt === 'string' && Number.isFinite(new Date(item.startsAt).getTime())
        && new Date(item.startsAt).getTime() + Number(item.durationHours) * 60 * 60 * 1000 >= now
        && RESERVATION_DURATIONS.includes(Number(item.durationHours)))
      .slice(0, 50)
      .map(item => ({
        id: item.id.slice(0, 80), name: item.name.slice(0, 60),
        resourceKey: item.resourceKey.slice(0, 40), resourceLabel: String(item.resourceLabel || 'Equipo LevelUp').slice(0, 120),
        startsAt: item.startsAt, durationHours: Number(item.durationHours), createdAt: String(item.createdAt || '')
      }));
    // Las solicitudes cuyo turno ya pasó dejan de aparecer en la lista activa.
    if (state.scheduledReservations.length !== source.length) {
      try {
        localStorage.setItem(STORAGE.scheduledReservations, JSON.stringify(state.scheduledReservations));
      } catch (writeError) {
        console.warn('No se pudieron depurar las solicitudes antiguas; se ocultarán de la lista activa.', writeError);
      }
    }
  } catch (error) {
    state.scheduledReservations = [];
    console.warn('No se pudieron leer las solicitudes de turno guardadas en este navegador.', error);
  }
}
function saveScheduledReservations() {
  try {
    localStorage.setItem(STORAGE.scheduledReservations, JSON.stringify(state.scheduledReservations));
    return true;
  } catch (error) {
    showToast('El navegador no permitió guardar la solicitud. Libera espacio e inténtalo de nuevo.', 'error');
    return false;
  }
}
function getReservationResource(resourceKey) {
  const match = /^(pc|console):(\d+)$/.exec(String(resourceKey || ''));
  if (!match) return null;
  const id = Number(match[2]);
  if (match[1] === 'pc') {
    const item = state.machines.find(machine => machine.id === id);
    return item ? { key: `pc:${id}`, item, label: `PC #${pad(id)} · ${item.label} · ${money(item.price)}/h` } : null;
  }
  const item = state.consoles.find(consoleUnit => consoleUnit.id === id);
  return item ? { key: `console:${id}`, item, label: `${item.label} · ${money(item.price)}/h` } : null;
}
function populateReservationResources() {
  const select = document.getElementById('recursoSelect');
  if (!select) return;
  const previous = select.value;
  const placeholder = new Option('Selecciona una PC o PlayStation', '');
  select.replaceChildren(placeholder);
  const machinesGroup = document.createElement('optgroup');
  machinesGroup.label = 'Computadoras';
  state.machines.forEach(machine => {
    const option = new Option(`PC #${pad(machine.id)} · ${machine.label} · ${money(machine.price)}/h`, `pc:${machine.id}`);
    machinesGroup.append(option);
  });
  const consolesGroup = document.createElement('optgroup');
  consolesGroup.label = 'PlayStation 5';
  state.consoles.forEach(consoleUnit => {
    const option = new Option(`${consoleUnit.label} · ${money(consoleUnit.price)}/h`, `console:${consoleUnit.id}`);
    consolesGroup.append(option);
  });
  if (machinesGroup.children.length) select.append(machinesGroup);
  if (consolesGroup.children.length) select.append(consolesGroup);
  select.disabled = !machinesGroup.children.length && !consolesGroup.children.length;
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}
function localDateTimeInputValue(timestamp) {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}
function getCurrentMinuteStart(now = new Date()) {
  const currentMinute = new Date(now.getTime());
  currentMinute.setSeconds(0, 0);
  return currentMinute;
}
function getNextReservationStart(now = new Date()) {
  // Para una contratación inmediata, propone este mismo minuto, sin espera artificial.
  // Si el local está fuera de horario, propone la próxima apertura.
  const candidate = getCurrentMinuteStart(now);
  if (candidate.getHours() < 8) candidate.setHours(8, 0, 0, 0);
  if (candidate.getHours() >= 23) {
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(8, 0, 0, 0);
  }
  return candidate;
}
function setReservationDateMinimum() {
  const input = document.getElementById('fechaTurno');
  if (!input) return;
  const minimum = getCurrentMinuteStart().getTime();
  input.min = localDateTimeInputValue(minimum);
  const selected = input.value ? new Date(input.value).getTime() : NaN;
  // La fecha inicial es hoy y el horario puede comenzar inmediatamente.
  // Solo se impiden minutos anteriores al minuto actual.
  if (!Number.isFinite(selected) || selected < minimum) {
    input.value = localDateTimeInputValue(getNextReservationStart().getTime());
  }
}
function reservationDateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible'
    : date.toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
}
function renderScheduledReservations() {
  const list = document.getElementById('listaReservas');
  if (!list) return;
  const fragment = document.createDocumentFragment();
  if (!state.scheduledReservations.length) {
    fragment.append(createTextElement('li', 'reservation-empty', 'Todavía no hay solicitudes de turno guardadas en este dispositivo.'));
  } else {
    state.scheduledReservations
      .slice()
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
      .forEach(item => {
        const row = createTextElement('li', 'reservation-item');
        const content = document.createElement('div');
        content.append(
          createTextElement('strong', '', item.name),
          createTextElement('span', '', item.resourceLabel),
          createTextElement('small', '', `Turno: ${reservationDateLabel(item.startsAt)} · ${item.durationHours} h`),
          createTextElement('small', '', `Solicitada: ${reservationDateLabel(item.createdAt || item.startsAt)}`)
        );
        const cancel = createTextElement('button', 'reservation-cancel', 'Cancelar');
        cancel.type = 'button';
        cancel.dataset.cancelReservation = item.id;
        cancel.dataset.hidratado = 'true';
        cancel.setAttribute('aria-label', `Cancelar solicitud de ${item.name}`);
        row.append(content, cancel);
        fragment.append(row);
      });
  }
  list.replaceChildren(fragment);
  const count = document.getElementById('reservationCount');
  if (count) count.textContent = String(state.scheduledReservations.length);
}
function setReservationFieldError(fieldId, errorId, message) {
  return setFieldError(fieldId, errorId, message);
}
function validateScheduledReservation() {
  const name = String($('#clienteNombre').val() || '').trim();
  const resourceKey = String($('#recursoSelect').val() || '');
  const dateValue = String($('#fechaTurno').val() || '');
  const duration = Number($('#duracionTurno').val());
  const start = dateValue ? new Date(dateValue) : null;
  const startAt = start && !Number.isNaN(start.getTime()) ? start.getTime() : NaN;
  const nameError = !name ? 'Escribe el nombre de la persona que solicita el turno.'
    : name.length < 2 ? 'El nombre debe tener al menos 2 caracteres.' : '';
  const resource = getReservationResource(resourceKey);
  const resourceError = !resource ? 'Selecciona un equipo válido del catálogo.' : '';
  const currentMinute = getCurrentMinuteStart().getTime();
  const dateError = !dateValue ? 'Selecciona la fecha y hora del turno.'
    : !Number.isFinite(startAt) ? 'La fecha y hora no son válidas.'
    : startAt < currentMinute ? 'No se permiten fechas u horas anteriores al momento actual.' : '';
  const durationError = !RESERVATION_DURATIONS.includes(duration) ? 'Selecciona una duración disponible.' : '';
  setReservationFieldError('clienteNombre', 'clienteNombreError', nameError);
  setReservationFieldError('recursoSelect', 'recursoSelectError', resourceError);
  setReservationFieldError('fechaTurno', 'fechaTurnoError', dateError);
  setReservationFieldError('duracionTurno', 'duracionTurnoError', durationError);
  // Si se elige el minuto actual, comienza ahora mismo; no se añade ningún margen de espera.
  const effectiveStartAt = Number.isFinite(startAt) && startAt >= currentMinute && startAt <= Date.now()
    ? Date.now() : startAt;
  return { valid: !(nameError || resourceError || dateError || durationError), name, resource, startAt: effectiveStartAt, duration };
}
function reservationOverlaps(resourceKey, startAt, endAt) {
  return state.scheduledReservations.some(item => {
    if (item.resourceKey !== resourceKey) return false;
    const existingStart = new Date(item.startsAt).getTime();
    const existingEnd = existingStart + Number(item.durationHours) * 60 * 60 * 1000;
    return Number.isFinite(existingStart) && startAt < existingEnd && endAt > existingStart;
  });
}
function submitScheduledReservation(event) {
  event.preventDefault();
  const result = validateScheduledReservation();
  const status = $('#reservationFormStatus');
  status.text('').attr('class', 'form-status');
  if (!result.valid) {
    const firstInvalid = document.querySelector('#formReserva .form-field.invalid input, #formReserva .form-field.invalid select');
    firstInvalid?.focus();
    status.text('Revisa los campos marcados antes de guardar.').attr('class', 'form-status error');
    return;
  }

  const endAt = result.startAt + result.duration * 60 * 60 * 1000;
  const endMinusOne = new Date(endAt - 1);
  const startDate = new Date(result.startAt);
  if (startDate.getHours() < 8 || endMinusOne.getFullYear() !== startDate.getFullYear()
    || endMinusOne.getMonth() !== startDate.getMonth() || endMinusOne.getDate() !== startDate.getDate()) {
    setReservationFieldError('fechaTurno', 'fechaTurnoError', 'El turno debe estar dentro del horario de 08:00 a 24:00 y terminar el mismo día.');
    document.getElementById('fechaTurno')?.focus();
    status.text('El horario seleccionado queda fuera de atención.').attr('class', 'form-status error');
    return;
  }

  const resource = result.resource;
  const liveBusyUntil = Number(resource.item.sessionEndsAt || resource.item.reservationExpiresAt || 0);
  if (!resource.item.available && (!liveBusyUntil || result.startAt < liveBusyUntil)) {
    setReservationFieldError('recursoSelect', 'recursoSelectError', 'El catálogo muestra este equipo ocupado y no tiene una hora de liberación confirmada. Elige otro equipo.');
    document.getElementById('recursoSelect')?.focus();
    status.text('No se puede proponer ese turno para un equipo ocupado sin hora de liberación.').attr('class', 'form-status error');
    return;
  }
  if (reservationOverlaps(resource.key, result.startAt, endAt)) {
    setReservationFieldError('fechaTurno', 'fechaTurnoError', 'Ese equipo ya tiene otra solicitud en un horario que se cruza.');
    document.getElementById('fechaTurno')?.focus();
    status.text('Cambia el horario o selecciona otro equipo.').attr('class', 'form-status error');
    return;
  }

  if (state.scheduledReservations.length >= 50) {
    status.text('Este dispositivo ya tiene 50 solicitudes guardadas. Cancela una antes de agregar otra.').attr('class', 'form-status error');
    return;
  }

  const reservation = {
    id: (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : `turno-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: result.name,
    resourceKey: resource.key,
    resourceLabel: resource.label,
    startsAt: new Date(result.startAt).toISOString(),
    durationHours: result.duration,
    createdAt: new Date().toISOString()
  };
  state.scheduledReservations.push(reservation);
  if (!saveScheduledReservations()) {
    state.scheduledReservations.pop();
    return;
  }
  renderScheduledReservations();
  event.currentTarget.reset();
  document.querySelectorAll('#formReserva .form-field').forEach(field => field.classList.remove('invalid'));
  ['clienteNombreError', 'recursoSelectError', 'fechaTurnoError', 'duracionTurnoError'].forEach(id => $(`#${id}`).text(''));
  setReservationDateMinimum();
  status.text('Solicitud guardada en este dispositivo. Todavía no confirma una reserva con el negocio ni bloquea el equipo en otros dispositivos.').attr('class', 'form-status success');
  showToast('Solicitud de turno guardada localmente.');
}
function cancelScheduledReservation(id) {
  const index = state.scheduledReservations.findIndex(item => item.id === id);
  if (index < 0) return;
  const [removed] = state.scheduledReservations.splice(index, 1);
  if (!saveScheduledReservations()) {
    state.scheduledReservations.splice(index, 0, removed);
    return;
  }
  renderScheduledReservations();
  $('#reservationFormStatus').text('La solicitud local fue cancelada.').attr('class', 'form-status success');
  showToast('Solicitud local cancelada.');
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
  const historyContainer = document.getElementById('accountHistory');
  if (historyContainer) {
    if (!history.length) {
      historyContainer.replaceChildren(createTextElement('div', 'history-empty', 'Todavía no tienes movimientos. Cuando recargues o completes una sesión aparecerán aquí.'));
    } else {
      const fragment = document.createDocumentFragment();
      history.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        const row = createTextElement('div', 'history-item');
        const detailsBox = document.createElement('div');
        const dateValue = entry.date ? new Date(entry.date) : null;
        const date = dateValue && !Number.isNaN(dateValue.getTime())
          ? dateValue.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
          : 'Fecha no disponible';
        const amountValue = Number(entry.amount || 0);
        const amount = Number.isFinite(amountValue) ? amountValue : 0;
        const details = entry.machine ? `Estación #${pad(entry.machine)} · ${entry.hours || 1} h` : (entry.method || 'Movimiento local');
        const entryType = entry.type === 'Recarga simulada' ? 'Recarga de saldo' : (entry.type || 'Movimiento');
        detailsBox.append(
          createTextElement('strong', '', entryType),
          createTextElement('small', '', `${details} · ${date}`)
        );
        row.append(
          detailsBox,
          createTextElement('span', `history-amount ${amount >= 0 ? 'positive' : 'negative'}`, `${amount >= 0 ? '+' : '−'}${money(Math.abs(amount))}`)
        );
        fragment.append(row);
      });
      historyContainer.replaceChildren(fragment);
    }
  }
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
function saveSelectedResource() {
  if (state.selectedResourceType === 'console') { saveConsoleStates(); renderConsoles(); }
  else { saveMachineStates(); renderMachines(); }
}
function releaseReservation(showMessage = false) {
  const resource = state.selectedMachine;
  if (!resource?.reservationExpiresAt) return;
  const id = resource.id;
  const isConsole = state.selectedResourceType === 'console';
  resource.reservationExpiresAt = null;
  resource.available = true;
  resource.sessionStartedAt = null;
  resource.sessionEndsAt = null;
  state.selectedMachine = null;
  state.selectedResourceType = null;
  state.booking = null;
  if (isConsole) { saveConsoleStates(); renderConsoles(); }
  else { saveMachineStates(); renderMachines(); }
  if (showMessage) showToast(isConsole ? `Reserva de la PlayStation #${id - 100} cancelada. La consola vuelve a estar disponible.` : `Reserva cancelada. La estación #${pad(id)} vuelve a estar disponible.`);
}
function expireReservation() {
  if (!state.selectedMachine?.reservationExpiresAt) return;
  const resource = state.selectedMachine;
  const isConsole = state.selectedResourceType === 'console';
  const id = resource.id;
  releaseReservation(false);
  closeModal('#bookingModal');
  closeModal('#rechargeModal');
  showToast(isConsole ? `Se agotó la reserva de la PlayStation #${id - 100}. Quedó libre.` : `Se agotó el minuto de reserva. La estación #${pad(id)} quedó libre.`, 'error');
}
function prepareResourceBooking(resource, resourceType) {
  if (!resource || !isAvailable(resource)) {
    showToast('Ese puesto ya no está disponible. Actualizamos el estado.', 'error');
    if (resourceType === 'console') renderConsoles(); else renderMachines();
    return;
  }
  if (!state.activeUser) {
    if (resourceType === 'console') state.pendingConsoleId = resource.id;
    else state.pendingMachineId = resource.id;
    showView('cuenta');
    showToast('Registra tu cuenta o inicia sesión para continuar con la reserva.');
    return;
  }
  state.selectedMachine = resource;
  state.selectedResourceType = resourceType;
  state.booking = null;
  resource.available = false;
  resource.reservationExpiresAt = Date.now() + 60000;
  resource.sessionStartedAt = null;
  resource.sessionEndsAt = null;
  const isConsole = resourceType === 'console';
  const title = isConsole ? `PLAYSTATION 5 · CONSOLA #${resource.id - 100}` : `ESTACIÓN #${pad(resource.id)} · ${resource.label}`;
  const spec = isConsole
    ? `${resource.controllersIncluded} mando incluido · ${resource.seat}`
    : `${resource.cpu} · ${resource.gpu} · ${resource.ram} · ${resource.seat}`;
  $('#selectedMachineName').text(title);
  $('#selectedMachineSpecs').text(spec);
  $('#selectedMachineRate').text(`${money(resource.price)}/h`);
  $('#customerName').val(state.activeUser.name);
  $('#customerPhone').val(state.activeUser.phone);
  $('#sessionHours').val('1');
  $('#extraControllerField').prop('hidden', !isConsole);
  $('#extraController').prop('checked', false);
  $('#bookingCostBreakdown').prop('hidden', !isConsole);
  $('#bookingDescription').text(isConsole ? 'Elige duración y, si lo necesitas, añade un segundo mando.' : 'Selecciona el tiempo y revisa el importe.');
  $('#bookingHoldNotice span').text(isConsole ? 'Tu consola está apartada durante un minuto. Completa la reserva antes de que termine.' : 'Tu equipo está apartado durante un minuto. Completa la reserva antes de que termine.');
  setFieldError('customerName', 'customerNameError', '');
  setFieldError('customerPhone', 'customerPhoneError', '');
  updateBookingTotal();
  showBookingStep('booking');
  updateBookingCountdown();
  saveSelectedResource();
  showView(isConsole ? 'consolas' : 'computadoras');
  openModal('#bookingModal');
}
function openBooking(machineId) { prepareResourceBooking(getMachine(machineId), 'pc'); }
function openConsoleBooking(consoleId) { prepareResourceBooking(getConsole(consoleId), 'console'); }
function updateBookingTotal() {
  const hours = Number($('#sessionHours').val() || 1);
  const base = state.selectedMachine ? state.selectedMachine.price * hours : 0;
  const controllerFee = state.selectedResourceType === 'console' && $('#extraController').is(':checked') ? Number(state.selectedMachine?.extraControllerFee || 6) : 0;
  const amount = base + controllerFee;
  $('#bookingBaseAmount').text(money(base));
  $('#bookingControllerAmount').text(money(controllerFee));
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
  const isConsole = state.selectedResourceType === 'console';
  const hasExtraController = isConsole && $('#extraController').is(':checked');
  state.booking = { kind: state.selectedResourceType, name: $('#customerName').val().trim(), phone: $('#customerPhone').val(), hours, hasExtraController, controllerFee: hasExtraController ? Number(state.selectedMachine.extraControllerFee || 6) : 0, total: updateBookingTotal() };
  $('#paymentMachine').text(isConsole ? `PlayStation 5 · Consola #${state.selectedMachine.id - 100}` : `Estación #${pad(state.selectedMachine.id)} · ${state.selectedMachine.label}`);
  $('#paymentSummary').text(`${hours} ${hours === 1 ? 'hora' : 'horas'}${hasExtraController ? ' · incluye segundo mando (+ Bs 6)' : ''} · la sesión comienza al confirmar`);
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
  const isConsole = state.selectedResourceType === 'console';
  const resourceName = isConsole ? `PlayStation 5 · Consola #${machine.id - 100}` : `Estación #${pad(machine.id)} · ${machine.label}`;
  // La fecha de contratación se asigna automáticamente al confirmar el servicio.
  const contractedAt = new Date();
  const contractedAtMs = contractedAt.getTime();
  const session = { type: isConsole ? 'Sesión PlayStation' : 'Sesión PC', resource: isConsole ? 'console' : 'pc', machine: machine.id, hours: state.booking.hours, extraController: Boolean(state.booking.hasExtraController), controllerFee: Number(state.booking.controllerFee || 0), amount: -state.booking.total, date: contractedAt.toISOString() };
  user.history.push(session);
  saveActiveUser();
  machine.available = false;
  machine.reservationExpiresAt = null;
  machine.sessionStartedAt = contractedAtMs;
  machine.sessionEndsAt = contractedAtMs + state.booking.hours * 3600000;
  if (state.networkState !== 'online') queueLocalAction(isConsole ? 'sesion-playstation-local' : 'sesion-pc-local', session);
  if (isConsole) { saveConsoleStates(); renderConsoles(); }
  else { saveMachineStates(); renderMachines(); }
  const extra = isConsole && state.booking.hasExtraController ? ' Se añadió un segundo mando por Bs 6.' : '';
  const message = `${state.booking.name}, se asignó ${resourceName} durante ${state.booking.hours} ${state.booking.hours === 1 ? 'hora' : 'horas'}.${extra} Se descontaron ${money(state.booking.total)}. Saldo restante: ${money(user.balance)}.`;
  $('#successText').text(message);
  $('#contractedAtLabel').text(`Contratado el ${contractedAt.toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}`);
  $('#syncNote').text(state.networkState === 'online'
    ? 'Registro guardado en este navegador. Esta versión no procesa cobros bancarios.'
    : 'Sin Internet: el registro quedó guardado en este dispositivo. No se ha enviado a un servidor.');
  showBookingStep('success');
  updateBookingCountdown();
}
function closeBooking(release = true) {
  if (release) releaseReservation(false);
  closeModal('#bookingModal');
  state.selectedMachine = null;
  state.selectedResourceType = null;
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
  const recharge = { type: 'Recarga de saldo', amount, method: state.rechargeMethod, date: new Date().toISOString() };
  state.activeUser.history.push(recharge);
  saveActiveUser();
  if (state.networkState !== 'online') queueLocalAction('recarga-local', recharge);
  closeModal('#rechargeModal');
  updatePaymentState();
  showToast(`${money(amount)} añadidos al saldo de tu cuenta en este navegador.`);
}

/* Temporizador único: se actualizan los textos, no se adjuntan listeners a cada tarjeta. */
function tickSessions() {
  const now = Date.now();
  let changed = false;
  const expiredReservations = [];
  const finishedSessions = [];
  [...state.machines, ...state.consoles].forEach(machine => {
    if (machine.reservationExpiresAt) {
      const remaining = machine.reservationExpiresAt - now;
      if (remaining <= 0) {
        machine.reservationExpiresAt = null;
        machine.available = true;
        machine.sessionStartedAt = null;
        expiredReservations.push({ id: machine.id, kind: machine.kind || 'pc' });
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
        finishedSessions.push({ id: machine.id, kind: machine.kind || 'pc' });
        changed = true;
      } else $(`[data-session-timer="${machine.id}"]`).text(formatClock(remaining));
    } else if (!machine.available && !machine.reservationExpiresAt && machine.sessionStartedAt) {
      const elapsed = now - machine.sessionStartedAt;
      $(`[data-elapsed-timer="${machine.id}"]`).text(formatClock(elapsed));
    }
  });
  if (expiredReservations.length) {
    expiredReservations.forEach(item => {
      const isSelected = state.selectedMachine?.id === item.id && state.selectedResourceType === item.kind;
      if (isSelected) {
        state.selectedMachine = null;
        state.selectedResourceType = null;
        state.booking = null;
        closeModal('#bookingModal');
      }
      const label = item.kind === 'console' ? `PlayStation #${item.id - 100}` : `estación #${pad(item.id)}`;
      showToast(`La reserva de ${label} venció y quedó libre.`, 'error');
    });
  }
  if (changed) { saveMachineStates(); saveConsoleStates(); renderMachines(); renderConsoles(); }
  finishedSessions.forEach(item => showToast(`Terminó la sesión de ${item.kind === 'console' ? `PlayStation #${item.id - 100}` : `estación #${pad(item.id)}`}. Ya está disponible.`));
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

/* PWA: manifest e instalación del Service Worker. La instalación se gestiona desde el navegador, sin botón propio. */
function setupPWA() {
  if (!('serviceWorker' in navigator)) return;
  const registerWorker = () => navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
    registration.update().catch(() => {});
    console.info('Service Worker LevelUp registrado:', registration.scope);
  }).catch(error => console.error('No se pudo registrar el Service Worker:', error));
  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });
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
const ACCESSORY_ITEMS = {
  papas: { name: "Papas George's Chip", price: 5, priceLabel: 'Bs 5 / unidad' },
  nachos: { name: 'Nachos picantes', price: 3, priceLabel: 'Bs 3 / unidad' },
  chizitos: { name: 'Chizitos', price: 2, priceLabel: 'Bs 2 / unidad' },
  drink: { name: 'Gaseosa personal (Coca-Cola, Sprite o Fanta)', price: 3, priceLabel: 'Bs 3 / unidad' },
  maruchan: { name: 'Maruchan en vaso', price: 17, priceLabel: 'Bs 17 / vaso' },
  headset: { name: 'Cascos gamer', price: 10, priceLabel: 'Bs 10 / unidad' },
  mousepad: { name: 'Mousepad gamer', price: 5, priceLabel: 'Bs 5 / unidad' },
  controller: { name: 'Mando adicional para PlayStation', price: 6, priceLabel: 'Bs 6 / sesión' }
};
const ACCESSORY_ALIASES = {
  papas: ["papas", "papas george", "georges chip", "george's chip"],
  nachos: ['nachos', 'nachos picantes'],
  chizitos: ['chizitos', 'chizitos queso'],
  drink: ['gaseosa', 'gaseosa personal', 'coca cola', 'coca-cola', 'sprite', 'fanta'],
  maruchan: ['maruchan', 'maruchan vaso', 'maruchan en vaso'],
  headset: ['cascos', 'cascos gamer', 'audifonos', 'audifonos gamer', 'audífonos gamer'],
  mousepad: ['mousepad', 'mouse pad', 'mousepad gamer'],
  controller: ['mando', 'mando adicional', 'segundo mando', 'mando adicional para playstation']
};
function normalizeOrderText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function findAccessoryIdByName(value) {
  const query = normalizeOrderText(value);
  if (!query) return null;
  for (const [id, item] of Object.entries(ACCESSORY_ITEMS)) {
    const names = [item.name, ...(ACCESSORY_ALIASES[id] || [])];
    if (names.some(name => normalizeOrderText(name) === query)) return id;
  }
  return null;
}
function setQuickOrderStatus(message, isError = false) {
  const status = document.getElementById('quickOrderStatus');
  if (!status) return;
  status.textContent = String(message || '');
  status.classList.toggle('error', Boolean(isError));
}
function loadAccessoryQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.accessoryQueue) || '[]');
    state.accessoryQueue = Array.isArray(saved) ? saved.filter(item => ACCESSORY_ITEMS[item.id] && Number.isInteger(item.quantity) && item.quantity > 0).slice(0, 30) : [];
  } catch (_) { state.accessoryQueue = []; }
  renderAccessoryQueue();
}
function saveAccessoryQueue() {
  try { localStorage.setItem(STORAGE.accessoryQueue, JSON.stringify(state.accessoryQueue)); }
  catch (_) { showToast('No se pudo guardar el pedido en este navegador.', 'error'); }
}
function renderAccessoryQueue() {
  const list = document.getElementById('accessoryQueue');
  const count = document.getElementById('accessoryQueueCount');
  if (!list || !count) return;
  const total = state.accessoryQueue.reduce((sum, item) => sum + item.quantity, 0);
  const estimatedTotal = state.accessoryQueue.reduce((sum, item) => sum + (ACCESSORY_ITEMS[item.id].price * item.quantity), 0);
  const totalLabel = document.getElementById('accessoryQueueTotal');
  const clearButton = document.getElementById('clearAccessoryQueue');
  count.textContent = `${total} ${total === 1 ? 'artículo' : 'artículos'}`;
  if (totalLabel) totalLabel.textContent = `Total estimado: Bs ${estimatedTotal}`;
  if (clearButton) clearButton.hidden = state.accessoryQueue.length === 0;
  if (!state.accessoryQueue.length) {
    list.replaceChildren(createTextElement('p', 'accessory-empty', 'Todavía no agregaste productos. Pulsa «Agregar al pedido» en un producto.'));
    return;
  }
  const fragment = document.createDocumentFragment();
  state.accessoryQueue.forEach(item => {
    const product = ACCESSORY_ITEMS[item.id];
    const row = createTextElement('div', 'accessory-queue-row');
    const info = createTextElement('div', 'accessory-queue-info');
    const name = createTextElement('strong', 'accessory-queue-name', product.name);
    const detail = createTextElement('span', 'accessory-queue-detail', `${item.quantity} × ${product.priceLabel}`);
    info.append(name, detail);
    const lineTotal = createTextElement('strong', 'accessory-line-total', `Bs ${product.price * item.quantity}`);
    const quantity = createTextElement('div', 'accessory-quantity');
    const decrease = createTextElement('button', 'btn-tactil accessory-quantity-btn', '−');
    decrease.type = 'button';
    decrease.dataset.accessoryDecrease = item.id;
    decrease.setAttribute('aria-label', `Quitar una unidad de ${product.name}`);
    const quantityValue = createTextElement('span', 'accessory-quantity-value', String(item.quantity));
    const increase = createTextElement('button', 'btn-tactil accessory-quantity-btn', '+');
    increase.type = 'button';
    increase.dataset.accessoryIncrease = item.id;
    increase.setAttribute('aria-label', `Agregar una unidad de ${product.name}`);
    if (item.id === 'controller') {
      increase.disabled = true;
      increase.title = 'Solo se permite un segundo mando por sesión.';
    }
    quantity.append(decrease, quantityValue, increase);
    const remove = createTextElement('button', 'btn-tactil accessory-remove', 'Quitar');
    remove.type = 'button';
    remove.dataset.accessoryRemove = item.id;
    remove.setAttribute('aria-label', `Quitar ${product.name} del pedido`);
    row.append(info, lineTotal, quantity, remove);
    fragment.append(row);
  });
  list.replaceChildren(fragment);
}
function addAccessoryToQueue(id) {
  if (!ACCESSORY_ITEMS[id]) return;
  const existing = state.accessoryQueue.find(item => item.id === id);
  if (existing) {
    if (id === 'controller') {
      showToast('Solo puedes agregar un segundo mando por sesión.', 'error');
      return;
    }
    existing.quantity = Math.min(20, existing.quantity + 1);
  } else if (state.accessoryQueue.length < 12) state.accessoryQueue.push({ id, quantity: 1 });
  else { showToast('El pedido admite hasta 12 tipos de productos.', 'error'); return; }
  saveAccessoryQueue();
  renderAccessoryQueue();
  setQuickOrderStatus(`${ACCESSORY_ITEMS[id].name} agregado a tu pedido.`);
  showToast(`${ACCESSORY_ITEMS[id].name} agregado al pedido.`);
}
function changeAccessoryQuantity(id, change) {
  const item = state.accessoryQueue.find(entry => entry.id === id);
  if (!item) return;
  if (id === 'controller' && change > 0) return;
  item.quantity += change;
  if (item.quantity <= 0) state.accessoryQueue = state.accessoryQueue.filter(entry => entry.id !== id);
  else item.quantity = Math.min(20, item.quantity);
  saveAccessoryQueue();
  renderAccessoryQueue();
}
function removeAccessoryFromQueue(id) {
  state.accessoryQueue = state.accessoryQueue.filter(item => item.id !== id);
  saveAccessoryQueue();
  renderAccessoryQueue();
  setQuickOrderStatus(`${ACCESSORY_ITEMS[id]?.name || 'Producto'} quitado del pedido.`);
}
function clearAccessoryQueue() {
  state.accessoryQueue = [];
  saveAccessoryQueue();
  renderAccessoryQueue();
  setQuickOrderStatus('El pedido está vacío. Agrega productos desde el catálogo.');
}

function bindLevelUpEvents() {
  /* Limpieza previa: evita duplicar escuchadores si se ejecuta una segunda hidratación. */
  $document.off('.levelupNavigation .levelupCatalog .levelupFilters .levelupAccount .levelupBooking .levelupModal .levelupViewer .levelupContact .levelupConsoles .levelupAccordion .levelupValidation .levelupReservation .levelupAccessories');
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
  $document.on('change.levelupFilters', '#filterCategory', function () {
    state.currentFilter = 'all';
    updateQuickFilterButtons('all');
    updateCpuOptions();
  });
  $document.on('change.levelupFilters', '#filterCPU', updateGpuOptions);
  $document.on('change.levelupFilters', '#filterGPU', () => applyMachineFilters(true));
  $document.on('click.levelupCatalog', '#pcScrollPrev', () => scrollCarousel(-1));
  $document.on('click.levelupCatalog', '#pcScrollNext', () => scrollCarousel(1));
  $document.on('click.levelupCatalog', '[data-select-machine]', function () { openBooking(Number(this.dataset.selectMachine)); });
  $document.on('click.levelupConsoles', '[data-select-console]', function () { openConsoleBooking(Number(this.dataset.selectConsole)); });
  $document.on('click.levelupCatalog', '#retryCatalogButton', initializeCatalog);
  $document.on('click.levelupCatalog', '[data-retry-catalog]', initializeCatalog);
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
    showToast(`Bienvenido, ${name.split(' ')[0]}. Tu cuenta LevelUp está lista.`);
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

  /* Recarga local: registra el método elegido sin procesar cobros bancarios. */
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
  $document.on('change.levelupBooking', '#extraController', updateBookingTotal);
  $document.on('click.levelupBooking', '#confirmPayment', confirmSessionPayment);
  $document.on('click.levelupBooking', '#rechargeFromPayment', openRecharge);
  $document.on('click.levelupBooking', '#backToBooking', () => showBookingStep('booking'));
  $document.on('click.levelupBooking', '#cancelBooking, #cancelBookingPayment, #closeBooking', () => closeBooking(true));
  $document.on('click.levelupBooking', '#finishBooking', function () {
    state.selectedMachine = null;
    state.selectedResourceType = null;
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

  /* Lista de accesorios y bebidas: controles dinámicos mediante delegación de eventos. */
  $document.on('click.levelupAccessories', '[data-accessory-add]', function () {
    addAccessoryToQueue(this.dataset.accessoryAdd);
  });
  $document.on('click.levelupAccessories', '[data-accessory-remove]', function () {
    removeAccessoryFromQueue(this.dataset.accessoryRemove);
  });
  $document.on('click.levelupAccessories', '[data-accessory-increase]', function () {
    changeAccessoryQuantity(this.dataset.accessoryIncrease, 1);
  });
  $document.on('click.levelupAccessories', '[data-accessory-decrease]', function () {
    changeAccessoryQuantity(this.dataset.accessoryDecrease, -1);
  });
  $document.on('click.levelupAccessories', '#clearAccessoryQueue', clearAccessoryQueue);

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
  $document.on('submit.levelupReservation', '#formReserva', submitScheduledReservation);
  $document.on('input.levelupReservation blur.levelupReservation', '#clienteNombre', function () {
    const value = this.value.trim();
    setReservationFieldError('clienteNombre', 'clienteNombreError', !value ? 'Escribe tu nombre.' : value.length < 2 ? 'Debe tener al menos 2 caracteres.' : '');
  });
  $document.on('change.levelupReservation blur.levelupReservation', '#recursoSelect', function () {
    setReservationFieldError('recursoSelect', 'recursoSelectError', getReservationResource(this.value) ? '' : 'Selecciona un equipo válido.');
  });
  $document.on('change.levelupReservation blur.levelupReservation', '#fechaTurno', function () {
    const date = new Date(this.value);
    const valid = this.value && !Number.isNaN(date.getTime()) && date.getTime() >= getCurrentMinuteStart().getTime();
    setReservationFieldError('fechaTurno', 'fechaTurnoError', valid ? '' : 'Elige el minuto actual o un horario posterior; no se permiten fechas u horas pasadas.');
  });
  $document.on('change.levelupReservation', '#duracionTurno', function () {
    setReservationFieldError('duracionTurno', 'duracionTurnoError', RESERVATION_DURATIONS.includes(Number(this.value)) ? '' : 'Selecciona una duración válida.');
  });
  $document.on('click.levelupReservation', '[data-cancel-reservation]', function () {
    cancelScheduledReservation(this.dataset.cancelReservation);
  });
}
function updateQuickFilterButtons(filter) {
  $('[data-filter]').each(function () {
    const active = this.dataset.filter === filter;
    $(this).toggleClass('active', active).attr('aria-pressed', String(active));
  });
}
function setQuickFilter(filter) {
  state.currentFilter = filter;
  updateQuickFilterButtons(filter);
  // Los chips rápidos y los selectores dependientes no deben contradecirse.
  if (['basic', 'standard', 'premium'].includes(filter)) {
    $('#filterCategory').val(filter);
    updateCpuOptions();
    return;
  }
  $('#filterCategory').val('');
  fillSelect('filterCPU', 'Primero elige categoría', [], true);
  fillSelect('filterGPU', 'Primero elige procesador', [], true);
  applyMachineFilters(true);
}
function scrollCarousel(direction) {
  const carousel = document.getElementById('pcCarousel');
  if (!carousel) return;
  const amount = Math.max(250, Math.round(carousel.clientWidth * .78));
  carousel.scrollBy({ left: amount * direction, behavior: 'smooth' });
}
function continuePendingBooking() {
  if (state.pendingMachineId !== null) {
    const id = state.pendingMachineId;
    state.pendingMachineId = null;
    showView('computadoras');
    window.setTimeout(() => openBooking(id), 80);
    return;
  }
  if (state.pendingConsoleId !== null) {
    const id = state.pendingConsoleId;
    state.pendingConsoleId = null;
    showView('consolas');
    window.setTimeout(() => openConsoleBooking(id), 80);
  }
}
function hydrateLevelUp() {
  const shell = document.getElementById('appShell');
  if (!shell || shell.dataset.hidratado === 'true') return;
  bindLevelUpEvents();
  markHydrated();
  state.hydrationComplete = true;
  loadAccounts();
  loadScheduledReservations();
  renderScheduledReservations();
  loadAccessoryQueue();
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

/* Evita que la navegación inferior tape formularios cuando aparece el teclado móvil. */
if (window.visualViewport) {
  const updateKeyboardViewport = () => {
    const keyboardLikelyOpen = window.innerHeight - window.visualViewport.height > 140;
    document.body.classList.toggle('keyboard-open', keyboardLikelyOpen);
  };
  window.visualViewport.addEventListener('resize', updateKeyboardViewport);
  window.visualViewport.addEventListener('scroll', updateKeyboardViewport);
}
