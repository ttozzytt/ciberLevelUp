$(function () {
  let clics = 0;
  $('#agregarTarjeta').on('click', function () {
    const nombre = $('#nombreTarjeta').val().trim();
    if (!nombre) { $('#resultado').text('Escribe un nombre antes de agregar.'); return; }
    $('<button>', { type: 'button', class: 'item tarjeta' }).text(nombre).appendTo('#contenedorTarjetas');
    $('#nombreTarjeta').val('').trigger('focus');
  });
  // Delegación: el listener se instala en el contenedor, no en cada tarjeta.
  $('#contenedorTarjetas').off('click.bubbling', '.tarjeta').on('click.bubbling', '.tarjeta', function () {
    clics += 1;
    $('#resultado').text(`Clics detectados: ${clics} · Elemento: ${$(this).text()}`);
  });
});
