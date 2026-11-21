$(function () {
  $(document).off('.levelupLab');
  let toastTimer = null;

  function calculate() {
    const hours = Math.max(1, Math.min(8, Number($('#qty').val()) || 1));
    const rate = Number($('#unitPrice').val()) || 0;
    $('#total').text('Bs ' + (hours * rate).toFixed(2));
  }

  function notify(message) {
    $('#toast').stop(true, true).text(message).slideDown(160);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').fadeOut(200), 2800);
  }

  $(document).on('click.levelupLab', '#themeToggle', function () {
    const light = $('body').toggleClass('light').hasClass('light');
    $(this).attr('aria-pressed', String(light));
  });

  $(document).on('click.levelupLab', '.tab', function () {
    $('.tab').removeClass('active');
    $(this).addClass('active');
    const group = this.dataset.group;
    let visible = 0;
    $('#cards article').each(function () {
      const show = group === 'all' || this.dataset.group === group;
      $(this)[show ? 'fadeIn' : 'fadeOut'](120);
      if (show) visible++;
    });
    $('#emptyState').prop('hidden', visible !== 0);
  });

  $(document).on('input.levelupLab', '#catalogFilter', function () {
    const term = this.value.toLocaleLowerCase('es');
    let visible = 0;
    $('#cards article').each(function () {
      const show = this.textContent.toLocaleLowerCase('es').includes(term);
      $(this)[show ? 'show' : 'hide']();
      if (show) visible++;
    });
    $('#emptyState').prop('hidden', visible !== 0);
  });

  $(document).on('click.levelupLab', '.details', function () {
    const expanded = $(this).attr('aria-expanded') === 'true';
    $(this).next('.detail').stop(true, true).slideToggle(160);
    $(this).attr('aria-expanded', String(!expanded));
  });

  $(document).on('input.levelupLab change.levelupLab', '#qty, #unitPrice', calculate);

  $(document).on('submit.levelupLab', '#safeForm', function (event) {
    event.preventDefault();
    const value = $('#contactName').val().trim();
    if (!value) {
      notify('Completa el nombre antes de continuar.');
      return;
    }
    $('#safeResult').empty().append($('<span>').text(value));
    $('#contactName').val('');
  });

  $(document).on('click.levelupLab', '#openModal', function () {
    $('#modalSummary').text($('#qty').val() + ' hora(s) · ' + $('#total').text());
    $('#modal').addClass('open').attr('aria-hidden', 'false');
  });

  function closeModal() {
    $('#modal').removeClass('open').attr('aria-hidden', 'true');
  }

  $(document).on('click.levelupLab', '#closeModal, #confirm', closeModal);
  $(document).on('click.levelupLab', '#modal', function (event) {
    if (event.target === this) closeModal();
  });

  calculate();
});
