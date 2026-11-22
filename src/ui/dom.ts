/** A tiny element builder, so each card reads as its markup. */
type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An inline SVG from markup we generate ourselves (never user text). */
export function svgFrom(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const el = tpl.content.firstElementChild;
  if (!el || el.namespaceURI !== SVG_NS) return document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  return el as SVGSVGElement;
}

/** Sets an input's value only when it differs and the person isn't typing in it. */
export function syncValue(el: HTMLInputElement, value: string): void {
  if (el.value !== value && document.activeElement !== el) el.value = value;
}

/** A collapsible rail card with the title as a real heading inside the summary. */
export function railCard(title: string, open: boolean, ...body: Child[]): HTMLElement {
  const details = h('details', { open }, h('summary', {}, h('h2', { class: 'card-title', text: title })), h('div', { class: 'card-body' }, ...body));
  return h('section', { class: 'rail-card', 'data-ph-capture-attribute-section': title.toLowerCase() }, details);
}

/** A segmented single-choice control made of real buttons, with aria-pressed for state. */
export function segmented<T extends string>(
  label: string,
  options: { value: T; text: string; attrs?: Attrs }[],
  onPick: (v: T) => void
): { el: HTMLElement; set(v: T): void } {
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false', ...o.attrs }, o.text);
    b.addEventListener('click', () => onPick(o.value));
    return b;
  });
  const el = h('div', { class: 'segmented', role: 'group', 'aria-label': label }, ...buttons);
  return {
    el,
    set(v) {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
    },
  };
}

/** A labelled switch (a checkbox styled as a toggle). */
export function toggle(label: string, name: string, onChange: (on: boolean) => void, hint?: string): { el: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', name, role: 'switch' });
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'toggle' }, input, h('span', { class: 'toggle-text' }, h('span', { text: label }), hint ? h('small', { text: hint }) : null));
  return { el, input };
}
