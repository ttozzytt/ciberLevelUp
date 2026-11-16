$(function () {
  function hidratarInterfaz() {
    const $box = $('#contenedorMenu');
    if (!$box.length || $box.attr('data-hidratado') === 'true') return;
    $('#navMenu').removeClass('hidden').hide();
    $('#btnPWA').text('☰ Menú interactivo (Hidratado)')
      .off('click.hidratacion')
      .on('click.hidratacion', function () { $('#navMenu').stop(true, true).slideToggle(300); });
    $box.attr('data-hidratado', 'true');
    $('#estado').text('Hidratación completada: el botón conserva el mismo elemento del DOM.');
  }
  window.setTimeout(hidratarInterfaz, 500);
});
