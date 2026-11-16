$(function(){
 $(document).off('.businessLab');let toastTimer=null;
 function calculate(){const q=Math.max(1,Math.min(10,Number($('#qty').val())||1));const p=Number($('#unitPrice').val())||0;$('#total').text(`Bs ${q*p}`)}
 function notify(msg){$('#toast').stop(true,true).text(msg).slideDown(160);clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').fadeOut(200),3000)}
 $(document).on('click.businessLab','#themeToggle',function(){$('body').toggleClass('light')});
 $(document).on('click.businessLab','.tab',function(){$('.tab').removeClass('active');$(this).addClass('active');const g=this.dataset.group;let visible=0;$('#cards article').each(function(){const show=g==='all'||this.dataset.group===g;$(this)[show?'fadeIn':'fadeOut'](120);if(show)visible++});$('#emptyState').prop('hidden',visible!==0)});
 $(document).on('input.businessLab','#catalogFilter',function(){const term=this.value.toLocaleLowerCase('es');let visible=0;$('#cards article').each(function(){const show=this.textContent.toLocaleLowerCase('es').includes(term);$(this)[show?'show':'hide']();if(show)visible++});$('#emptyState').prop('hidden',visible!==0)});
 $(document).on('click.businessLab','.details',function(){$(this).next('.detail').stop(true,true).slideToggle(160)});
 $(document).on('input.businessLab change.businessLab','#qty,#unitPrice',calculate);
 $(document).on('submit.businessLab','#safeForm',function(e){e.preventDefault();const value=$('#contactName').val().trim();if(!value){notify('Completa el campo antes de continuar.');return;}$('#safeResult').empty().append($('<span>').text(value));$('#contactName').val('')});
 $(document).on('click.businessLab','#openModal',function(){$('#modalSummary').text(`${$('#qty').val()} unidad(es) · ${$('#total').text()}`);$('#modal').addClass('open').attr('aria-hidden','false')});
 $(document).on('click.businessLab','#closeModal',function(){$('#modal').removeClass('open').attr('aria-hidden','true')});
 $(document).on('click.businessLab','#confirm',function(){$('#modal').removeClass('open').attr('aria-hidden','true');notify('Demostración registrada localmente en esta práctica.')});
 calculate();
});