$(function () {
  $('#analizar').on('click', function () {
    const source = $('#codigo').val();
    const findings = [];
    let clean = source;
    const blocked = ['ad-banner', 'promo-box', 'social-ads', 'analytics', 'tracker'];
    blocked.forEach(function (name) {
      if (source.toLowerCase().includes(name)) {
        findings.push(`Clase o identificador sospechoso: ${name}. Usa nombres semánticos que describan el contenido.`);
        clean = clean.replace(new RegExp(name, 'gi'), 'seccion-destacada');
      }
    });
    if (/height\s*:\s*100vh/i.test(source) && !/min-height\s*:\s*100dvh/i.test(source)) {
      findings.push('Se detectó height:100vh. Revisa el uso de min-height:100dvh para adaptarse al viewport móvil.');
      clean = clean.replace(/height\s*:\s*100vh/gi, 'min-height:100dvh');
    }
    if (!findings.length) findings.push('No se encontraron los patrones revisados en este ejercicio.');
    const list = $('#hallazgos').empty();
    findings.forEach(function (finding) { $('<li>').text(finding).appendTo(list); });
    $('#sugerido').val(clean);
    $('#resultado').removeClass('hidden').hide().slideDown(180);
  });
});
