'use strict';

/* Proyecto Personal: los datos viven en data/catalogo.json; aquí solo se crea la vista. */
(() => {
  const grid = document.getElementById('catalogoGrid');
  const count = document.getElementById('contadorCatalogo');
  if (!grid) return;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function createCard(item) {
    const card = make('article', 'card-item');
    card.dataset.id = String(item.id);
    card.dataset.category = item.category;

    const image = make('img', 'card-item__imagen');
    image.src = item.image;
    image.alt = item.alt;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.src = '../../imagenes/imagen-respaldo.svg';
    }, { once: true });

    const category = make('span', 'card-item__categoria', item.kind);
    const title = make('h2', 'card-item__titulo', item.name);
    const description = make('p', 'card-item__descripcion', item.description);
    const status = make('p', 'card-item__estado', 'Estado: Disponible');
    status.setAttribute('role', 'status');

    const footer = make('footer', 'card-item__pie');
    const price = make('div', 'card-item__precio');
    price.append(make('strong', '', item.price), make('span', '', item.unit));
    const button = make('button', 'btn-simular', 'Simular Selección');
    button.type = 'button';
    button.dataset.cardAction = 'toggle';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Simular selección de ' + item.name);
    footer.append(price, button);
    card.append(image, category, title, description, status, footer);
    return card;
  }

  async function loadCatalog() {
    try {
      const response = await fetch('./data/catalogo.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('No se pudo leer el catálogo local.');
      const items = await response.json();
      if (!Array.isArray(items) || !items.length) throw new Error('El catálogo está vacío.');
      const fragment = document.createDocumentFragment();
      items.forEach(item => fragment.append(createCard(item)));
      grid.replaceChildren(fragment);
      grid.setAttribute('aria-busy', 'false');
      if (count) count.textContent = String(items.length);
    } catch (error) {
      grid.setAttribute('aria-busy', 'false');
      grid.replaceChildren(make('p', 'pwc-loading', 'No se pudo cargar el catálogo. Abre la PWA con conexión una vez y vuelve a intentarlo.'));
      if (count) count.textContent = '0';
      console.error('[PWA Personal] Error de catálogo:', error);
    }
  }

  /* Delegación de eventos: solo se modifica la tarjeta que contiene el botón pulsado. */
  grid.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-card-action="toggle"]') : null;
    if (!button) return;
    const card = button.closest('.card-item');
    const status = card?.querySelector('.card-item__estado');
    if (!card || !status) return;
    const active = card.classList.toggle('card-item--activo');
    status.textContent = active ? 'Estado: Seleccionado (Simulación)' : 'Estado: Disponible';
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Quitar simulación' : 'Simular Selección';
  });

  document.addEventListener('click', event => {
    const filter = event.target instanceof Element ? event.target.closest('[data-filter]') : null;
    if (!filter) return;
    const value = filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    grid.querySelectorAll('.card-item').forEach(card => {
      card.hidden = value !== 'all' && card.dataset.category !== value;
    });
  });

  loadCatalog();
})();