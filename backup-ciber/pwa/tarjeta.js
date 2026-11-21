class LevelupCard extends HTMLElement{
  connectedCallback(){
    if(this.dataset.ready==='true')return;
    this.dataset.ready='true';
    const card=document.createElement('article');
    card.className='demo-card card-body';
    const title=document.createElement('strong');
    title.textContent=this.getAttribute('titulo')||'Tarjeta';
    const detail=document.createElement('p');
    detail.textContent=this.getAttribute('detalle')||'';
    card.append(title,detail);
    this.replaceChildren(card);
  }
}
if(!customElements.get('levelup-card'))customElements.define('levelup-card',LevelupCard);