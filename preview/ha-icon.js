// Small standalone-preview adapter. Home Assistant supplies ha-icon in production.
if (!customElements.get('ha-icon')) {
  const drawings = {
    'mdi:menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
    'mdi:refresh':'<path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 12a7 7 0 0 0-2-5"/>',
    'mdi:check':'<path d="m5 12 4 4L19 6"/>',
    'mdi:view-dashboard-outline':'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    'mdi:filter-outline':'<path d="M3 4h18l-7 8v8l-4-2v-6Z"/>',
    'mdi:water-sync':'<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M8 7V3h8v4M5 11h14"/>',
    'mdi:flask-outline':'<path d="M9 3h6M10 3v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10"/>',
    'mdi:cog-outline':'<path d="M9 2h6v2.6l1.8 1 2.3-1.3 3 5.2-2.3 1.3v2.4l2.3 1.3-3 5.2-2.3-1.3-1.8 1V22H9v-2.6l-1.8-1-2.3 1.3-3-5.2 2.3-1.3v-2.4L1.9 9.5l3-5.2 2.3 1.3L9 4.6Z"/><circle cx="12" cy="12" r="3.2"/>',
    'mdi:chevron-right':'<path d="m9 5 7 7-7 7"/>',
    'mdi:alert-circle-outline':'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
    'mdi:information-outline':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    'mdi:calendar-check-outline':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/>',
  };
  customElements.define('ha-icon', class extends HTMLElement {
    static get observedAttributes() { return ['icon']; }
    constructor() {super();this.attachShadow({mode:'open'});}
    connectedCallback() {this.paint();}
    attributeChangedCallback() {this.paint();}
    paint() {this.shadowRoot.innerHTML='<style>:host{display:inline-flex;flex-shrink:0;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}svg{width:100%;height:100%}</style><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(drawings[this.getAttribute('icon')]||drawings['mdi:information-outline'])+'</svg>';}
  });
}
