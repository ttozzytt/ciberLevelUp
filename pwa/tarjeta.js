class PracticeCard extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;
    this.dataset.ready = "true";
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ":host{display:block}.card{display:flex;flex-direction:column;gap:.4rem;padding:1rem;margin:.5rem 0;border:1px solid var(--line,#dce3ed);border-radius:.8rem;background:var(--surface,#fff);color:var(--text,#172033)}.card p{margin:.1rem 0}";
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("strong");
    title.textContent = this.getAttribute("titulo") || "Tarjeta";
    const detail = document.createElement("p");
    detail.textContent = this.getAttribute("detalle") || "";
    card.append(title, detail);
    shadow.append(style, card);
  }
}
if (!customElements.get("practice-card")) {
  customElements.define("practice-card", PracticeCard);
}
