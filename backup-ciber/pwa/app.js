'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const kind = document.body.dataset.exercise || '';
  const byId = id => document.getElementById(id);
  const say = (id, value) => { const node=byId(id); if(node) node.textContent=String(value); };
  const textNode = (tag, value) => { const node=document.createElement(tag); node.textContent=String(value); return node; };

  if(kind==='theme'){
    const button=byId('themeToggle');let current=localStorage.getItem('levelup-lab-theme')||'dark';
    const apply=()=>{document.documentElement.dataset.theme=current;button.textContent=current==='dark'?'Activar tema claro':'Activar tema oscuro';say('themeStatus','Tema activo: '+current);};
    apply();button?.addEventListener('click',()=>{current=current==='dark'?'light':'dark';localStorage.setItem('levelup-lab-theme',current);apply();});
  }
  if(kind==='filter'){
    const select=byId('categoryFilter'),grid=byId('filterGrid');
    fetch('../../semana2/03-fetch-lazyloading/data/catalogo.json').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(items=>{const draw=()=>{grid.replaceChildren();items.filter(x=>select.value==='all'||x.category===select.value).slice(0,8).forEach(x=>{const card=document.createElement('article');card.className='demo-card';card.append(textNode('strong',x.name),textNode('p',x.description),textNode('small',x.priceLabel));grid.append(card);});say('filterStatus',grid.children.length+' resultados.');};select.addEventListener('change',draw);draw();})
      .catch(e=>say('filterStatus','No se pudo cargar el catálogo: '+e.message));
  }
  if(kind==='menu'){const button=byId('menuButton'),menu=byId('demoMenu');button?.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));say('menuStatus',open?'Menú abierto.':'Menú cerrado.');});}
  if(kind==='validation'){
    const form=byId('demoForm'),name=byId('clientName'),phone=byId('clientPhone');
    const validate=()=>{const n=name.value.trim().length>=2,p=/^\\d{8}$/.test(phone.value.trim());say('nameError',n?'':'Escribe al menos 2 caracteres.');say('phoneError',p?'':'Ingresa 8 dígitos.');return n&&p;};
    form?.addEventListener('input',validate);form?.addEventListener('submit',e=>{e.preventDefault();say('formStatus',validate()?'Datos válidos para la demostración.':'Revisa los campos marcados.');});
  }
  if(kind==='log1'||kind==='log2'){
    const input=byId('logInput'),list=byId('logList');
    byId('addLog')?.addEventListener('click',()=>{const value=input.value.trim();if(!value)return;const row=document.createElement('li');row.className='log-row';row.append(textNode('span',new Date().toLocaleTimeString('es-BO')+' · '+value));if(kind==='log2'){const remove=document.createElement('button');remove.type='button';remove.dataset.removeLog='true';remove.textContent='Quitar';row.append(remove);}list.append(row);input.value='';say('logStatus',list.children.length+' registros.');});
    if(kind==='log2')list?.addEventListener('click',e=>{const button=e.target.closest('[data-remove-log]');if(button){button.closest('li')?.remove();say('logStatus',list.children.length+' registros.');}});
  }
  if(kind==='accordion'){
    document.querySelectorAll('[data-accordion]').forEach(button=>button.addEventListener('click',()=>{const panel=byId(button.dataset.accordion),open=panel.hidden;document.querySelectorAll('.accordion-content').forEach(x=>x.hidden=true);document.querySelectorAll('[data-accordion]').forEach(x=>x.setAttribute('aria-expanded','false'));panel.hidden=!open;button.setAttribute('aria-expanded',String(open));}));
    byId('accordionTheme')?.addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';});
  }
  if(kind==='calculator'){
    const hours=byId('hours'),dialog=byId('confirmDialog');let timer=null,remaining=30;
    const refresh=()=>{const count=Math.max(1,Math.min(8,Number(hours.value)||1));say('total','Bs '+(count*40).toFixed(2));say('dialogTotal','Bs '+(count*40).toFixed(2));};
    const close=message=>{if(timer!==null){clearInterval(timer);timer=null;}if(dialog.open)dialog.close();say('timerStatus',message||'');};
    hours?.addEventListener('input',refresh);byId('openConfirm')?.addEventListener('click',()=>{refresh();remaining=30;say('countdown','00:30');dialog.showModal();if(timer!==null)clearInterval(timer);timer=setInterval(()=>{remaining--;say('countdown','00:'+String(remaining).padStart(2,'0'));if(remaining<=0)close('La confirmación expiró.');},1000);});
    byId('acceptConfirm')?.addEventListener('click',()=>close('Ejercicio confirmado; no se creó una reserva real.'));byId('cancelConfirm')?.addEventListener('click',()=>close('Confirmación cancelada.'));
    dialog?.addEventListener('close',()=>{if(timer!==null){clearInterval(timer);timer=null;}});refresh();
  }
  if(kind==='fetch'){
    const container=byId('catalogue'),output=byId('catalogStatus');
    fetch('./data/catalogo.json').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(items=>{
      container.replaceChildren();items.forEach(item=>{const card=document.createElement('article');card.className='demo-card card-body';const image=document.createElement('img');image.src=item.image;image.alt=item.name;image.width=320;image.height=220;image.loading='lazy';image.decoding='async';const pick=document.createElement('button');pick.type='button';pick.dataset.pickItem=item.id;pick.textContent='Seleccionar';card.append(image,textNode('strong',item.name),textNode('p',item.description),textNode('small',item.priceLabel),pick);container.append(card);});output.textContent=items.length+' equipos cargados desde JSON.';
    }).catch(e=>output.textContent='No se pudo leer el catálogo: '+e.message);
    container?.addEventListener('click',e=>{const button=e.target.closest('[data-pick-item]');if(button)output.textContent='Seleccionaste el recurso '+button.dataset.pickItem+'.';});
  }
  if(kind==='offline'){
    const key='levelup-lab-offline-notes',list=byId('offlineList');
    const refresh=()=>{say('networkStatus',(navigator.onLine?'Online':'Offline')+' · notas guardadas localmente; no son reservas.');list.replaceChildren();JSON.parse(localStorage.getItem(key)||'[]').forEach(note=>list.append(textNode('li',note)));};
    byId('saveOfflineNote')?.addEventListener('click',()=>{const value=byId('offlineNote').value.trim();if(!value)return;const notes=JSON.parse(localStorage.getItem(key)||'[]');notes.push(new Date().toLocaleString('es-BO')+' · '+value);localStorage.setItem(key,JSON.stringify(notes));byId('offlineNote').value='';refresh();});
    window.addEventListener('online',refresh);window.addEventListener('offline',refresh);refresh();
  }
  if(kind==='xss'){byId('safeForm')?.addEventListener('submit',e=>{e.preventDefault();byId('safeOutput').textContent='Se muestra como texto plano: '+byId('unsafeName').value;});}
  if(kind==='component'){
    class LevelupCard extends HTMLElement{connectedCallback(){if(this.dataset.ready==='true')return;this.dataset.ready='true';const card=document.createElement('article');card.className='demo-card card-body';card.append(textNode('strong',this.getAttribute('titulo')||'Tarjeta'),textNode('p',this.getAttribute('detalle')||''));this.replaceChildren(card);}}
    if(!customElements.get('levelup-card'))customElements.define('levelup-card',LevelupCard);
  }
  if(kind==='grid'){
    const button=byId('simulateMobile'),grid=byId('demoGrid');button?.addEventListener('click',()=>{const active=grid.classList.toggle('sim-movil');button.setAttribute('aria-pressed',String(active));button.textContent=active?'Restaurar vista adaptable':'Simular vista móvil';say('gridStatus',active?'Una columna activa.':'Vista automática.');});
  }
  if(kind==='cwv'){
    const results=byId('safeResult'),input=byId('htmlInput');
    byId('sanitizeButton')?.addEventListener('click',()=>{const raw=input.value;const cleaned=window.DOMPurify?.sanitize?window.DOMPurify.sanitize(raw):raw;results.textContent='Salida segura como texto: '+cleaned;});
    const metrics={};[['largest-contentful-paint','LCP'],['layout-shift','CLS']].forEach(([type,label])=>{try{const observer=new PerformanceObserver(list=>{const rows=list.getEntries();if(rows.length){const entry=rows[rows.length-1];metrics[label]=Math.round((entry.value??entry.startTime)*100)/100;say('cwvStatus',Object.entries(metrics).map(([k,v])=>k+': '+v).join(' · '));}});observer.observe({type,buffered:true});}catch(_){}});
    say('cwvStatus','Métricas disponibles según el navegador. La salida siempre se trata como texto.');
  }
});