'use strict';

/* LevelUp: SPA ligera, hidratación controlada y delegación de eventos. */
const LEVELUP_VIEWS = ['inicio', 'computadoras', 'consolas', 'cuenta', 'servicios', 'snacks', 'turnos', 'reservas', 'informacion', 'contacto'];
const VIEW_LABELS = { inicio: 'Inicio', computadoras: 'Computadoras', consolas: 'PlayStation', cuenta: 'Mi cuenta', servicios: 'Servicios', snacks: 'Snacks', turnos: 'Turnos', reservas: 'Reservas', informacion: 'Información', contacto: 'Contacto' };
const STORAGE = {
  accounts: 'levelup_accounts_v1',
  activePhone: 'levelup_active_phone_v1',
  machines: 'levelup_machine_states_v3',
  consoles: 'levelup_console_states_v1',
  pending: 'levelup_pending_actions_v1',
  scheduledReservations: 'levelup_scheduled_reservations_v1',
  accessoryQueue: 'levelup_accessory_queue_v1',
  activeSessions: 'levelup_active_sessions_v1'
};
const state = {
  machines: [], consoles: [], accounts: [], scheduledReservations: [], accessoryQueue: [], activeSessions: [], activeUser: null, currentFilter: 'all',
  activeScheduledSignature: '', activeScheduledReservationId: '', pendingScheduledReservationId: null,
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
  image.className = `${className}__image`;
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
function durationLabel(minutes) {
  const value = Number(minutes);
  if (value === 30) return '30 minutos';
  if (value === 60) return '1 hora';
  if (Number.isInteger(value) && value > 60 && value % 60 === 0) return `${value / 60} horas`;
  if (Number.isFinite(value) && value > 0) return `${Math.floor(value / 60)} h ${value % 60} min`;
  return 'Sin límite de tiempo';
}
function halfHourPrice(resource) {
  const rate = Number(resource?.price || 0);
  if (rate === 3) return 2;
  if (rate === 6) return 3;
  if (rate === 10) return 5;
  return Math.round((rate / 2) * 100) / 100;
}
function sessionTimePrice(resource, minutes) {
  return Number(minutes) === 30
    ? halfHourPrice(resource)
    : Math.round((Number(resource?.price || 0) * Number(minutes) / 60) * 100) / 100;
}
function resourceLabelForSession(resource, resourceType) {
  return resourceType === 'console'
    ? `PlayStation 5 · Consola #${Number(resource.id) - 100}`
    : `PC #${pad(resource.id)} · ${resource.label}`;
}
function parseElapsed(value) {
  const parts = String(value || '0').split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number.isFinite(parts[0]) ? parts[0] : 0;
}
function getMachine(id) { return state.machines.find(machine => machine.id === Number(id)) || null; }
function getConsole(id) { return state.consoles.find(consoleUnit => consoleUnit.id === Number(id)) || null; }
function resourceKeyForEquipment(resource) {
  if (!resource) return '';
  const kind = resource.kind === 'console' || state.consoles.includes(resource) ? 'console' : 'pc';
  return `${kind}:${Number(resource.id)}`;
}
function scheduledReservationEnd(item) {
  const start = new Date(item?.startsAt || '').getTime();
  const duration = Number(item?.durationHours);
  return Number.isFinite(start) && Number.isFinite(duration) && duration > 0
    ? start + duration * 60 * 60 * 1000 : NaN;
}
function getActiveScheduledReservation(resourceOrKey, now = Date.now()) {
  const resourceKey = typeof resourceOrKey === 'string' ? resourceOrKey : resourceKeyForEquipment(resourceOrKey);
  if (!resourceKey) return null;
  return state.scheduledReservations.find(item => {
    if (item.resourceKey !== resourceKey) return false;
    const start = new Date(item.startsAt).getTime();
    const end = scheduledReservationEnd(item);
    return Number.isFinite(start) && Number.isFinite(end)
      && ((start <= now && now < end) || item.id === state.activeScheduledReservationId);
  }) || null;
}
function getNextScheduledReservation(resourceOrKey,now=Date.now()){
  const resourceKey=typeof resourceOrKey==='string'?resourceOrKey:resourceKeyForEquipment(resourceOrKey);
  if(!resourceKey)return null;
  const local=state.scheduledReservations
    .filter(item=>item.resourceKey===resourceKey&&new Date(item.startsAt).getTime()>now)
    .sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime())[0];
  if(local)return local;
  const resource=typeof resourceOrKey==='string'?getReservationResource(resourceOrKey)?.item:resourceOrKey;
  const remoteStart=resource?.nextReservationAt?new Date(resource.nextReservationAt).getTime():NaN;
  return Number.isFinite(remoteStart)&&remoteStart>now?{resourceKey,startsAt:resource.nextReservationAt,remote:true}:null;
}
function isReserved(machine) { return Boolean(machine.reservationExpiresAt && machine.reservationExpiresAt > Date.now()); }
function isAvailable(machine) {
  return Boolean(machine.available && !isReserved(machine) && !getActiveScheduledReservation(machine));
}

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
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.classList.toggle('is-service-view', name === 'servicios');
    mainContent.classList.toggle('is-snacks-view', name === 'snacks');
    mainContent.classList.remove('is-service-expanded');
  }
  $('#mainContent').scrollTop(0);
  state.currentView = name;
  if (updateHistory && location.hash !== `#${name}`) {
    try { history.pushState({ levelupView: name }, '', `#${name}`); } catch (_) { location.hash = name; }
  }
  closeMobileMenu();
  if (name === 'computadoras') requestAnimationFrame(updateCarouselPosition);
  if (name === 'cuenta') renderAccount();
  if (name === 'snacks') renderAccessoryQueue();
  if (name === 'turnos') {
    populateReservationResources();
    setReservationDateMinimum();
  }
  if (name === 'reservas') {
    renderScheduledReservations();
    renderOccupancyChart();
  }
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

/* Catálogos compartidos de LevelUp: Supabase en línea y JSON local como respaldo offline. */
async function readResourcesFromSupabase(resourceType) {
  const client = window.levelupSupabase;
  if (!client) throw new Error('Cliente Supabase no disponible.');
  const { data, error } = await client
    .from('resources')
    .select('id,resource_type,resource_code,label,category,cpu,gpu,ram,storage,monitor,seat,hourly_rate,half_hour_rate,included_controllers,extra_controller_fee,features,image_path,is_active')
    .eq('resource_type', resourceType)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Supabase no devolvió recursos activos para ' + resourceType + '.');
  }
  return data;
}

async function loadProductsFromSupabase() {
  const client = window.levelupSupabase;
  if (!client) return;
  const { data, error } = await client
    .from('products')
    .select('id,name,category,price,unit_label,is_active')
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 8) {
    throw new Error('El catálogo de Supabase debe devolver los ocho productos de LevelUp.');
  }

  data.forEach(product => {
    const localItem = ACCESSORY_ITEMS[product.id];
    const price = Number(product.price);
    if (!localItem || !Number.isFinite(price) || price < 0) return;
    localItem.name = String(product.name);
    localItem.price = price;
    localItem.priceLabel = `Bs ${price} / ${String(product.unit_label || 'unidad')}`;

    const button = [...document.querySelectorAll('[data-accessory-add]')]
      .find(element => element.dataset.accessoryAdd === product.id);
    const card = button?.closest('.accessory-card');
    const title = card?.querySelector('h3');
    const amount = card?.querySelector('.accessory-copy > strong');
    const image = card?.querySelector('img');
    if (title) {
      title.textContent = localItem.name;
      title.title = localItem.name;
    }
    if (amount) {
      amount.replaceChildren(
        document.createTextNode(`Bs ${price} `),
        createTextElement('small', '', `/ ${String(product.unit_label || 'unidad')}`)
      );
    }
    if (image) image.alt = localItem.name;
  });
  console.info('Catálogo de productos cargado desde Supabase:', data.length);
}

async function loadMachineCatalog() {
  let catalog;
  try {
    const rows = await readResourcesFromSupabase('pc');
    catalog = rows.map(row => ({
      id: row.id, type: row.category, label: row.label, price: row.hourly_rate,
      cpu: row.cpu, gpu: row.gpu, ram: row.ram, storage: row.storage,
      monitor: row.monitor, seat: row.seat, features: row.features,
      image: row.image_path, imageAlt: `PC ${row.label} de LevelUp`,
      available: true, elapsed: ''
    }));
    console.info('Catálogo de computadoras cargado desde Supabase:', catalog.length);
  } catch (databaseError) {
    console.warn('Supabase de PC no disponible; se usará el catálogo JSON local:', databaseError);
    catalog = await readCatalogJSON('./data/computadoras.json?v=15', 'Catálogo de computadoras');
  }
  if (!Array.isArray(catalog) || catalog.length < 15) throw new Error('El catálogo debe contener al menos 15 estaciones.');
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
function restoreMachineStates(){state.machines.forEach(machine=>{machine.available=true;machine.sessionStartedAt=null;machine.sessionEndsAt=null;machine.reservationExpiresAt=null;});}
function saveMachineStates(){return false;}

async function loadConsoleCatalog() {
  let catalog;
  try {
    const rows = await readResourcesFromSupabase('console');
    catalog = rows.map(row => ({
      id: row.id, label: row.label, price: row.hourly_rate,
      priceNote: `Tarifa LevelUp · Bs ${row.hourly_rate} por hora`,
      controllersIncluded: row.included_controllers,
      extraControllerFee: row.extra_controller_fee,
      seat: row.seat, features: row.features,
      image: row.image_path, imageAlt: `PlayStation 5 número ${Number(row.id) - 100}`,
      available: true, elapsed: ''
    }));
    console.info('Catálogo de PlayStation cargado desde Supabase:', catalog.length);
  } catch (databaseError) {
    console.warn('Supabase de PlayStation no disponible; se usará el catálogo JSON local:', databaseError);
    catalog = await readCatalogJSON('./data/consolas.json?v=15', 'Catálogo PlayStation');
  }
  if (!Array.isArray(catalog) || catalog.length !== 4) throw new Error('El catálogo debe contener exactamente cuatro consolas.');
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
function restoreConsoleStates(){state.consoles.forEach(machine=>{machine.available=true;machine.sessionStartedAt=null;machine.sessionEndsAt=null;machine.reservationExpiresAt=null;});}
function saveConsoleStates(){return false;}
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
    } else if (getActiveScheduledReservation(consoleUnit)) {
      const scheduled = getActiveScheduledReservation(consoleUnit);
      action.append(createTextElement('div', 'pc-usage', `Turno reservado hasta ${reservationDateLabel(new Date(scheduledReservationEnd(scheduled)).toISOString())}`));
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
function cardStatus(machine){
  if(isReserved(machine))return {label:'Apartada',className:'reserved'};
  if(getActiveScheduledReservation(machine))return {label:'Turno reservado',className:'reserved'};
  if(isAvailable(machine)){
    const next=getNextScheduledReservation(machine);
    return {label:next?'Disponible · próximo turno':'Disponible',className:'available'};
  }
  return {label:'Ocupada',className:'occupied'};
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
    } else if (getActiveScheduledReservation(machine)) {
      const scheduled = getActiveScheduledReservation(machine);
      foot.append(createTextElement('div', 'pc-usage', `Turno reservado hasta ${reservationDateLabel(new Date(scheduledReservationEnd(scheduled)).toISOString())}`));
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

async function initializeCatalog(){
  $('#catalogError, #consoleCatalogError').prop('hidden',true);$('#catalogStatus').text('Cargando catálogo…');
  setCatalogLoadingState('pcGrid','Preparando las estaciones…','Consultando el catálogo de Supabase.');
  setCatalogLoadingState('consoleGrid','Preparando las consolas…','Consultando el catálogo de Supabase.');
  const [machinesResult,consolesResult]=await Promise.allSettled([loadMachineCatalog(),loadConsoleCatalog()]);
  await loadProductsFromSupabase().catch(error=>console.warn('No se pudo leer el catálogo de productos de Supabase; las operaciones seguirán validándose con precios de servidor:',error));
  if(machinesResult.status==='fulfilled'){
    fillSelect('filterCategory','Todas las categorías',['basic','standard','premium'],false);
    const labels={basic:'Básica',standard:'Estándar',premium:'Premium'};
    [...document.getElementById('filterCategory').options].forEach(option=>{if(labels[option.value])option.textContent=labels[option.value];});
    fillSelect('filterCPU','Primero elige categoría',[],true);fillSelect('filterGPU','Primero elige procesador',[],true);
    renderMachines();$('#catalogStatus').text(state.machines.length+' estaciones listas');
  }else{
    const error=machinesResult.reason;console.error('Error en catálogo de computadoras:',error);state.machines=[];
    document.getElementById('pcGrid')?.replaceChildren();$('#catalogStatus').text('No se pudo cargar el catálogo de computadoras');
    $('#catalogErrorText').text(error?.message||'Comprueba la conexión con Supabase.');$('#catalogError').prop('hidden',false);updateStats();
  }
  if(consolesResult.status==='fulfilled'){renderConsoles();$('#consoleCatalogError').prop('hidden',true);}
  else{const error=consolesResult.reason;console.error('Error en catálogo de consolas:',error);state.consoles=[];
    document.getElementById('consoleGrid')?.replaceChildren();$('#consoleCatalogErrorText').text(error?.message||'Comprueba la conexión con Supabase.');$('#consoleCatalogError').prop('hidden',false);}
  populateReservationResources();setReservationDateMinimum();renderScheduledReservations();
  state.activeScheduledSignature=activeScheduledSignature();
  try{await levelupRefreshResourceAvailability();}catch(error){console.warn('No se pudo consultar disponibilidad remota:',error);}
  startSessionTicker();
}

/* Reservas futuras de turno: ejercicio local de validación y persistencia, separado del apartado de reserva inmediata. */
const RESERVATION_DURATIONS = [1, 2, 3, 5, 8];
function loadScheduledReservations(){state.scheduledReservations=[];renderScheduledReservations();}
function saveScheduledReservations(){return false;}
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
function reservationResourceStateLabel(resource) {
  const now = Date.now();
  if (isReserved(resource)) return `Apartada hasta ${reservationDateLabel(new Date(resource.reservationExpiresAt).toISOString())}`;
  const activeScheduled = getActiveScheduledReservation(resource, now);
  if (activeScheduled) return `Turno reservado hasta ${reservationDateLabel(new Date(scheduledReservationEnd(activeScheduled)).toISOString())}`;
  if (!resource.available) {
    const busyUntil = Number(resource.sessionEndsAt || 0);
    if (busyUntil > now) return `Ocupada · libre ${reservationDateLabel(new Date(busyUntil).toISOString())}`;
    return 'Ocupada · sin hora de liberación';
  }
  const next = getNextScheduledReservation(resource, now);
  if (next) return `Disponible · próximo turno ${reservationDateLabel(next.startsAt)}`;
  return 'Disponible';
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
    const option = new Option(`PC #${pad(machine.id)} · ${machine.label} · ${money(machine.price)}/h — ${reservationResourceStateLabel(machine)}`, `pc:${machine.id}`);
    const busyUntil = Number(machine.sessionEndsAt || 0);
    option.disabled = !machine.available && !isReserved(machine) && !(busyUntil > Date.now());
    machinesGroup.append(option);
  });
  const consolesGroup = document.createElement('optgroup');
  consolesGroup.label = 'PlayStation 5';
  state.consoles.forEach(consoleUnit => {
    const option = new Option(`${consoleUnit.label} · ${money(consoleUnit.price)}/h — ${reservationResourceStateLabel(consoleUnit)}`, `console:${consoleUnit.id}`);
    const busyUntil = Number(consoleUnit.sessionEndsAt || 0);
    option.disabled = !consoleUnit.available && !isReserved(consoleUnit) && !(busyUntil > Date.now());
    consolesGroup.append(option);
  });
  if (machinesGroup.children.length) select.append(machinesGroup);
  if (consolesGroup.children.length) select.append(consolesGroup);
  select.disabled = !machinesGroup.children.length && !consolesGroup.children.length;
  if ([...select.options].some(option => option.value === previous && !option.disabled)) select.value = previous;
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
    fragment.append(createTextElement('li', 'reservation-empty', 'Todavía no tienes turnos reservados.'));
  } else {
    state.scheduledReservations
      .slice()
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
      .forEach(item => {
        const row = createTextElement('li', 'reservation-item');
        const content = document.createElement('div');
        const startAt = new Date(item.startsAt).getTime();
        const endAt = scheduledReservationEnd(item);
        const now = Date.now();
        const isActiveSlot = startAt <= now && now < endAt;
        const isStarting = item.id === state.activeScheduledReservationId;
        content.append(
          createTextElement('strong', '', item.name),
          createTextElement('span', '', item.resourceLabel),
          createTextElement('small', '', `Turno: ${reservationDateLabel(item.startsAt)} · ${item.durationHours} h`),
          createTextElement('small', `reservation-state${isActiveSlot ? ' ready' : ''}`, isStarting ? 'Iniciando sesión…' : isActiveSlot ? 'Horario activo · listo para iniciar' : `Programado · ${reservationDateLabel(item.startsAt)}`)
        );
        const actions = createTextElement('div', 'reservation-actions');
        if (isActiveSlot || isStarting) {
          const begin = createTextElement('button', 'reservation-start btn-tactil', isStarting ? 'Iniciando…' : 'Iniciar turno');
          begin.type = 'button';
          begin.dataset.startReservation = item.id;
          begin.dataset.hidratado = 'true';
          begin.disabled = isStarting;
          begin.setAttribute('aria-label', `Iniciar turno de ${item.name} en ${item.resourceLabel}`);
          actions.append(begin);
        }
        const cancel = createTextElement('button', 'reservation-cancel btn-tactil', 'Cancelar');
        cancel.type = 'button';
        cancel.dataset.cancelReservation = item.id;
        cancel.dataset.hidratado = 'true';
        cancel.disabled = isStarting;
        cancel.setAttribute('aria-label', `Cancelar turno de ${item.name}`);
        actions.append(cancel);
        row.append(content, actions);
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
    : name.length < 2 ? 'El nombre debe tener al menos 2 caracteres.'
    : containsBlacklistedTerms(name) ? 'Evita palabras ofensivas o insultos.' : '';
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
function normalizeReservationName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-BO').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const SESSION_DURATIONS_MINUTES = [30, 60, 120, 180, 300, 480];
function configureSessionDurationOptions(maxMinutes = null, selectedMinutes = 60) {
  const select = document.getElementById('sessionHours');
  if (!select) return;
  const options = SESSION_DURATIONS_MINUTES.filter(minutes => maxMinutes === null || minutes <= maxMinutes);
  select.replaceChildren(...options.map(minutes => new Option(durationLabel(minutes), String(minutes))));
  const preferred = Number(selectedMinutes);
  select.value = options.includes(preferred) ? String(preferred) : String(options.at(-1) || 60);
}
function beginScheduledReservation(id) {
  const item = state.scheduledReservations.find(entry => entry.id === id);
  if (!item) { showToast('Ese turno ya no está disponible.', 'error'); return; }
  const now = Date.now();
  const startAt = new Date(item.startsAt).getTime();
  const slotEnd = scheduledReservationEnd(item);
  if (!Number.isFinite(startAt) || !Number.isFinite(slotEnd)) {
    showToast('El horario de este turno no es válido.', 'error'); return;
  }
  if (now < startAt) {
    showToast(`Tu turno comienza ${reservationDateLabel(item.startsAt)}.`); return;
  }
  if (now >= slotEnd) {
    showToast('El horario reservado ya terminó.', 'error');
    cancelScheduledReservation(id);
    return;
  }
  const resource = getReservationResource(item.resourceKey);
  if (!resource) { showToast('No se encontró el equipo de esta reserva.', 'error'); return; }
  if (isReserved(resource.item)) {
    showToast('Este equipo está en otro proceso de contratación. Inténtalo de nuevo cuando termine.', 'error'); return;
  }
  const busyUntil = Number(resource.item.sessionEndsAt || 0);
  if (!resource.item.available && busyUntil > now) {
    showToast(`El equipo sigue ocupado hasta ${reservationDateLabel(new Date(busyUntil).toISOString())}.`, 'error'); return;
  }
  if (!resource.item.available && !busyUntil) {
    showToast('El equipo sigue ocupado y no tiene una hora de liberación confirmada.', 'error'); return;
  }
  if (!state.activeUser) {
    state.pendingScheduledReservationId = id;
    showView('cuenta');
    showToast(`Inicia sesión o crea la cuenta de ${item.name} para comenzar el turno.`);
    return;
  }
  const reservedName = normalizeReservationName(item.name);
  const accountName = normalizeReservationName(state.activeUser.name);
  if (reservedName && accountName && !accountName.includes(reservedName) && !reservedName.includes(accountName)) {
    state.pendingScheduledReservationId = id;
    showView('cuenta');
    showToast(`Este turno está a nombre de ${item.name}. Cambia a la cuenta de esa persona para continuar.`, 'error');
    return;
  }

  state.pendingScheduledReservationId = null;
  state.selectedMachine = resource.item;
  state.selectedResourceType = resource.key.startsWith('console:') ? 'console' : 'pc';
  state.activeScheduledReservationId = item.id;
  state.booking = null;
  const isConsole = state.selectedResourceType === 'console';
  const title = isConsole ? `PLAYSTATION 5 · CONSOLA #${resource.item.id - 100}` : `ESTACIÓN #${pad(resource.item.id)} · ${resource.item.label}`;
  const spec = isConsole
    ? `${resource.item.controllersIncluded} mando incluido · ${resource.item.seat}`
    : `${resource.item.cpu} · ${resource.item.gpu} · ${resource.item.ram} · ${resource.item.seat}`;
  $('#selectedMachineName').text(title);
  $('#selectedMachineSpecs').text(spec);
  $('#selectedMachineRate').text(`${money(resource.item.price)}/h`);
  $('#customerName').val(state.activeUser.name);
  $('#customerPhone').val(state.activeUser.phone);
  configureSessionDurationOptions(item.durationHours * 60, item.durationHours * 60);
  $('#sessionMode').val('fixed').prop('disabled', true);
  $('#sessionModeField').prop('hidden', true);
  $('#sessionModeHelp').text('El horario reservado tiene una duración definida.');
  $('#scheduledBookingConflict').text('').prop('hidden', true);
  $('#extraControllerField').prop('hidden', !isConsole);
  $('#extraController').prop('checked', false);
  $('#bookingCostBreakdown').prop('hidden', !isConsole);
  $('#bookingDescription').text(`Turno reservado para ${item.resourceLabel}. Confirma el pago para iniciar la sesión.`);
  $('#bookingHoldNotice').prop('hidden', true);
  setFieldError('customerName', 'customerNameError', '');
  setFieldError('customerPhone', 'customerPhoneError', '');
  updateBookingTotal();
  showBookingStep('booking');
  showView(isConsole ? 'consolas' : 'computadoras');
  renderScheduledReservations();
  openModal('#bookingModal');
}
function findScheduledReservationOverlap(resourceKey, startAt, endAt, exceptId = '') {
  return state.scheduledReservations.find(item => {
    if (item.resourceKey !== resourceKey || item.id === exceptId) return false;
    const existingStart = new Date(item.startsAt).getTime();
    const existingEnd = scheduledReservationEnd(item);
    return Number.isFinite(existingStart) && Number.isFinite(existingEnd)
      && startAt < existingEnd && endAt > existingStart;
  }) || null;
}
function reservationOverlaps(resourceKey, startAt, endAt) {
  return Boolean(findScheduledReservationOverlap(resourceKey, startAt, endAt));
}
function activeScheduledSignature(now = Date.now()) {
  return state.scheduledReservations
    .filter(item => {
      const start = new Date(item.startsAt).getTime();
      const end = scheduledReservationEnd(item);
      return Number.isFinite(start) && Number.isFinite(end)
        && ((start <= now && now < end) || item.id === state.activeScheduledReservationId);
    })
    .map(item => `${item.resourceKey}:${item.id}`).sort().join('|');
}
async function levelupRequireClient(){const c=window.levelupSupabase;if(!c||!state.activeUser?.id)throw new Error('Inicia sesión para operar con Supabase.');return c;}
function levelupResourceId(key){const m=/^(pc|console):(\d+)$/.exec(String(key||''));if(!m)throw new Error('Equipo inválido.');return Number(m[2]);}

const LEVELUP_QUEUE_DATABASE='levelup-pending-operations-v1';
const LEVELUP_QUEUE_STORE='operations';
function levelupOpenQueueDatabase(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error('Este navegador no permite guardar operaciones pendientes.'));return;}
    const request=window.indexedDB.open(LEVELUP_QUEUE_DATABASE,1);
    request.onupgradeneeded=()=>{
      const database=request.result;
      if(!database.objectStoreNames.contains(LEVELUP_QUEUE_STORE)){
        const store=database.createObjectStore(LEVELUP_QUEUE_STORE,{keyPath:'id'});
        store.createIndex('user_id','user_id',{unique:false});
        store.createIndex('status','status',{unique:false});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('No se pudo abrir la cola local.'));
    request.onblocked=()=>reject(new Error('Cierra otra pestaña de LevelUp y vuelve a intentarlo.'));
  });
}
async function levelupQueueStore(record){
  const database=await levelupOpenQueueDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(LEVELUP_QUEUE_STORE,'readwrite');
    transaction.objectStore(LEVELUP_QUEUE_STORE).put(record);
    transaction.oncomplete=()=>{database.close();resolve(true);};
    transaction.onerror=()=>{const error=transaction.error;database.close();reject(error||new Error('No se pudo guardar la operación pendiente.'));};
    transaction.onabort=()=>{const error=transaction.error;database.close();reject(error||new Error('Se canceló el guardado de la operación pendiente.'));};
  });
}
async function levelupQueueReadAll(){
  const database=await levelupOpenQueueDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(LEVELUP_QUEUE_STORE,'readonly');
    const request=transaction.objectStore(LEVELUP_QUEUE_STORE).getAll();
    request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);
    request.onerror=()=>reject(request.error||new Error('No se pudo leer la cola local.'));
    transaction.oncomplete=()=>database.close();
    transaction.onerror=()=>{const error=transaction.error;database.close();reject(error||new Error('No se pudo leer la cola local.'));};
  });
}
async function levelupQueueDelete(id){
  const database=await levelupOpenQueueDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(LEVELUP_QUEUE_STORE,'readwrite');
    transaction.objectStore(LEVELUP_QUEUE_STORE).delete(id);
    transaction.oncomplete=()=>{database.close();resolve(true);};
    transaction.onerror=()=>{const error=transaction.error;database.close();reject(error||new Error('No se pudo retirar la operación.'));};
  });
}
function levelupIsTransportFailure(error){
  const message=String(error?.message||error||'');
  return navigator.onLine===false
    || error?.name==='TypeError'
    || /failed to fetch|network error|network request|offline|timed? ?out|connection (?:lost|closed|refused)|failed to send a request/i.test(message);
}
async function levelupEnqueueOffline(type,payload,requestKey){
  if(!state.activeUser?.id)throw new Error('Inicia sesión para guardar una operación pendiente.');
  if(!['reservation_create','order_create','recharge_request'].includes(type))throw new Error('Esta operación no admite cola offline.');
  const record={
    id:requestKey,user_id:state.activeUser.id,type,payload,
    status:'pending',created_at:new Date().toISOString(),last_error:''
  };
  await levelupQueueStore(record);
  await levelupRenderOfflineQueue();
  return record;
}
async function levelupRenderOfflineQueue(){
  const panel=document.getElementById('offlinePendingPanel');
  const list=document.getElementById('offlinePendingList');
  if(!panel||!list)return;
  if(!state.activeUser?.id){panel.hidden=true;list.replaceChildren();return;}
  try{
    const all=await levelupQueueReadAll();
    const records=all.filter(item=>item.user_id===state.activeUser.id)
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    panel.hidden=records.length===0;
    list.replaceChildren();
    records.forEach(record=>{
      const item=createTextElement('article','recharge-request-item');
      const copy=createTextElement('div','recharge-request-item__copy');
      let title='Operación pendiente';
      let detail='';
      if(record.type==='reservation_create'){
        title='Reserva · PC/PlayStation '+record.payload.p_resource_id;
        detail=new Date(record.payload.p_starts_at).toLocaleString('es-BO')+' · '+record.payload.p_duration_hours+' h';
      }else if(record.type==='order_create'){
        title='Pedido de snacks y accesorios';
        detail=(record.payload.p_items||[]).map(entry=>entry.quantity+' × '+entry.product_id).join(', ');
      }else if(record.type==='recharge_request'){
        title='Solicitud de recarga · '+money(record.payload.p_amount);
        detail='Método: '+record.payload.p_payment_method;
      }
      copy.append(createTextElement('strong','',title));
      copy.append(createTextElement('small','',detail));
      if(record.status==='failed')copy.append(createTextElement('small','',record.last_error||'El servidor no aceptó la operación.'));
      const status=createTextElement('span','recharge-request-item__status',
        record.status==='failed'?'No enviada': 'Pendiente de sincronizar');
      status.dataset.status=record.status==='failed'?'rejected':'pending';
      item.append(copy,status);
      if(record.status==='failed'){
        const actions=createTextElement('div','admin-list-item__actions');
        const retry=createTextElement('button','secondary-btn','Reintentar');
        retry.type='button';retry.dataset.retryOffline=record.id;retry.dataset.hidratado='true';
        const remove=createTextElement('button','secondary-btn','Quitar');
        remove.type='button';remove.dataset.removeOffline=record.id;remove.dataset.hidratado='true';
        actions.append(retry,remove);item.append(actions);
      }
      list.append(item);
    });
  }catch(error){
    console.warn('No se pudo mostrar la cola de operaciones pendientes:',error);
    panel.hidden=false;
    list.replaceChildren(createTextElement('p','admin-empty','No se pudo consultar la cola local de operaciones.'));
  }
}
async function levelupProcessPendingTransactions(){
  if(!state.activeUser?.id||!window.levelupSupabase||navigator.onLine===false||state.levelupQueueSyncing)return;
  state.levelupQueueSyncing=true;
  let synced=0;
  try{
    const records=await levelupQueueReadAll();
    for(const record of records){
      if(record.user_id!==state.activeUser.id||record.status!=='pending')continue;
      if(navigator.onLine===false)break;
      try{
        const client=await levelupRequireClient();
        let result;
        if(record.type==='reservation_create'){
          result=await client.rpc('levelup_create_scheduled_reservation',record.payload);
        }else if(record.type==='order_create'){
          result=await client.rpc('levelup_create_order',record.payload);
        }else if(record.type==='recharge_request'){
          result=await client.rpc('levelup_create_recharge_request',record.payload);
        }else{
          throw new Error('Tipo de operación desconocido.');
        }
        if(result.error)throw result.error;
        await levelupQueueDelete(record.id);
        synced++;
      }catch(error){
        if(levelupIsTransportFailure(error))break;
        await levelupQueueStore({...record,status:'failed',last_error:String(error.message||'El servidor no aceptó la operación.')});
      }
    }
    await levelupRenderOfflineQueue();
    if(synced>0){
      await levelupRefreshWalletAndSessions();
      await levelupLoadMyScheduledReservations();
      await levelupLoadMyRechargeRequests();
      await levelupRefreshResourceAvailability();
      showToast(synced+' operación(es) sincronizada(s) con Supabase.');
    }
  }catch(error){
    console.warn('No se pudo sincronizar la cola offline:',error);
  }finally{
    state.levelupQueueSyncing=false;
    await levelupRenderOfflineQueue();
  }
}
async function levelupRetryOfflineOperation(id){
  const all=await levelupQueueReadAll();
  const record=all.find(item=>item.id===id&&item.user_id===state.activeUser?.id);
  if(!record)return;
  await levelupQueueStore({...record,status:'pending',last_error:''});
  await levelupRenderOfflineQueue();
  await levelupProcessPendingTransactions();
}

async function levelupRefreshWalletAndSessions(){
  const client=await levelupRequireClient();
  const sync=await client.rpc('levelup_sync_my_sessions');
  if(sync.error)throw sync.error;
  const q=await Promise.all([
    client.from('profiles').select('id,full_name,phone,balance,role').eq('id',state.activeUser.id).single(),
    client.from('sessions').select('*').eq('customer_id',state.activeUser.id).eq('status','active').order('started_at',{ascending:false}),
    client.from('wallet_transactions').select('*').eq('customer_id',state.activeUser.id).order('created_at',{ascending:false}).limit(30),
    client.from('orders').select('id,session_id,total_amount,status,created_at,order_items(product_id,item_name,quantity,unit_price,line_total)').eq('customer_id',state.activeUser.id).order('created_at',{ascending:false}).limit(20),
    client.from('recharge_requests').select('id,amount,payment_method,status,created_at').eq('customer_id',state.activeUser.id).order('created_at',{ascending:false}).limit(12)
  ]);
  q.forEach(item=>{if(item.error)throw item.error;});
  const profile=q[0].data;
  state.activeUser.name=String(profile.full_name||state.activeUser.name);
  state.activeUser.phone=localLevelUpPhone(profile.phone||state.activeUser.phone);
  state.activeUser.role=profile.role;
  state.activeUser.balance=Number(profile.balance||0);
  state.activeSessions=q[1].data.map(row=>{
    const key=row.resource_id>=101?'console:'+row.resource_id:'pc:'+row.resource_id;
    const found=getReservationResource(key);
    return {id:row.id,resourceKey:key,resourceType:row.resource_id>=101?'console':'pc',machine:row.resource_id,
      resourceLabel:found?.label||('Equipo '+row.resource_id),ownerPhone:state.activeUser.phone,ownerName:state.activeUser.name,
      billingMode:row.billing_mode,startedAt:new Date(row.started_at).getTime(),
      endsAt:row.planned_end_at?new Date(row.planned_end_at).getTime():null,
      durationMinutes:row.planned_end_at?Math.round((new Date(row.planned_end_at)-new Date(row.started_at))/60000):null,
      ratePerHour:Number(row.hourly_rate_snapshot),halfHourRate:found?.item?.halfHourRate||0,
      timeAmount:Number(row.time_amount),snacksTotal:Number(row.snacks_total),extraController:row.extra_controller,
      paidUntil:row.paid_until?new Date(row.paid_until).getTime():null,nextChargeAt:row.next_charge_at?new Date(row.next_charge_at).getTime():null,
      orders:q[3].data.filter(order=>order.session_id===row.id).map(order=>({id:order.id,date:order.created_at,total:Number(order.total_amount),
        items:order.order_items.map(item=>({id:item.product_id,name:item.item_name,quantity:item.quantity,price:Number(item.unit_price)}))}))
    };
  });
  state.activeUser.history=q[2].data.map(row=>({type:row.reason,amount:row.direction==='credit'?Number(row.amount):-Number(row.amount),date:row.created_at,method:row.payment_method,details:row.reason}));
  levelupRenderMyRechargeRequests(q[4].data||[]);
  renderMachines();renderConsoles();renderAccount();updatePaymentState();
  if(['admin','staff'].includes(state.activeUser.role))await levelupLoadAdminDashboard();
  return sync.data;
}
async function levelupLoadMyScheduledReservations(){
  const client=await levelupRequireClient();
  const result=await client.from('reservations').select('*').eq('customer_id',state.activeUser.id).in('status',['pending','confirmed','active']).order('starts_at');
  if(result.error)throw result.error;
  state.scheduledReservations=(result.data||[]).map(row=>{
    const key=row.resource_id>=101?'console:'+row.resource_id:'pc:'+row.resource_id;
    const resource=getReservationResource(key);
    return {id:row.id,name:row.customer_name,resourceKey:key,resourceLabel:resource?.label||('Equipo '+row.resource_id),startsAt:row.starts_at,durationHours:row.duration_hours,createdAt:row.created_at,db:true};
  });
  renderScheduledReservations();populateReservationResources();renderMachines();renderConsoles();
}

function levelupRequestKey(stateKey) {
  if (state[stateKey]) return state[stateKey];
  let value = '';
  try { value = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : ''; } catch (_) {}
  if (!value) value = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
  state[stateKey] = value;
  return value;
}
async function levelupRefreshResourceAvailability() {
  const client = window.levelupSupabase;
  if (!client) return [];
  const result = await client.rpc('levelup_resource_availability');
  if (result.error) throw result.error;
  (result.data || []).forEach(row => {
    const resource = Number(row.resource_id) >= 101 ? getConsole(Number(row.resource_id)) : getMachine(Number(row.resource_id));
    if (!resource) return;
    resource.available = Boolean(row.available_now);
    const sessionEnd = row.current_session_ends_at ? new Date(row.current_session_ends_at).getTime() : 0;
    const reservationEnd = row.current_reservation_ends_at ? new Date(row.current_reservation_ends_at).getTime() : 0;
    resource.sessionEndsAt = sessionEnd > Date.now() ? sessionEnd : reservationEnd > Date.now() ? reservationEnd : null;
    resource.reservationExpiresAt = null;
    if (!resource.available && !resource.sessionEndsAt && !resource.sessionStartedAt) resource.sessionStartedAt = Date.now();
    if (resource.available) resource.sessionStartedAt = null;
    resource.nextReservationAt = row.next_reservation_starts_at || null;
  });
  renderMachines();
  renderConsoles();
  return result.data || [];
}
function levelupRenderMyRechargeRequests(rows) {
  const container = document.getElementById('myRechargeRequests');
  if (!container) return;
  container.replaceChildren();
  if (!rows || !rows.length) {
    container.append(createTextElement('p','history-empty','Todavía no tienes solicitudes de recarga.'));
    return;
  }
  rows.forEach(row => {
    const item=createTextElement('article','recharge-request-item');
    const copy=createTextElement('div','recharge-request-item__copy');
    const date=new Date(row.created_at);
    const when=Number.isNaN(date.getTime())?'Fecha no disponible':date.toLocaleString('es-BO',{dateStyle:'short',timeStyle:'short'});
    copy.append(createTextElement('strong','',money(row.amount)+' · '+row.payment_method));
    copy.append(createTextElement('small','',when));
    const status=createTextElement('span','recharge-request-item__status',
      row.status==='approved'?'Aprobada':row.status==='rejected'?'Rechazada':'Pendiente de aprobación');
    status.dataset.status=row.status;
    item.append(copy,status);
    container.append(item);
  });
}
async function levelupLoadMyRechargeRequests() {
  if (!state.activeUser?.id) return;
  const client=await levelupRequireClient();
  const result=await client.from('recharge_requests')
    .select('id,amount,payment_method,status,created_at')
    .eq('customer_id',state.activeUser.id)
    .order('created_at',{ascending:false}).limit(12);
  if(result.error)throw result.error;
  levelupRenderMyRechargeRequests(result.data||[]);
}
function levelupAdminEmpty(message) {
  return createTextElement('p','admin-empty',message);
}
async function levelupLoadAdminDashboard() {
  const panel=document.getElementById('adminToolsPanel');
  if(!panel)return;
  const user=state.activeUser;
  const allowed=Boolean(user&&['admin','staff'].includes(user.role));
  panel.hidden=!allowed;
  if(!allowed)return;
  const client=await levelupRequireClient();
  const queries=await Promise.all([
    client.from('recharge_requests').select('id,customer_id,amount,payment_method,status,created_at').order('created_at',{ascending:false}).limit(25),
    client.from('profiles').select('id,full_name,phone,balance,role').order('created_at',{ascending:false}).limit(100),
    client.from('sessions').select('id,customer_id,resource_id,billing_mode,started_at,planned_end_at,time_amount,snacks_total,status').eq('status','active').order('started_at',{ascending:false}).limit(50),
    client.from('reservations').select('id,customer_id,customer_name,resource_id,starts_at,ends_at,duration_hours,status').in('status',['pending','confirmed','active']).order('starts_at').limit(50),
    client.from('orders').select('id,customer_id,session_id,total_amount,status,created_at,order_items(item_name,quantity,line_total)').order('created_at',{ascending:false}).limit(12)
  ]);
  queries.forEach(q=>{if(q.error)throw q.error;});
  const requests=queries[0].data||[],profiles=queries[1].data||[],sessions=queries[2].data||[],reservations=queries[3].data||[],orders=queries[4].data||[];
  const profileMap=new Map(profiles.map(p=>[p.id,p]));
  const pending=requests.filter(r=>r.status==='pending').length;
  const summary=document.getElementById('adminSummary');
  if(summary){
    summary.replaceChildren();
    [['Clientes',profiles.length],['Recargas pendientes',pending],['Sesiones activas',sessions.length],['Reservas activas',reservations.length]].forEach(pair=>{
      const box=createTextElement('div','admin-summary__item');
      box.append(createTextElement('strong','',String(pair[1])),createTextElement('small','',pair[0]));
      summary.append(box);
    });
  }
  const rechargeList=document.getElementById('adminRechargeRequests');
  if(rechargeList){
    rechargeList.replaceChildren();
    if(!requests.length)rechargeList.append(levelupAdminEmpty('No hay solicitudes de recarga.'));
    requests.forEach(row=>{
      const profile=profileMap.get(row.customer_id)||{};
      const item=createTextElement('article','admin-list-item');
      const copy=createTextElement('div','admin-list-item__copy');
      const when=new Date(row.created_at);
      copy.append(createTextElement('strong','',money(row.amount)+' · '+row.payment_method));
      copy.append(createTextElement('small','',(profile.full_name||'Cliente')+' · '+(profile.phone||'Sin celular')));
      copy.append(createTextElement('small','',when.toLocaleString('es-BO')+' · '+(row.status==='approved'?'Aprobada':row.status==='rejected'?'Rechazada':'Pendiente')));
      item.append(copy);
      if(row.status==='pending'){
        const actions=createTextElement('div','admin-list-item__actions');
        const approve=createTextElement('button','primary-btn','Aprobar');
        approve.type='button';approve.dataset.rechargeReview='true';approve.dataset.requestId=row.id;approve.dataset.decision='approved';approve.dataset.hidratado='true';
        const reject=createTextElement('button','secondary-btn','Rechazar');
        reject.type='button';reject.dataset.rechargeReview='true';reject.dataset.requestId=row.id;reject.dataset.decision='rejected';reject.dataset.hidratado='true';
        actions.append(approve,reject);item.append(actions);
      }
      rechargeList.append(item);
    });
  }
  const activeList=document.getElementById('adminActiveSessions');
  if(activeList){
    activeList.replaceChildren();
    if(!sessions.length)activeList.append(levelupAdminEmpty('No hay sesiones activas.'));
    sessions.forEach(row=>{
      const profile=profileMap.get(row.customer_id)||{};
      const resource=row.resource_id>=101?'PlayStation #'+(row.resource_id-100):'PC #'+String(row.resource_id).padStart(2,'0');
      const item=createTextElement('article','admin-list-item');
      const copy=createTextElement('div','admin-list-item__copy');
      copy.append(createTextElement('strong','',resource+' · '+(profile.full_name||'Cliente')));
      copy.append(createTextElement('small','',(row.billing_mode==='open'?'Sin límite':'Tiempo definido')+' · Inicio '+new Date(row.started_at).toLocaleString('es-BO')));
      copy.append(createTextElement('small','', 'Tiempo Bs '+Number(row.time_amount||0).toFixed(2)+' · Pedidos Bs '+Number(row.snacks_total||0).toFixed(2)));
      item.append(copy);
      const actions=createTextElement('div','admin-list-item__actions');
      const finish=createTextElement('button','secondary-btn','Finalizar sesión');
      finish.type='button';finish.dataset.adminFinishSession=row.id;finish.dataset.hidratado='true';
      actions.append(finish);item.append(actions);
      activeList.append(item);
    });
  }
  const reservationList=document.getElementById('adminReservations');
  if(reservationList){
    reservationList.replaceChildren();
    if(!reservations.length)reservationList.append(levelupAdminEmpty('No hay reservas pendientes ni activas.'));
    reservations.forEach(row=>{
      const profile=profileMap.get(row.customer_id)||{};
      const resource=row.resource_id>=101?'PlayStation #'+(row.resource_id-100):'PC #'+String(row.resource_id).padStart(2,'0');
      const item=createTextElement('article','admin-list-item');
      const copy=createTextElement('div','admin-list-item__copy');
      copy.append(createTextElement('strong','',resource+' · '+(row.customer_name||profile.full_name||'Cliente')));
      copy.append(createTextElement('small','',new Date(row.starts_at).toLocaleString('es-BO')+' · '+row.duration_hours+' h'));
      copy.append(createTextElement('small','',row.status==='active'?'En curso':row.status==='confirmed'?'Confirmada':'Pendiente'));
      item.append(copy);reservationList.append(item);
    });
  }
  const orderList=document.getElementById('adminOrders');
  if(orderList){
    orderList.replaceChildren();
    if(!orders.length)orderList.append(levelupAdminEmpty('Todavía no hay pedidos.'));
    orders.forEach(row=>{
      const profile=profileMap.get(row.customer_id)||{};
      const items=(row.order_items||[]).map(i=>i.quantity+' × '+i.item_name).join(', ');
      const item=createTextElement('article','admin-list-item');
      const copy=createTextElement('div','admin-list-item__copy');
      copy.append(createTextElement('strong','',money(row.total_amount)+' · '+(profile.full_name||'Cliente')));
      copy.append(createTextElement('small','',items||'Pedido sin detalle'));
      copy.append(createTextElement('small','',new Date(row.created_at).toLocaleString('es-BO')+' · '+row.status));
      item.append(copy);
      if(row.status==='placed'){
        const actions=createTextElement('div','admin-list-item__actions');
        const deliver=createTextElement('button','secondary-btn','Marcar entregado');
        deliver.type='button';deliver.dataset.adminDeliverOrder=row.id;deliver.dataset.hidratado='true';
        actions.append(deliver);item.append(actions);
      }
      orderList.append(item);
    });
  }
  const customerList=document.getElementById('adminCustomers');
  if(customerList){
    customerList.replaceChildren();
    if(!profiles.length)customerList.append(levelupAdminEmpty('Todavía no hay clientes registrados.'));
    profiles.forEach(profile=>{
      const item=createTextElement('article','admin-list-item');
      const copy=createTextElement('div','admin-list-item__copy');
      copy.append(createTextElement('strong','',profile.full_name||'Cliente sin nombre'));
      copy.append(createTextElement('small','',(profile.phone||'Sin celular')+' · Saldo '+money(profile.balance)));
      const roleLabel=profile.role==='admin'?'Administrador':profile.role==='staff'?'Personal':'Cliente';
      copy.append(createTextElement('small','',roleLabel));
      item.append(copy);
      if(state.activeUser.role==='admin'&&profile.role!=='admin'&&profile.id!==state.activeUser.id){
        const actions=createTextElement('div','admin-list-item__actions');
        const button=createTextElement('button','secondary-btn',profile.role==='staff'?'Quitar personal':'Hacer personal');
        button.type='button';button.dataset.roleChange='true';button.dataset.profileId=profile.id;
        button.dataset.newRole=profile.role==='staff'?'customer':'staff';button.dataset.hidratado='true';
        actions.append(button);item.append(actions);
      }
      customerList.append(item);
    });
  }

}

async function levelupSetProfileRole(profileId,newRole){
  if(!state.activeUser||state.activeUser.role!=='admin')throw new Error('Solo un administrador puede gestionar el personal.');
  if(!['customer','staff'].includes(newRole))throw new Error('Rol no permitido.');
  const promptText=newRole==='staff'
    ?'¿Conceder acceso al panel del personal a esta cuenta?'
    :'¿Retirar el acceso al panel del personal a esta cuenta?';
  if(!window.confirm(promptText))return;
  const client=await levelupRequireClient();
  const {error}=await client.rpc('levelup_set_profile_role',{p_target_user_id:profileId,p_new_role:newRole});
  if(error)throw error;
  await levelupLoadAdminDashboard();
  showToast(newRole==='staff'?'Acceso de personal asignado.':'Acceso de personal retirado.');
}
async function levelupAdminFinishSession(sessionId){
  if(!state.activeUser||!['admin','staff'].includes(state.activeUser.role))throw new Error('Solo el personal puede finalizar sesiones.');
  if(!window.confirm('¿Finalizar esta sesión? Se cerrará desde Supabase y no se aplicará ningún reembolso automático.'))return;
  const client=await levelupRequireClient();
  const {error}=await client.rpc('levelup_admin_finish_session',{p_session_id:sessionId});
  if(error)throw error;
  await levelupRefreshWalletAndSessions();
  await levelupLoadAdminDashboard();
  await levelupRefreshResourceAvailability();
  showToast('Sesión finalizada desde el panel del personal.');
}
async function levelupAdminMarkOrderDelivered(orderId){
  if(!state.activeUser||!['admin','staff'].includes(state.activeUser.role))throw new Error('Solo el personal puede actualizar pedidos.');
  const client=await levelupRequireClient();
  const {error}=await client.rpc('levelup_admin_mark_order_delivered',{p_order_id:orderId});
  if(error)throw error;
  await levelupLoadAdminDashboard();
  showToast('Pedido marcado como entregado.');
}
async function levelupResolveRechargeRequest(requestId,decision) {
  if(!state.activeUser||!['admin','staff'].includes(state.activeUser.role))throw new Error('Solo el personal autorizado puede validar recargas.');
  if(!['approved','rejected'].includes(decision))throw new Error('Decisión no válida.');
  if(decision==='approved'&&!window.confirm('¿Ya comprobaste que el pago ingresó? Solo aprueba después de verificar el efectivo o el QR.'))return;
  const client=await levelupRequireClient();
  const result=await client.rpc('levelup_resolve_recharge_request',{p_request_id:requestId,p_decision:decision});
  if(result.error)throw result.error;
  // La decisión ya quedó confirmada por PostgreSQL. Un fallo de lectura posterior
  // no debe hacer creer al personal que el crédito no se aplicó.
  let refreshFailed=false;
  try {
    await levelupRefreshWalletAndSessions();
    await levelupLoadAdminDashboard();
  } catch (refreshError) {
    refreshFailed=true;
    console.error('La recarga se resolvió, pero no se pudo refrescar el panel:',refreshError);
  }
  showToast(decision==='approved'
    ?(refreshFailed?'Recarga aprobada y saldo acreditado en Supabase. Actualiza el panel para ver el saldo.':'Recarga aprobada y saldo acreditado.')
    :(refreshFailed?'Solicitud rechazada en Supabase. Actualiza el panel.':'Solicitud de recarga rechazada.'));
}

async function submitScheduledReservation(event){
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button[type="submit"]');
  if(button?.disabled)return;
  const result=validateScheduledReservation();const status=$('#reservationFormStatus');status.text('').attr('class','form-status');
  if(!result.valid){status.text('Revisa los campos marcados antes de guardar.').attr('class','form-status error');return;}
  const endAt=result.startAt+result.duration*3600000;const endMinusOne=new Date(endAt-1),startDate=new Date(result.startAt);
  if(startDate.getHours()<8||endMinusOne.getDate()!==startDate.getDate()){
    status.text('El turno debe estar entre las 08:00 y las 24:00 y terminar el mismo día.').attr('class','form-status error');return;
  }
  if(button)button.disabled=true;
  const requestKey=levelupRequestKey('pendingReservationRequestId');
  const payload={p_resource_id:levelupResourceId(result.resource.key),p_customer_name:result.name,
    p_starts_at:new Date(result.startAt).toISOString(),p_duration_hours:result.duration,p_request_key:requestKey};
  try{
    const client=await levelupRequireClient();
    const {error}=await client.rpc('levelup_create_scheduled_reservation',payload);
    if(error)throw error;
    state.pendingReservationRequestId=null;
    await levelupLoadMyScheduledReservations();await levelupRefreshResourceAvailability();
    form.reset();setReservationDateMinimum();status.text('Turno guardado en Supabase.').attr('class','form-status success');
    showToast('Reserva confirmada en la base de datos.');
  }catch(error){
    console.error(error);
    if(levelupIsTransportFailure(error)){
      try{
        await levelupEnqueueOffline('reservation_create',payload,requestKey);
        state.pendingReservationRequestId=null;form.reset();setReservationDateMinimum();
        status.text('Turno guardado en este dispositivo y pendiente de sincronizar. Todavía no está reservado.').attr('class','form-status');
        showToast('Turno pendiente de enviar a Supabase cuando vuelva Internet.');
      }catch(queueError){status.text(queueError.message||'No se pudo guardar la solicitud pendiente.').attr('class','form-status error');showToast(queueError.message||'No se pudo guardar la solicitud.','error');}
    }else{
      status.text(error.message||'Error guardando en Supabase.').attr('class','form-status error');
      showToast(error.message||'No se guardó el turno.','error');
    }
  }finally{if(button)button.disabled=false;}
}
async function cancelScheduledReservation(id){
  if(id===state.activeScheduledReservationId){showToast('Cierra el proceso de inicio antes de cancelar un turno.','error');return;}
  try{
    const client=await levelupRequireClient();const {error}=await client.rpc('levelup_cancel_scheduled_reservation',{p_reservation_id:id});
    if(error)throw error;
    await levelupLoadMyScheduledReservations();await levelupRefreshResourceAvailability();
    $('#reservationFormStatus').text('Turno cancelado en Supabase.').attr('class','form-status success');showToast('Turno cancelado.');
  }catch(error){console.error(error);showToast(error.message||'No se pudo cancelar.','error');}
}

/* Cuentas y actividad local. Se conservan las claves usadas por el prototipo anterior. */
function loadAccounts(){state.accounts=[];state.activeUser=null;}
function saveAccounts(){return false;}
function saveActiveUser(){return false;}
function loadActiveSessions(){state.activeSessions=[];}
function saveActiveSessions(){return false;}
function activeSessionsForPhone(phone) {
  return state.activeSessions.filter(item => item.ownerPhone === phone)
    .sort((a, b) => Number(b.startedAt) - Number(a.startedAt));
}
function getLatestActiveSessionForUser() {
  return state.activeUser ? activeSessionsForPhone(state.activeUser.phone)[0] || null : null;
}
function renderActiveSessionPanel() {
  const panel = document.getElementById('activeSessionPanel');
  const list = document.getElementById('activeSessionList');
  if (!panel || !list) return;
  const sessions = state.activeUser ? activeSessionsForPhone(state.activeUser.phone) : [];
  panel.hidden = sessions.length === 0;
  if (!sessions.length) { list.replaceChildren(); return; }
  const fragment = document.createDocumentFragment();
  sessions.forEach(session => {
    const card = createTextElement('article', 'active-session-card');
    const title = createTextElement('div', 'active-session-card-head');
    const equipment = createTextElement('strong', '', session.resourceLabel || `Equipo ${session.machine}`);
    const mode = createTextElement('span', 'active-session-mode', session.billingMode === 'open' ? 'SIN LÍMITE' : 'TIEMPO DEFINIDO');
    title.append(equipment, mode);
    const metrics = createTextElement('div', 'active-session-metrics');
    const timeMetric = createTextElement('div', 'active-session-metric');
    const clockLabel = session.billingMode === 'open' ? 'Tiempo transcurrido' : 'Tiempo restante';
    timeMetric.append(createTextElement('span', '', clockLabel), createTextElement('strong', '', '--:--:--'));
    timeMetric.lastElementChild.dataset.sessionClock = session.id;
    const timeCost = createTextElement('div', 'active-session-metric');
    timeCost.append(createTextElement('span', '', 'Costo del tiempo'), createTextElement('strong', '', money(session.timeAmount)));
    timeCost.lastElementChild.dataset.sessionTimeCost = session.id;
    const snackCost = createTextElement('div', 'active-session-metric');
    snackCost.append(createTextElement('span', '', 'Snacks y extras'), createTextElement('strong', '', money(session.snacksTotal)));
    snackCost.lastElementChild.dataset.sessionSnackCost = session.id;
    const totalCost = createTextElement('div', 'active-session-metric active-session-grand-total');
    totalCost.append(createTextElement('span', '', 'Total actual'), createTextElement('strong', '', money(session.timeAmount + session.snacksTotal)));
    totalCost.lastElementChild.dataset.sessionGrandTotal = session.id;
    metrics.append(timeMetric, timeCost, snackCost, totalCost);
    const orderBlock = createTextElement('div', 'active-session-orders');
    orderBlock.append(createTextElement('strong', '', 'Pedidos de esta sesión'));
    const orders = createTextElement('div', 'active-session-order-list');
    if (!session.orders.length) {
      orders.append(createTextElement('span', 'active-session-order-empty', 'Todavía no hay pedidos.'));
    } else {
      session.orders.forEach(order => {
        const row = createTextElement('div', 'active-session-order');
        const label = (order.items || []).map(item => `${item.quantity} × ${item.name}`).join(', ') || 'Pedido';
        row.append(createTextElement('span', '', label), createTextElement('strong', '', money(order.total)));
        orders.append(row);
      });
    }
    orderBlock.append(orders);
    card.append(title, metrics, orderBlock);
    if (session.billingMode === 'open') {
      const finish = createTextElement('button', 'secondary-btn btn-tactil active-session-finish', 'Finalizar sesión');
      finish.type = 'button';
      finish.dataset.sessionFinish = session.id;
      finish.dataset.hidratado = 'true';
      card.append(finish);
    }
    fragment.append(card);
  });
  list.replaceChildren(fragment);
  updateActiveSessionPanel();
}
function updateActiveSessionPanel() {
  if (!state.activeUser) return;
  $('#accountDisplayBalance').text(money(state.activeUser.balance));
  const now = Date.now();
  activeSessionsForPhone(state.activeUser.phone).forEach(session => {
    const clock = document.querySelector(`[data-session-clock="${CSS.escape(session.id)}"]`);
    if (clock) {
      const value = session.billingMode === 'open'
        ? now - Number(session.startedAt)
        : Number(session.endsAt || 0) - now;
      clock.textContent = formatClock(Math.max(0, value));
    }
    const timeCost = document.querySelector(`[data-session-time-cost="${CSS.escape(session.id)}"]`);
    const snackCost = document.querySelector(`[data-session-snack-cost="${CSS.escape(session.id)}"]`);
    const grandTotal = document.querySelector(`[data-session-grand-total="${CSS.escape(session.id)}"]`);
    if (timeCost) timeCost.textContent = money(session.timeAmount);
    if (snackCost) snackCost.textContent = money(session.snacksTotal);
    if (grandTotal) grandTotal.textContent = money(session.timeAmount + session.snacksTotal);
  });
}
async function finishOpenSession(sessionId,reason='manual'){
  try{
    const client=await levelupRequireClient();const {error}=await client.rpc('levelup_finish_open_session',{p_session_id:sessionId});
    if(error)throw error;
    await levelupRefreshWalletAndSessions();await levelupLoadMyScheduledReservations();await levelupRefreshResourceAvailability();
    showToast('Sesión finalizada y sincronizada con Supabase.');
  }catch(error){console.error(error);showToast(error.message||'No se pudo finalizar la sesión.','error');}
}
function processOpenSessionCharges(now){return [];}

function renderAccount(){
  renderPendingActions();
  const loggedIn=Boolean(state.activeUser);
  $('#accountAccessPanel').prop('hidden',loggedIn);$('#accountDashboard').prop('hidden',!loggedIn);
  const adminPanel=document.getElementById('adminToolsPanel');
  if(adminPanel)adminPanel.hidden=!loggedIn||!['admin','staff'].includes(state.activeUser.role);
  if(!loggedIn)return;
  const user=state.activeUser;
  $('#accountDisplayName').text(user.name);$('#accountDisplayPhone').text('Celular · '+user.phone);$('#accountDisplayBalance').text(money(user.balance));
  renderActiveSessionPanel();
  const history=Array.isArray(user.history)?[...user.history].reverse().slice(0,8):[];
  const container=document.getElementById('accountHistory');if(!container)return;container.replaceChildren();
  if(!history.length){container.append(createTextElement('div','history-empty','Todavía no tienes movimientos confirmados en Supabase.'));return;}
  history.forEach(entry=>{
    if(!entry||typeof entry!=='object')return;
    const row=createTextElement('div','history-item'),copy=createTextElement('div','');
    const dateValue=entry.date?new Date(entry.date):null;
    const date=dateValue&&!Number.isNaN(dateValue.getTime())?dateValue.toLocaleString('es-BO',{dateStyle:'short',timeStyle:'short'}):'Fecha no disponible';
    const amount=Number(entry.amount||0);
    copy.append(createTextElement('strong','',entry.type||'Movimiento'));
    copy.append(createTextElement('small','',(entry.details||entry.method||'Movimiento confirmado')+' · '+date));
    row.append(copy,createTextElement('span','history-amount '+(amount>=0?'positive':'negative'),(amount>=0?'+':'−')+money(Math.abs(amount))));
    container.append(row);
  });
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
  return setFieldError('accountName', 'accountNameError', !value ? 'Escribe tu nombre.' : value.length < 3 ? 'Debe tener al menos 3 caracteres.' : containsBlacklistedTerms(value) ? 'Evita palabras ofensivas o insultos.' : '');
}
function validateAccountPhone() {
  const value = $('#accountPhone').val();
  return setFieldError('accountPhone', 'accountPhoneError', /^\d{8}$/.test(value) ? '' : 'Ingresa los 8 dígitos del celular.');
}
function validateLoginPhone() {
  const value = $('#loginPhone').val();
  return setFieldError('loginPhone', 'loginPhoneError', /^\d{8}$/.test(value) ? '' : 'Ingresa los 8 dígitos del celular.');
}
function validateAccountPassword() {
  const value = String($('#accountPassword').val() || '');
  return setFieldError('accountPassword', 'accountPasswordError',
    value.length < 8 ? 'La contraseña debe tener al menos 8 caracteres.'
      : value.length > 72 ? 'La contraseña no puede superar 72 caracteres.' : '');
}
function validateLoginPassword() {
  const value = String($('#loginPassword').val() || '');
  return setFieldError('loginPassword', 'loginPasswordError',
    !value ? 'Escribe tu contraseña.' : value.length > 72 ? 'La contraseña no puede superar 72 caracteres.' : '');
}
function levelUpAuthPhone(localPhone) {
  return '+591' + String(localPhone || '').replace(/\D/g, '').slice(-8);
}
function localLevelUpPhone(authPhone) {
  const value = String(authPhone || '').replace(/\D/g, '');
  return value.startsWith('591') ? value.slice(3) : value.slice(-8);
}
function setAccountAuthNote(message, isError = false) {
  const note = document.getElementById('accountAuthNote');
  if (!note) return;
  note.textContent = String(message || '');
  note.classList.toggle('error', Boolean(isError));
}
async function activateLevelUpAuthUser(authUser){
  if(!authUser?.id||!window.levelupSupabase)throw new Error('No se pudo identificar la sesión.');
  const client=window.levelupSupabase;
  const {data:profile,error}=await client.from('profiles').select('id,full_name,phone,balance,role').eq('id',authUser.id).maybeSingle();
  if(error)throw error;
  if(!profile)throw new Error('No encontramos el perfil.');
  state.activeUser={id:authUser.id,name:String(profile.full_name||authUser.user_metadata?.full_name||'Cliente LevelUp'),
    phone:localLevelUpPhone(profile.phone||authUser.phone),balance:Number(profile.balance||0),role:profile.role,
    history:[],createdAt:authUser.created_at||new Date().toISOString(),supabaseAuth:true};
  renderAccount();
  await levelupRefreshWalletAndSessions();
  await levelupLoadMyScheduledReservations();
  await levelupLoadMyRechargeRequests();
  if(['admin','staff'].includes(state.activeUser.role))await levelupLoadAdminDashboard();
  await levelupRenderOfflineQueue();
  await levelupProcessPendingTransactions();
  setAccountAuthNote('Perfil, saldo, historial, sesiones y reservas cargados desde Supabase.');
}
async function restoreLevelUpAuthSession() {
  const client = window.levelupSupabase;
  if (!client) return;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session?.user) await activateLevelUpAuthUser(data.session.user);
}

function validateBookingName() {
  const value = $('#customerName').val().trim();
  return setFieldError('customerName', 'customerNameError', !value ? 'Escribe tu nombre.' : value.length < 3 ? 'Debe tener al menos 3 caracteres.' : containsBlacklistedTerms(value) ? 'Evita palabras ofensivas o insultos.' : '');
}
function validateBookingPhone() {
  const value = $('#customerPhone').val();
  return setFieldError('customerPhone', 'customerPhoneError', /^\d{8}$/.test(value) ? '' : 'Ingresa un celular de 8 dígitos.');
}
function validateContactName() {
  const name = $('#contactName').val().trim();
  return setFieldError('contactName', 'contactNameError', name.length < 3 ? 'Escribe al menos 3 caracteres.' : containsBlacklistedTerms(name) ? 'Evita palabras ofensivas o insultos.' : '');
}
function validateContactPhone() {
  const phone = $('#contactPhone').val();
  return setFieldError('contactPhone', 'contactPhoneError', /^\d{8}$/.test(phone) ? '' : 'Ingresa un celular de 8 dígitos.');
}
function validateContactMessage() {
  const message = $('#contactMessage').val().trim();
  return setFieldError('contactMessage', 'contactMessageError', message.length < 8 ? 'Escribe una consulta de al menos 8 caracteres.' : containsBlacklistedTerms(message) ? 'Evita palabras ofensivas o insultos.' : '');
}
function validateContactForm() {
  const validName = validateContactName();
  const validPhone = validateContactPhone();
  const validMessage = validateContactMessage();
  return validName && validPhone && validMessage;
}

/* Almacenamiento local de solicitudes pendientes. Sin API de servidor no se afirma que hayan sido enviadas. */
function readPendingActions(){return [];}
function renderPendingActions() {
  const queue = readPendingActions();
  const panel = document.getElementById('pendingSyncNotice');
  if (!panel) return;
  panel.hidden = queue.length === 0;
  $('#pendingSyncCount').text(`${queue.length} ${queue.length === 1 ? 'acción guardada' : 'acciones guardadas'}`);
  $('#pendingSyncText').text('Guardadas únicamente en este navegador y pendientes de un servidor. GitHub Pages no recibe ni sincroniza estos registros automáticamente.');
}
function queueLocalAction(){return false;}

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
  const thumbnail = button.querySelector('img');
  $('#photoViewerImage').attr({
    src: photo,
    alt: thumbnail?.alt || 'Imagen de LevelUp',
    width: Number(thumbnail?.getAttribute('width')) || 1200,
    height: Number(thumbnail?.getAttribute('height')) || 800
  });
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
  populateReservationResources();
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
  populateReservationResources();
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
  state.activeScheduledReservationId = '';
  configureSessionDurationOptions(null, 60);
  $('#sessionMode').val('fixed').prop('disabled', false);
  $('#sessionModeField').prop('hidden', false);
  $('#bookingHoldNotice').prop('hidden', false);
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
  configureSessionDurationOptions(null, 60);
  $('#sessionMode').val('fixed').prop('disabled', false);
  $('#sessionModeField').prop('hidden', false);
  $('#sessionHours').val('60').prop('disabled', false);
  $('#scheduledBookingConflict').text('').prop('hidden', true);
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
function updateBookingModeFields() {
  const openMode = $('#sessionMode').val() === 'open' && !state.activeScheduledReservationId;
  $('#sessionHours').prop('disabled', openMode);
  $('#sessionModeHelp').text(openMode
    ? 'No se fija una hora de salida. Se cobra por bloques de 30 minutos desde el saldo.'
    : 'Elige 30 minutos, 1 hora o el tiempo que necesites.');
  return openMode;
}
function updateBookingTotal() {
  const openMode = updateBookingModeFields();
  const minutes = openMode ? 30 : Number($('#sessionHours').val() || 60);
  const base = state.selectedMachine ? sessionTimePrice(state.selectedMachine, minutes) : 0;
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
  const scheduledId = state.activeScheduledReservationId;
  const scheduledEntry = scheduledId ? state.scheduledReservations.find(item => item.id === scheduledId) : null;
  const validWalkInHold = state.selectedMachine?.reservationExpiresAt && state.selectedMachine.reservationExpiresAt > Date.now();
  if (!state.selectedMachine || (scheduledId ? !scheduledEntry : !validWalkInHold)) {
    if (scheduledId) { closeBooking(false); showToast('El turno reservado ya no está disponible.', 'error'); }
    else expireReservation();
    return;
  }
  const nameValid = validateBookingName();
  const phoneValid = validateBookingPhone();
  if (!nameValid || !phoneValid) {
    document.querySelector(!nameValid ? '#customerName' : '#customerPhone').focus();
    return;
  }
  const scheduledMode = Boolean(state.activeScheduledReservationId);
  const billingMode = !scheduledMode && $('#sessionMode').val() === 'open' ? 'open' : 'fixed';
  const durationMinutes = billingMode === 'open' ? 30 : Number($('#sessionHours').val());
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    $('#scheduledBookingConflict').text('Selecciona una duración válida.').prop('hidden', false);
    return;
  }
  const resourceKey = resourceKeyForEquipment(state.selectedMachine);
  const requestedStart = Date.now();
  const requestedEnd = billingMode === 'open' ? Number.MAX_SAFE_INTEGER : requestedStart + durationMinutes * 60000;
  const conflict = findScheduledReservationOverlap(resourceKey, requestedStart, requestedEnd, state.activeScheduledReservationId);
  if (conflict) {
    const startsLabel = reservationDateLabel(conflict.startsAt);
    $('#scheduledBookingConflict')
      .text(billingMode === 'open'
        ? `No puedes iniciar una sesión sin límite porque ya existe un turno para este equipo: ${startsLabel}.`
        : `Este equipo ya tiene un turno programado para ${startsLabel}. Reduce la duración o elige otro equipo.`)
      .prop('hidden', false);
    $('#sessionHours').trigger('focus');
    return;
  }
  $('#scheduledBookingConflict').text('').prop('hidden', true);
  const isConsole = state.selectedResourceType === 'console';
  const hasExtraController = isConsole && $('#extraController').is(':checked');
  const controllerFee = hasExtraController ? Number(state.selectedMachine.extraControllerFee || 6) : 0;
  const baseAmount = sessionTimePrice(state.selectedMachine, durationMinutes);
  const total = baseAmount + controllerFee;
  state.booking = { kind: state.selectedResourceType, name: $('#customerName').val().trim(), phone: $('#customerPhone').val(), billingMode, durationMinutes: billingMode === 'open' ? null : durationMinutes, baseAmount, hasExtraController, controllerFee, total, scheduledReservationId: state.activeScheduledReservationId || '' };
  $('#paymentMachine').text(resourceLabelForSession(state.selectedMachine, state.selectedResourceType));
  const timeLabel = billingMode === 'open' ? 'Sin límite · primer bloque de 30 min' : durationLabel(durationMinutes);
  $('#paymentSummary').text(`${timeLabel}${hasExtraController ? ' · segundo mando (+ Bs 6)' : ''} · comienza al confirmar`);
  $('#paymentTotal').text(money(state.booking.total));
  showBookingStep('payment');
  updatePaymentState();
}
async function confirmSessionPayment(){
  const machine=state.selectedMachine,user=state.activeUser,booking=state.booking;
  const scheduledId=booking?.scheduledReservationId||null;
  const scheduledEntry=scheduledId?state.scheduledReservations.find(item=>item.id===scheduledId):null;
  const validHold=machine?.reservationExpiresAt&&machine.reservationExpiresAt>Date.now();
  if(!machine||!user||!booking||(scheduledId?!scheduledEntry:!validHold)){showToast('La reserva temporal o el turno ya no está disponible.','error');return;}
  const button=document.getElementById('confirmPayment');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  try{
    const client=await levelupRequireClient();
    const {data,error}=await client.rpc('levelup_start_session',{
      p_resource_id:levelupResourceId(resourceKeyForEquipment(machine)),
      p_billing_mode:booking.billingMode,
      p_duration_minutes:booking.billingMode==='open'?30:Number(booking.durationMinutes),
      p_has_extra_controller:Boolean(booking.hasExtraController),
      p_scheduled_reservation_id:scheduledId
    });
    if(error)throw error;
    await levelupRefreshWalletAndSessions();
    await levelupLoadMyScheduledReservations();
    await levelupRefreshResourceAvailability();
    state.activeScheduledReservationId='';
    $('#successText').text('Sesión registrada y cobrada en Supabase. Saldo restante: '+money(data.balance));
    $('#contractedAtLabel').text('Contratado el '+new Date().toLocaleString('es-BO',{dateStyle:'medium',timeStyle:'short'}));
    $('#syncNote').text('La base de datos confirmó la sesión y el movimiento de saldo.');
    showBookingStep('success');
    showToast('Sesión y cobro confirmados en Supabase.');
  }catch(error){
    console.error(error);
    $('#scheduledBookingConflict').text(error.message||'Error al iniciar').prop('hidden',false);
    showToast(error.message||'No se inició ni cobró la sesión.','error');
  }finally{if(button)button.disabled=false;}
}
function closeBooking(release = true) {
  const wasScheduledTurn = Boolean(state.activeScheduledReservationId);
  if (release) releaseReservation(false);
  closeModal('#bookingModal');
  state.selectedMachine = null;
  state.selectedResourceType = null;
  state.booking = null;
  state.activeScheduledReservationId = '';
  configureSessionDurationOptions(null, 60);
  $('#sessionMode').val('fixed').prop('disabled', false);
  $('#sessionModeField').prop('hidden', false);
  $('#bookingHoldNotice').prop('hidden', false);
  if (wasScheduledTurn) renderScheduledReservations();
}

/* Recargas: la solicitud se registra en Supabase; el crédito solo llega tras aprobar el pago. */
async function openRecharge() {
  if (!state.activeUser) {
    showView('cuenta');
    showToast('Primero crea tu cuenta o inicia sesión.');
    return;
  }
  try {
    // El saldo se muestra siempre desde el perfil real de Supabase.
    await levelupRefreshWalletAndSessions();
    $('#rechargeCurrentBalance').text(money(state.activeUser.balance));
    $('#rechargeAmountLabel').text(money(state.rechargeAmount));
    openModal('#rechargeModal');
  } catch (error) {
    console.error('No se pudo consultar el saldo antes de solicitar una recarga:', error);
    showToast('No pudimos consultar tu saldo en Supabase. No se envió ninguna recarga.', 'error');
  }
}
async function confirmRecharge(){
  if(!state.activeUser)return;const button=document.getElementById('confirmRecharge');if(button?.disabled)return;
  const amount=Number(state.rechargeAmount);if(!Number.isFinite(amount)||amount<5||amount>500){showToast('Recarga entre Bs 5 y Bs 500.','error');return;}
  if(button)button.disabled=true;
  const requestKey=levelupRequestKey('pendingRechargeRequestId');
  const payload={p_amount:amount,p_payment_method:state.rechargeMethod,p_request_key:requestKey};
  let requestConfirmed=false;
  try{
    const client=await levelupRequireClient();
    const {error}=await client.rpc('levelup_create_recharge_request',payload);
    if(error)throw error;
    requestConfirmed=true;
    // La clave solo se libera después de que el RPC devuelve éxito. Si se pierde
    // la respuesta de red, el reintento reutiliza la misma clave idempotente.
    state.pendingRechargeRequestId=null;
    closeModal('#rechargeModal');
  }catch(error){
    console.error(error);
    // Nunca encolamos pagos offline ni afirmamos que una solicitud sin respuesta
    // del servidor fue registrada.
    if(levelupIsTransportFailure(error)){
      showToast('No pudimos confirmar la solicitud con Supabase. Tu saldo no cambió. Vuelve a intentarlo online.','error');
    }else{
      showToast(error.message||'No se registró la solicitud de recarga.','error');
    }
  }
  if(requestConfirmed){
    try{
      await levelupLoadMyRechargeRequests();
      await levelupRefreshWalletAndSessions();
      showToast('Solicitud registrada en Supabase. Tu saldo actual se conserva y solo aumentará cuando el personal apruebe el pago.');
    }catch(refreshError){
      console.error('La solicitud sí se registró, pero no se pudo actualizar la pantalla:',refreshError);
      showToast('Solicitud registrada en Supabase. El saldo no cambia hasta que el personal apruebe el pago. Actualiza la cuenta para ver el estado.');
    }
  }
  if(button)button.disabled=false;
}

/* Temporizador único: se actualizan los textos, no se adjuntan listeners a cada tarjeta. */
function tickSessions(){
  const now=Date.now();
  [...state.machines,...state.consoles].forEach(machine=>{
    if(machine.reservationExpiresAt&&machine.reservationExpiresAt<=now){machine.reservationExpiresAt=null;machine.available=true;machine.sessionStartedAt=null;machine.sessionEndsAt=null;}
    if(machine.sessionEndsAt&&machine.sessionEndsAt<=now){machine.available=true;machine.sessionEndsAt=null;machine.sessionStartedAt=null;}
  });
  updateActiveSessionPanel();
  if(state.networkState==='online'&&!state.levelupSyncBusy&&(now-(state.levelupLastSyncAt||0)>=30000)){
    state.levelupSyncBusy=true;state.levelupLastSyncAt=now;
    const tasks=[levelupRefreshResourceAvailability()];
    if(state.activeUser?.id)tasks.push(levelupRefreshWalletAndSessions().then(levelupLoadMyScheduledReservations).then(levelupLoadMyRechargeRequests));
    Promise.all(tasks).catch(error=>console.warn('Sincronización Supabase:',error)).finally(()=>{state.levelupSyncBusy=false;});
  }
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
function sendContactMessage(){
  if(!validateContactForm()){
    $('#contactStatus').text('Revisa los campos marcados.').attr('class','form-status error');
    document.querySelector('#contactForm .form-field.invalid input, #contactForm .form-field.invalid textarea')?.focus();
    return;
  }
  const name=$('#contactName').val().trim();
  const phone=$('#contactPhone').val();
  const message=$('#contactMessage').val().trim();
  const text=`Hola, soy ${name}. Mi celular es ${phone}. Consulta para LevelUp: ${message}`;
  const url=`https://wa.me/59164133234?text=${encodeURIComponent(text)}`;
  if(state.networkState==='offline'||navigator.onLine===false){
    $('#contactStatus').text('Sin conexión. La consulta no se envió ni se guardó en el servidor. Vuelve a intentarlo cuando recuperes Internet.').attr('class','form-status error');
    showToast('La consulta no se envió. Necesitas Internet para abrir WhatsApp.','error');
    return;
  }
  $('#contactStatus').text('Abriendo WhatsApp con tu consulta. Confirma el envío desde esa aplicación.').attr('class','form-status success');
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
  const sendButton = document.getElementById('sendAccessoryOrder');
  const activeSession = getLatestActiveSessionForUser();
  count.textContent = `${total} ${total === 1 ? 'artículo' : 'artículos'}`;
  if (totalLabel) totalLabel.textContent = `Total: ${money(estimatedTotal)}`;
  if (clearButton) clearButton.hidden = state.accessoryQueue.length === 0;
  if (sendButton) {
    sendButton.hidden = state.accessoryQueue.length === 0;
    sendButton.disabled = state.accessoryQueue.length === 0 || !activeSession;
    sendButton.textContent = activeSession ? `Enviar pedido a ${activeSession.resourceLabel}` : 'Inicia una sesión para pedir';
  }
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
async function sendAccessoryOrder(){
  const button=document.getElementById('sendAccessoryOrder');if(button?.disabled||!state.accessoryQueue.length)return;
  if(!state.activeUser){showToast('Inicia sesión para registrar tu pedido.','error');showView('cuenta');return;}
  const session=getLatestActiveSessionForUser();if(!session){showToast('Primero inicia una sesión activa.','error');return;}
  const controllerItem=state.accessoryQueue.find(item=>item.id==='controller');
  if(controllerItem&&(session.resourceType!=='console'||session.extraController)){showToast('El mando adicional solo se permite una vez durante una sesión de PlayStation.','error');return;}
  if(button)button.disabled=true;
  const requestKey=levelupRequestKey('pendingOrderRequestId');
  const payload={p_session_id:session.id,p_items:state.accessoryQueue.map(item=>({product_id:item.id,quantity:item.quantity})),p_request_key:requestKey};
  try{
    const client=await levelupRequireClient();
    const {error}=await client.rpc('levelup_create_order',payload);
    if(error)throw error;
    state.pendingOrderRequestId=null;state.accessoryQueue=[];saveAccessoryQueue();renderAccessoryQueue();
    await levelupRefreshWalletAndSessions();showToast('Pedido, artículos y cobro confirmados en Supabase.');
  }catch(error){
    console.error(error);
    if(levelupIsTransportFailure(error)){
      try{
        await levelupEnqueueOffline('order_create',payload,requestKey);
        state.pendingOrderRequestId=null;state.accessoryQueue=[];saveAccessoryQueue();renderAccessoryQueue();
        showToast('Pedido guardado como pendiente local. No se ha cobrado ni confirmado aún.');
      }catch(queueError){showToast(queueError.message||'No se pudo guardar el pedido pendiente.','error');}
    }else showToast(error.message||'No se guardó el pedido.','error');
  }finally{if(button)button.disabled=false;}
}
function clearAccessoryQueue() {
  state.accessoryQueue = [];
  saveAccessoryQueue();
  renderAccessoryQueue();
  setQuickOrderStatus('El pedido está vacío. Agrega productos desde el catálogo.');
}

const LEVELUP_BLACKLIST=new Set(['puta','putas','puto','putos','mierda','mierdas','pendejo','pendeja','pendejos','pendejas','idiota','idiotas','imbecil','imbeciles','estupido','estupida','estupidos','estupidas','cabron','cabrona','cabrones','hijueputa','malparido','malparida','maricon','maricones','verga','vergas','coño','concha','boludo','boluda','fuck','fucking','shit','bitch','asshole']);
function normalizeModerationText(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-BO').replace(/[@4]/g,'a').replace(/[0]/g,'o').replace(/[1!]/g,'i').replace(/[3]/g,'e').replace(/[5$]/g,'s').replace(/[7]/g,'t').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function containsBlacklistedTerms(v){return normalizeModerationText(v).split(' ').some(w=>LEVELUP_BLACKLIST.has(w))}
const LEVELUP_THEME_KEY='levelup-pwa-theme-v1';
function applyLevelUpTheme(t){const light=t==='light';document.documentElement.dataset.theme=light?'light':'dark';try{localStorage.setItem(LEVELUP_THEME_KEY,light?'light':'dark')}catch(_){}const m=document.getElementById('themeColorMeta');if(m)m.content=light?'#f5f7fb':'#0b0c16';const b=document.getElementById('themeToggle');if(b){b.querySelector('.theme-toggle__icon').textContent=light?'☾':'☀';b.querySelector('.theme-toggle__label').textContent=light?'Modo oscuro':'Modo claro';b.setAttribute('aria-label',light?'Activar modo oscuro':'Activar modo claro');b.setAttribute('aria-pressed',String(light))}}
function setupLevelUpTheme(){
  applyLevelUpTheme(document.documentElement.dataset.theme==='light'?'light':'dark');
  const themeButton=document.getElementById('themeToggle');
  if(themeButton&&themeButton.dataset.themeReady!=='true'){
    themeButton.addEventListener('click',()=>applyLevelUpTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
    themeButton.dataset.themeReady='true';
  }
  let contrastEnabled=false;
  try{contrastEnabled=localStorage.getItem('levelup_high_contrast_v1')==='true';}catch(_){}
  document.body.classList.toggle('alto-contraste',contrastEnabled);
  const contrastButton=document.getElementById('contrastToggle');
  if(contrastButton){
    contrastButton.setAttribute('aria-pressed',String(contrastEnabled));
    contrastButton.setAttribute('aria-label',contrastEnabled?'Desactivar alto contraste':'Activar alto contraste');
    if(contrastButton.dataset.contrastReady!=='true'){
      contrastButton.addEventListener('click',()=>{
        const enabled=document.body.classList.toggle('alto-contraste');
        contrastButton.setAttribute('aria-pressed',String(enabled));
        contrastButton.setAttribute('aria-label',enabled?'Desactivar alto contraste':'Activar alto contraste');
        try{localStorage.setItem('levelup_high_contrast_v1',String(enabled));}catch(_){}
      });
      contrastButton.dataset.contrastReady='true';
    }
  }
}
const SERVICE_DETAILS={basic:{title:'PC Básica · Bs 3 por hora',copy:'Selecciona una PC Básica libre. El precio se calcula según la duración.'},standard:{title:'PC Estándar · Bs 6 por hora',copy:'Selecciona una PC Estándar libre. El precio se calcula según la duración.'},premium:{title:'PC Premium · Bs 10 por hora',copy:'Selecciona una PC Premium libre. El precio se calcula según la duración.'},console:{title:'PlayStation 5 · Bs 15 por hora',copy:'Una PS5 libre con un mando incluido. Segundo mando opcional: Bs 6 por sesión.'}};
function renderServiceSelectionSafe(type){const target=document.getElementById('serviceSelectionInfo'),d=SERVICE_DETAILS[type];if(!target||!d)return;const markup='<strong class="service-selection__title">'+d.title+'</strong><p class="service-selection__description">'+d.copy+'</p>';if(window.DOMPurify&&typeof window.DOMPurify.sanitize==='function')target.innerHTML=window.DOMPurify.sanitize(markup,{USE_PROFILES:{html:true}});else{const title=document.createElement('strong');title.className='service-selection__title';title.textContent=d.title;const p=document.createElement('p');p.className='service-selection__description';p.textContent=d.copy;target.replaceChildren(title,p)}}
function reserveServiceDirect(type){renderServiceSelectionSafe(type);if(type==='console'){const item=state.consoles.find(x=>isAvailable(x));if(!item){showToast('No hay una PlayStation disponible en este momento.','error');return}openConsoleBooking(item.id);return}if(!['basic','standard','premium'].includes(type))return;const item=state.machines.find(x=>x.type===type&&isAvailable(x));if(!item){showToast('No hay equipos disponibles de esa categoría.','error');return}openBooking(item.id)}
function bindLevelUpEvents() {
  /* Limpieza previa: evita duplicar escuchadores si se ejecuta una segunda hidratación. */
  $document.off('.levelupNavigation .levelupCatalog .levelupFilters .levelupAccount .levelupBooking .levelupModal .levelupViewer .levelupContact .levelupConsoles .levelupValidation .levelupReservation .levelupAccessories .levelupAdmin .levelupQueue .levelupA11y');
  $(window).off('.levelupRuntime .levelupCarousel');
  $(window).on('online.levelupRuntime',function(){
    refreshNetworkStatus(true);
    levelupProcessPendingTransactions().catch(error=>console.warn('No se pudo sincronizar la cola local:',error));
  });


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
  $document.on('click.levelupServices', '[data-service-reserve]', function () { reserveServiceDirect(this.dataset.serviceReserve); });

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
  $document.on('click.levelupCatalog', '#btnSimularVista', function(){
    const carousel=document.getElementById('pcCarousel');
    const track=document.getElementById('pcGrid');
    if(!carousel||!track)return;
    const compact=carousel.classList.toggle('sim-movil');
    track.classList.toggle('sim-movil',compact);
    this.setAttribute('aria-pressed',String(compact));
    this.textContent=compact?'Volver al carrusel':'Simular vista móvil';
    if(compact)carousel.scrollTo({top:0,left:0,behavior:'smooth'});
    else carousel.scrollTo({top:0,left:0,behavior:'smooth'});
  });
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
  $document.on('click.levelupAdmin', '#adminRefreshButton', async function(){
    this.disabled=true;
    try{await levelupLoadAdminDashboard();await levelupRefreshResourceAvailability();showToast('Panel actualizado desde Supabase.');}
    catch(error){console.error(error);showToast(error.message||'No se pudo actualizar el panel.','error');}
    finally{this.disabled=false;}
  });
  $document.on('click.levelupQueue', '#offlinePendingList [data-retry-offline]', async function(){
    const button=this;button.disabled=true;
    try{await levelupRetryOfflineOperation(button.dataset.retryOffline);}
    catch(error){console.error(error);showToast(error.message||'No se pudo reintentar.','error');}
    finally{button.disabled=false;}
  });
  $document.on('click.levelupQueue', '#offlinePendingList [data-remove-offline]', async function(){
    const button=this;button.disabled=true;
    try{await levelupQueueDelete(button.dataset.removeOffline);await levelupRenderOfflineQueue();}
    catch(error){console.error(error);showToast(error.message||'No se pudo quitar la operación.','error');}
    finally{button.disabled=false;}
  });
  $document.on('click.levelupAdmin', '#adminToolsPanel [data-role-change]', async function(){
    const button=this;button.disabled=true;
    try{await levelupSetProfileRole(button.dataset.profileId,button.dataset.newRole);}
    catch(error){console.error(error);showToast(error.message||'No se pudo cambiar el rol.','error');}
    finally{button.disabled=false;}
  });
  $document.on('click.levelupAdmin', '#adminToolsPanel [data-admin-finish-session]', async function(){
    const button=this;button.disabled=true;
    try{await levelupAdminFinishSession(button.dataset.adminFinishSession);}
    catch(error){console.error(error);showToast(error.message||'No se pudo finalizar la sesión.','error');}
    finally{button.disabled=false;}
  });
  $document.on('click.levelupAdmin', '#adminToolsPanel [data-admin-deliver-order]', async function(){
    const button=this;button.disabled=true;
    try{await levelupAdminMarkOrderDelivered(button.dataset.adminDeliverOrder);}
    catch(error){console.error(error);showToast(error.message||'No se pudo actualizar el pedido.','error');}
    finally{button.disabled=false;}
  });
  $document.on('click.levelupAdmin', '#adminToolsPanel [data-recharge-review]', async function(){
    const button=this;button.disabled=true;
    try{await levelupResolveRechargeRequest(button.dataset.requestId,button.dataset.decision);}
    catch(error){console.error(error);showToast(error.message||'No se pudo resolver la recarga.','error');}
    finally{button.disabled=false;}
  });
  $document.on('submit.levelupAccount', '#registerForm', async function (event) {
    event.preventDefault();
    const validName = validateAccountName();
    const validPhone = validateAccountPhone();
    const validPassword = validateAccountPassword();
    if (!validName || !validPhone || !validPassword) {
      document.getElementById(!validName ? 'accountName' : !validPhone ? 'accountPhone' : 'accountPassword').focus();
      return;
    }
    const client = window.levelupSupabase;
    if (!client) { setAccountAuthNote('No se pudo conectar con Supabase. Revisa tu conexión e inténtalo de nuevo.', true); return; }
    const name = String($('#accountName').val() || '').trim();
    const phone = String($('#accountPhone').val() || '');
    const password = String($('#accountPassword').val() || '');
    const submit = this.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    setAccountAuthNote('Creando tu cuenta segura…');
    try {
      const { data, error } = await client.auth.signUp({
        phone: levelUpAuthPhone(phone),
        password,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      if (!data.user) throw new Error('Supabase no devolvió el usuario creado.');
      if (!data.session) {
        switchAccountTab('login');
        $('#loginPhone').val(phone);
        setAccountAuthNote('La cuenta fue registrada, pero no se inició sesión. Revisa que la confirmación telefónica esté desactivada y Phone Provider habilitado.', true);
        return;
      }
      await activateLevelUpAuthUser(data.user);
      $('#accountPassword').val('');
      $('#registerForm')[0].reset();
      showToast(`Bienvenido, ${name.split(' ')[0]}. Tu cuenta LevelUp está creada.`);
      continuePendingBooking();
    } catch (error) {
      console.error('Error al registrar cuenta LevelUp en Supabase:', error);
      setAccountAuthNote(error.message || 'No se pudo crear la cuenta. Revisa el celular y vuelve a intentarlo.', true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  $document.on('submit.levelupAccount', '#loginForm', async function (event) {
    event.preventDefault();
    const validPhone = validateLoginPhone();
    const validPassword = validateLoginPassword();
    if (!validPhone || !validPassword) {
      document.getElementById(!validPhone ? 'loginPhone' : 'loginPassword').focus();
      return;
    }
    const client = window.levelupSupabase;
    if (!client) { setAccountAuthNote('No se pudo conectar con Supabase. Revisa tu conexión e inténtalo de nuevo.', true); return; }
    const phone = String($('#loginPhone').val() || '');
    const password = String($('#loginPassword').val() || '');
    const submit = this.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    setAccountAuthNote('Verificando tus datos…');
    try {
      const { data, error } = await client.auth.signInWithPassword({
        phone: levelUpAuthPhone(phone),
        password
      });
      if (error) throw error;
      await activateLevelUpAuthUser(data.user);
      $('#loginPassword').val('');
      showToast(`Bienvenido nuevamente, ${state.activeUser.name.split(' ')[0]}.`);
      continuePendingBooking();
    } catch (error) {
      console.error('Error al iniciar sesión en LevelUp:', error);
      setAccountAuthNote('No pudimos iniciar sesión. Comprueba tu celular y contraseña.', true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  $document.on('input.levelupValidation', '#accountName', validateAccountName);
  $document.on('blur.levelupValidation', '#accountName', validateAccountName);
  $document.on('input.levelupValidation blur.levelupValidation', '#accountPassword', validateAccountPassword);
  $document.on('blur.levelupValidation', '#loginPassword', validateLoginPassword);
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
  $document.on('click.levelupAccount', '#logoutButton', async function () {
    try {
      if (window.levelupSupabase) {
        const { error } = await window.levelupSupabase.auth.signOut();
        if (error) throw error;
      }
      state.activeUser = null;
      localStorage.removeItem(STORAGE.activePhone);
      renderAccount();
      setAccountAuthNote('Sesión cerrada correctamente.');
      showToast('Sesión cerrada.');
    } catch (error) {
      console.error('Error al cerrar sesión en Supabase:', error);
      showToast('No se pudo cerrar la sesión. Inténtalo de nuevo.', 'error');
    }
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
  $document.on('change.levelupBooking', '#sessionHours, #sessionMode', function () { updateBookingTotal(); $('#scheduledBookingConflict').text('').prop('hidden', true); });
  $document.on('change.levelupBooking', '#extraController', updateBookingTotal);
  $document.on('click.levelupAccount', '[data-session-finish]', function () { finishOpenSession(this.dataset.sessionFinish, 'manual'); });
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
  $document.on('click.levelupAccessories', '#sendAccessoryOrder', sendAccessoryOrder);

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

  /* Smoke Test y auditoría semántica: pruebas de demostración en vivo. */
  $document.on('click.levelupA11y', '#btnSmokeTest', async function(){
    const output=document.getElementById('salidaAudit');
    if(!output)return;
    const images=document.querySelectorAll('img');
    const missingAlt=document.querySelectorAll('img:not([alt]), img[alt=""]').length;
    const emptyLinks=document.querySelectorAll('a[href=""], a:not([href])').length;
    const buttonCount=document.querySelectorAll('button').length;
    const manifest=Boolean(document.querySelector('link[rel="manifest"]'));
    let swRegistered=false;
    try{
      if('serviceWorker' in navigator){
        const registration=await navigator.serviceWorker.getRegistration();
        swRegistered=Boolean(registration);
      }
    }catch(error){console.warn('No se pudo consultar el Service Worker:',error);}
    const passed=missingAlt===0&&emptyLinks===0&&manifest&&swRegistered;
    output.textContent=(passed?'Smoke Test OK':'Smoke Test: revisar')+
      ' · Botones: '+buttonCount+
      ' · Imágenes sin alt: '+missingAlt+
      ' · Enlaces vacíos: '+emptyLinks+
      ' · Manifest: '+(manifest?'sí':'no')+
      ' · Service Worker: '+(swRegistered?'registrado':'no registrado')+
      ' · Imágenes totales: '+images.length;
  });
  $document.on('click.levelupA11y', '#btnAuditarA11Y', function(){
    const output=document.getElementById('reporteA11Y');
    if(!output)return;
    const semanticZones=document.querySelectorAll('header, nav, main, article, footer').length;
    const missingAlt=document.querySelectorAll('img:not([alt]), img[alt=""]').length;
    const labelsWithoutControl=[...document.querySelectorAll('label')].filter(label=>{
      if(label.htmlFor)return !document.getElementById(label.htmlFor);
      return !label.querySelector('input,select,textarea');
    }).length;
    const iconButtonsWithoutName=[...document.querySelectorAll('button')].filter(button=>
      !button.disabled&&!button.hidden&&
      !String(button.innerText||'').trim()&&
      !button.getAttribute('aria-label')&&!button.getAttribute('title')
    ).length;
    output.textContent='Auditoría HTML5: '+semanticZones+
      ' zonas semánticas · Imágenes sin alt: '+missingAlt+
      ' · Labels sin control: '+labelsWithoutControl+
      ' · Botones sin nombre accesible: '+iconButtonsWithoutName+'.';
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
  $document.on('click.levelupReservation', '[data-start-reservation]', function () {
    beginScheduledReservation(this.dataset.startReservation);
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
  if (state.pendingScheduledReservationId !== null) {
    const id = state.pendingScheduledReservationId;
    window.setTimeout(() => beginScheduledReservation(id), 80);
    return;
  }
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
  setupLevelUpTheme();
  bindLevelUpEvents();
  markHydrated();
  state.hydrationComplete = true;
  loadAccounts();
  loadActiveSessions();
  loadScheduledReservations();
  renderScheduledReservations();
  loadAccessoryQueue();
  renderAccount();
  restoreLevelUpAuthSession().catch(error => {
    console.error('No se pudo restaurar la sesión de Supabase:', error);
    state.activeUser = null;
    renderAccount();
    setAccountAuthNote('No se pudo recuperar tu sesión de Supabase. Inicia sesión nuevamente.', true);
  });
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

window.addEventListener('storage', event => {
  if (event.key === STORAGE.activeSessions) {
    loadActiveSessions();
    renderAccount();
    renderAccessoryQueue();
  }
  if (event.key === STORAGE.accounts) {
    loadAccounts();
    renderAccount();
    renderAccessoryQueue();
  }
  if (event.key === STORAGE.scheduledReservations) {
    loadScheduledReservations();
    renderScheduledReservations();
    populateReservationResources();
    renderMachines();
    renderConsoles();
    state.activeScheduledSignature = activeScheduledSignature();
  }
  if (event.key === STORAGE.machines && Array.isArray(state.machines)) {
    try {
      const saved = JSON.parse(event.newValue || '[]');
      if (Array.isArray(saved)) saved.forEach(entry => {
        const machine = getMachine(entry.id);
        if (machine) ['available', 'sessionStartedAt', 'sessionEndsAt', 'reservationExpiresAt'].forEach(key => {
          if (entry[key] !== undefined) machine[key] = entry[key];
        });
      });
      renderMachines();
      updateStats();
      populateReservationResources();
    } catch (error) { console.warn('No se pudieron sincronizar los estados de PC entre pestañas.', error); }
  }
  if (event.key === STORAGE.consoles && Array.isArray(state.consoles)) {
    try {
      const saved = JSON.parse(event.newValue || '[]');
      if (Array.isArray(saved)) saved.forEach(entry => {
        const consoleUnit = getConsole(entry.id);
        if (consoleUnit) ['available', 'sessionStartedAt', 'sessionEndsAt', 'reservationExpiresAt'].forEach(key => {
          if (entry[key] !== undefined) consoleUnit[key] = entry[key];
        });
      });
      renderConsoles();
      populateReservationResources();
    } catch (error) { console.warn('No se pudieron sincronizar los estados de PlayStation entre pestañas.', error); }
  }
});

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
