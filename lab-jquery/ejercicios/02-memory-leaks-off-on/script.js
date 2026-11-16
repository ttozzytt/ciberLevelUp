$(function () {
  let acciones = 0;
  function registrarEvento() {
    // Quita la versión anterior antes de añadir el único listener activo.
    $(document).off('click.memoria', '#btnAccion');
    $(document).on('click.memoria', '#btnAccion', function () {
      acciones += 1;
      $('#resultado').text(`Acciones ejecutadas: ${acciones}`);
    });
    $('#estado').text('Listener limpio registrado. Repetir el registro no duplica la acción.');
  }
  $('#btnRegistrar').on('click', registrarEvento);
  registrarEvento();
});
