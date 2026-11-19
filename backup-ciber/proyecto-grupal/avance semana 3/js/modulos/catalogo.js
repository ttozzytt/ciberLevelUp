'use strict';

/* Módulo Catálogo: obtiene datos externos al HTML y construye tarjetas aisladas. */
(() => {
  const grid = document.getElementById('lcgCatalogGrid');
  const total = document.getElementById('lcgTotal');
  if (!grid) return;
  const fallbackImage = '../../imagenes/imagen-respaldo.svg';

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function makeCard(item) {
    const category = item.category;
    const card = node('article', 'lcg-card');
    card.dataset.category = category;
    card.dataset.id = String(item.id);

    const image = node('img', 'lcg-card__image');
    image.src = item.image;
    image.alt = item.alt;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied === 'true') image.hidden = true;
      else { image.dataset.fallbackApplied = 'true'; image.src = fallbackImage; }
    });

    const tag = node('span', 'lcg-card__tag', item.tag);
    const title = node('h3', 'lcg-card__title', item.title);
    const description = node('p', 'lcg-card__description', item.description);
    const spec = node('p', 'lcg-card__spec', item.spec);
    const state = node('p', 'lcg-card__state', 'Estado: Disponible');
    state.setAttribute('role', 'status');

    const footer = node('footer', 'lcg-card__footer');
    const price = node('div', 'lcg-card__price', 'Bs ' + item.price);
    const unit = node('small', '', 'por hora');
    price.append(unit);
    const button = node('button', 'lcg-card__select', 'Simular selección');
    button.type = 'button';
    button.dataset.action = 'toggle-card';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Simular selección de ' + item.title);
    footer.append(price, button);
    card.append(image, tag, title, description, spec, state, footer);
    return card;
  }

  function mapComputer(item) {
    const names = { basic: 'PC Básica', standard: 'PC Estándar', premium: 'PC Premium' };
    const descriptions = {
      basic: 'Equipo para estudio, navegación y eSports ligeros.',
      standard: 'Equipo para gaming fluido en resolución 1080p.',
      premium: 'Equipo de alto rendimiento para jugar y transmitir.'
    };
    return {
      id: 'pc-' + item.type,
      category: item.type,
      tag: 'Computadora',
      title: names[item.type] || item.label,
      description: descriptions[item.type] || 'Equipo disponible en el catálogo LevelUp.',
      spec: [item.cpu, item.gpu, item.ram].filter(Boolean).join(' · '),
      price: item.price,
      image: item.image.startsWith('./') ? '../../' + item.image.slice(2) : item.image,
      alt: item.imageAlt || names[item.type] || item.label
    };
  }

  async function loadCatalog() {
    try {
      const [computersResponse, consolesResponse] = await Promise.all([
        fetch('../../data/computadoras.json', { cache: 'no-cache' }),
        fetch('../../data/consolas.json', { cache: 'no-cache' })
      ]);
      if (!computersResponse.ok || !consolesResponse.ok) throw new Error('No se pudieron cargar los datos del backup.');
      const [computers, consoles] = await Promise.all([computersResponse.json(), consolesResponse.json()]);
      const uniqueComputers = new Map();
      computers.forEach(item => { if (!uniqueComputers.has(item.type)) uniqueComputers.set(item.type, item); });
      const items = [...uniqueComputers.values()].map(mapComputer);
      const consoleItem = consoles[0];
      if (consoleItem) {
        items.push({
          id: 'playstation-5', category: 'console', tag: 'Consola',
          title: 'PlayStation 5', description: 'Consola con sofá gamer para jugar solo o acompañado.',
          spec: '1 mando incluido · Mando adicional: Bs 6 por sesión',
          price: consoleItem.price, image: '../../imagenes/playstation.webp',
          alt: consoleItem.imageAlt || 'Consola PlayStation 5'
        });
      }
      const fragment = document.createDocumentFragment();
      items.forEach(item => fragment.append(makeCard(item)));
      grid.replaceChildren(fragment);
      grid.setAttribute('aria-busy', 'false');
      if (total) total.textContent = String(items.length);
      window.dispatchEvent(new CustomEvent('lcg:catalog-ready', { detail: { count: items.length } }));
    } catch (error) {
      grid.setAttribute('aria-busy', 'false');
      grid.replaceChildren(node('p', 'lcg-loading', 'No se pudo cargar el catálogo. Conéctate una vez para guardar los datos en esta PWA.'));
      if (total) total.textContent = '0';
      console.error('[PWA Grupal] Error del catálogo:', error);
    }
  }

  grid.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-action="toggle-card"]') : null;
    if (!button) return;
    const card = button.closest('.lcg-card');
    const state = card?.querySelector('.lcg-card__state');
    if (!card || !state) return;
    const active = card.classList.toggle('lcg-card--activo');
    state.textContent = active ? 'Estado: Seleccionado (Simulación)' : 'Estado: Disponible';
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Quitar simulación' : 'Simular selección';
    const selected = [...grid.querySelectorAll('.lcg-card--activo')].map(item => item.querySelector('.lcg-card__title')?.textContent || '');
    window.dispatchEvent(new CustomEvent('lcg:selection-change', { detail: { selected, last: card.querySelector('.lcg-card__title')?.textContent || '' } }));
  });

  document.getElementById('lcgFilters')?.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-category-filter]') : null;
    if (!button) return;
    const filter = button.dataset.categoryFilter;
    document.querySelectorAll('[data-category-filter]').forEach(item => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    grid.querySelectorAll('.lcg-card').forEach(card => {
      card.hidden = filter !== 'all' && card.dataset.category !== filter;
    });
  });

  loadCatalog();
})();