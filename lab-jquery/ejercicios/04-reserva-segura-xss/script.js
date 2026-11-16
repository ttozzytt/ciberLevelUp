$(function () {
  $('#formReserva').off('submit.reserva').on('submit.reserva', function (event) {
    event.preventDefault();
    const nombre = $('#clienteNombre').val().trim();
    const servicio = $('#servicio').val();
    if (!nombre) { $('#estado').text('Escribe un nombre.'); return; }
    // Se crean nodos y se inserta la entrada no confiable mediante .text().
    const $item = $('<li>').addClass('item-reserva');
    const $cliente = $('<strong>').text(nombre + ' — ');
    const $detalle = $('<span>').text(servicio);
    $item.append($cliente, $detalle);
    $('#listaReservas').append($item);
    this.reset();
    $('#estado').text('Reserva de prueba registrada como texto seguro.');
  });
});
