(() => {
  'use strict';
  const SONGS_URL = './data/canciones.json';
  const SONGS_CACHE_KEY = 'levelup_karaoke_catalog_v1';
  const QUEUE_KEY = 'levelup_karaoke_queue_v1';
  const RESERVATIONS_KEY = 'levelup_karaoke_reservations_v1';
  let songs = [];
  let queue = readJSON(QUEUE_KEY, []);
  let activeGenre = 'all';
  let searchTerm = '';
  let sortMode = 'title';
  let toastTimer = null;

  function readJSON(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function showToast(message) {
    $('#karaokeToast').text(message).stop(true, true).fadeIn(120);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#karaokeToast').fadeOut(180), 2400);
  }
  function escapeAttribute(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function renderSongs() {
    const filtered = songs.filter(song => {
      const haystack = `${song.titulo} ${song.artista} ${song.genero}`.toLocaleLowerCase('es');
      return (activeGenre === 'all' || song.genero === activeGenre) && haystack.includes(searchTerm);
    });
    filtered.sort((a, b) => String(a[sortMode === 'artist' ? 'artista' : 'titulo']).localeCompare(String(b[sortMode === 'artist' ? 'artista' : 'titulo']), 'es'));
    const html = filtered.map(song => {
      const alreadyQueued = queue.some(item => Number(item.id) === Number(song.id));
      return `<article class="song-card tarjeta-pista" data-id="${Number(song.id)}">
        <img src="${escapeAttribute(song.portada)}" alt="Portada ilustrada de ${escapeAttribute(song.titulo)} — ${escapeAttribute(song.artista)}" loading="lazy" width="66" height="66">
        <div class="song-info"><h3>${escapeAttribute(song.titulo)}</h3><p>${escapeAttribute(song.artista)}</p>
          <div class="song-meta"><span>${escapeAttribute(song.genero)}</span><span>◷ ${escapeAttribute(song.duracion)}</span></div>
          <button class="add-btn btn-agregar-cola" type="button" data-id="${Number(song.id)}" ${alreadyQueued ? 'disabled' : ''}>${alreadyQueued ? 'En la cola ✓' : '+ Agregar a cola'}</button>
        </div></article>`;
    }).join('');
    $('#catalogoKaraoke').html(html);
    $('#songCount').text(`${filtered.length} de ${songs.length} pistas`);
    $('#emptySongs').toggle(filtered.length === 0);
  }
  function renderQueue() {
    if (!queue.length) {
      $('#queueList').html('<li class="queue-empty">Todavía no agregaste canciones.</li>');
      return;
    }
    const html = queue.map((song, index) => `<li class="queue-item" data-id="${Number(song.id)}"><span><b>${index + 1}. ${escapeAttribute(song.titulo)}</b><small>${escapeAttribute(song.artista)} · ${escapeAttribute(song.duracion)}</small></span><button class="remove-btn btn-quitar-cola" type="button" data-id="${Number(song.id)}" aria-label="Quitar ${escapeAttribute(song.titulo)} de la cola">Quitar</button></li>`).join('');
    $('#queueList').html(html);
  }
  async function loadCatalog() {
    $('#catalogError').hide().text('');
    try {
      const response = await fetch(SONGS_URL, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data) || data.length < 15) throw new Error('El catálogo debe contener al menos 15 pistas.');
      const required = ['id','titulo','artista','genero','duracion','portada'];
      data.forEach((song, index) => {
        required.forEach(field => { if (song[field] === undefined || song[field] === null || String(song[field]).trim() === '') throw new Error(`Falta el campo ${field} en la pista ${index + 1}.`); });
      });
      songs = data;
      saveJSON(SONGS_CACHE_KEY, songs);
      renderSongs();
    } catch (error) {
      const cached = readJSON(SONGS_CACHE_KEY, []);
      if (Array.isArray(cached) && cached.length >= 15) {
        songs = cached;
        renderSongs();
        $('#catalogError').text('No se pudo consultar el archivo ahora. Se muestra el catálogo guardado en este dispositivo.').show();
      } else {
        $('#catalogError').text(`${error.message} Comprueba que data/canciones.json exista y que estés usando GitHub Pages o un servidor local.`).show();
        $('#songCount').text('Catálogo no disponible');
      }
    }
  }
  function localDateString(date) {
    const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function initializeDate() {
    const now = new Date();
    const today = localDateString(now);
    $('#reserveDate').attr('min', today).val(today);
    const options = $('#reserveTime option').toArray();
    const nextOption = options.find(option => {
      const [hour, minute] = option.value.split(':').map(Number);
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      return candidate > now;
    });
    if (nextOption) $('#reserveTime').val(nextOption.value);
    else {
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      $('#reserveDate').val(localDateString(tomorrow));
      if (options.length) $('#reserveTime').val(options[0].value);
    }
  }
  function validateReservation() {
    const name = $('#reserveName').val().trim();
    const phone = $('#reservePhone').val().replace(/\D/g, '').slice(0, 8);
    const date = $('#reserveDate').val();
    const time = $('#reserveTime').val();
    const room = $('#reserveRoom').val();
    const people = Number($('#reservePeople').val());
    const capacity = Number($('#reserveRoom option:selected').data('capacity')) || 0;
    $('#reservePhone').val(phone);
    const validName = name.length >= 3;
    const validPhone = /^\d{8}$/.test(phone);
    const dateTime = date && time ? new Date(`${date}T${time}:00`) : null;
    const validDateTime = Boolean(dateTime && !Number.isNaN(dateTime.getTime()) && dateTime > new Date());
    const validPeople = Number.isInteger(people) && people >= 1 && people <= capacity;
    $('#reserveNameError').text(validName ? '' : 'Escribe un nombre de al menos 3 caracteres.');
    $('#reservePhoneError').text(validPhone ? '' : 'Ingresa un número de 8 dígitos.');
    $('#reserveDateError').text(validDateTime ? '' : 'Selecciona una fecha y hora futuras.');
    $('#reserveTimeError').text(validDateTime ? '' : 'La hora debe ser posterior a la hora actual.');
    $('#reservePeopleError').text(validPeople ? '' : `La ${room} admite hasta ${capacity} personas.`);
    $('#reserveRoomError').text(validPeople ? '' : `Reduce el grupo a ${capacity} personas como máximo.`);
    $('#reserveName, #reservePhone, #reserveDate, #reserveTime, #reservePeople, #reserveRoom').removeClass('invalid');
    if (!validName) $('#reserveName').addClass('invalid');
    if (!validPhone) $('#reservePhone').addClass('invalid');
    if (!validDateTime) $('#reserveDate, #reserveTime').addClass('invalid');
    if (!validPeople) $('#reserveRoom, #reservePeople').addClass('invalid');
    return validName && validPhone && validDateTime && validPeople;
  }

  $(function () {
    renderQueue();
    initializeDate();
    loadCatalog();

    $('#songSearch').off('input.karaokeSearch').on('input.karaokeSearch', function () {
      searchTerm = $(this).val().trim().toLocaleLowerCase('es'); renderSongs();
    });
    $('#sortSongs').off('change.karaokeSort').on('change.karaokeSort', function () { sortMode = this.value; renderSongs(); });
    $('#genreFilters').off('click.karaokeGenre', '.filter').on('click.karaokeGenre', '.filter', function () {
      $('#genreFilters .filter').removeClass('active'); $(this).addClass('active'); activeGenre = $(this).data('genre'); renderSongs();
    });
    // Delegación solicitada en la guía: un solo handler para las tarjetas que genera Fetch.
    $('#catalogoKaraoke').off('click.karaokeQueue', '.btn-agregar-cola').on('click.karaokeQueue', '.btn-agregar-cola', function () {
      const id = Number($(this).data('id'));
      const song = songs.find(item => Number(item.id) === id);
      if (!song || queue.some(item => Number(item.id) === id)) return;
      queue.push({id:song.id,titulo:song.titulo,artista:song.artista,duracion:song.duracion});
      saveJSON(QUEUE_KEY, queue); renderQueue(); renderSongs(); showToast(`“${song.titulo}” se agregó a la cola.`);
    });
    $('#queueList').off('click.karaokeRemove', '.btn-quitar-cola').on('click.karaokeRemove', '.btn-quitar-cola', function () {
      const id = Number($(this).data('id')); queue = queue.filter(item => Number(item.id) !== id); saveJSON(QUEUE_KEY, queue); renderQueue(); renderSongs();
    });
    $('#clearQueue').off('click.karaokeClear').on('click.karaokeClear', function () { queue = []; saveJSON(QUEUE_KEY, queue); renderQueue(); renderSongs(); showToast('La cola quedó vacía.'); });
    $('#reservePhone').off('input.karaokePhone').on('input.karaokePhone', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
    $('#reservationForm').off('submit.karaokeReservation').on('submit.karaokeReservation', function (event) {
      event.preventDefault();
      if (!validateReservation()) return;
      const reservation = {
        id: `K${Date.now()}`,
        name: $('#reserveName').val().trim(),
        phone: $('#reservePhone').val(),
        room: $('#reserveRoom').val(),
        date: $('#reserveDate').val(),
        time: $('#reserveTime').val(),
        people: Number($('#reservePeople').val()),
        createdAt: new Date().toISOString(),
        status: 'Solicitud guardada localmente'
      };
      const reservations = readJSON(RESERVATIONS_KEY, []);
      reservations.push(reservation); saveJSON(RESERVATIONS_KEY, reservations);
      this.reset(); initializeDate();
      $('#reserveNameError, #reservePhoneError, #reserveDateError, #reserveTimeError, #reservePeopleError, #reserveRoomError').text('');
      showToast('Solicitud guardada en este dispositivo. Aún requiere confirmación del negocio.');
    });
  });
})();
