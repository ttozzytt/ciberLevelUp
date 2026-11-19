$(function () {
  const $catalogo = $('#catalogo');
  fetch('data/catalogo.json')
    .then(function (response) {
      if (!response.ok) throw new Error(`HTTP ${response.status}: no se pudo cargar el catálogo.`);
      return response.json();
    })
    .then(function (items) {
      items.forEach(function (item) {
        const card = document.createElement('article');
        card.className = 'item';
        card.dataset.id = String(item.id);
        const img = document.createElement('img');
        img.src = item.portada || 'assets/producto-ejemplo.svg';
        img.alt = `Portada de ${item.titulo}`;
        img.loading = 'lazy';
        img.width = 160; img.height = 110;
        const title = document.createElement('h3'); title.textContent = item.titulo;
        const detail = document.createElement('p'); detail.textContent = `${item.artista} · ${item.genero}`;
        const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Pista de prueba';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ver-item'; btn.textContent = 'Añadir a cola';
        card.append(img, title, detail, tag, document.createTextNode(' '), btn);
        $catalogo[0].append(card);
      });
      $('#estado').text(`${items.length} registros cargados desde JSON.`);
    })
    .catch(function (error) { $('#estado').text(`Error de carga: ${error.message}`); });
  $catalogo.off('click.catalogo', '.ver-item').on('click.catalogo', '.ver-item', function () {
    const id = $(this).closest('.item').data('id');
    $('#estado').text(`Seleccionaste el registro ${id}.`);
  });
});
