$(function () {
  $('#agregar').on('click', function () {
    const valor = $('#entrada').val().trim();
    if (!valor) { $('#estado').text('Escribe un elemento antes de agregar.'); return; }
    const $li = $('<li>').addClass('row-item');
    $('<span>').text(valor).appendTo($li);
    $('<button>', { type: 'button', class: 'quitar secondary' }).text('Quitar').appendTo($li);
    $('#lista').append($li);
    $('#entrada').val('').trigger('focus');
    $('#estado').text('Canción añadida a la lista de práctica.');
  });
  $('#lista').off('click.lista', '.quitar').on('click.lista', '.quitar', function () {
    $(this).closest('li').remove();
    $('#estado').text('Canción quitada de la lista.');
  });
});
