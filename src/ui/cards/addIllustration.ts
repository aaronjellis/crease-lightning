/**
 * The Add dialog: every icon, grouped by theme (the current theme's group first, then the others,
 * then Everyday), with a Find box that narrows the list by name. Thumbnails come from the icons' SVG
 * source and the buttons are built on first open, so opening it never builds an icon's `poly`.
 */
import { ICONS, THEMES, type Icon } from '../../themes';
import type { ThemeId } from '../../core/model';
import { h } from '../dom';
import { iconThumb } from '../iconThumb';
import { DECORATIONS, EXPORT } from '../strings';

interface Group {
  key: ThemeId | 'everyday';
  el: HTMLElement;
  picks: { icon: Icon; el: HTMLElement }[];
}

export function addIllustrationDialog(onPick: (iconId: string) => void): { el: HTMLDialogElement; open(theme: ThemeId): void } {
  const find = h('input', { type: 'search', name: 'decor-find', id: 'cl-decor-find', class: 'text-input ph-no-capture', autocomplete: 'off' });
  const list = h('div', { class: 'decor-groups' });
  const none = h('p', { class: 'hint', hidden: true, text: DECORATIONS.noMatch });
  const close = h('button', { type: 'button', class: 'ghost icon-button modal-close', 'aria-label': EXPORT.close }, '×');
  const el = h(
    'dialog',
    { class: 'decor-add', 'aria-labelledby': 'cl-decor-add-title', 'data-ph-capture-attribute-section': 'add-illustration' },
    h(
      'div',
      { class: 'modal-body' },
      h('div', { class: 'modal-head' }, h('h2', { id: 'cl-decor-add-title', text: DECORATIONS.addTitle }), close),
      h('label', { class: 'decor-find', for: 'cl-decor-find' }, h('span', { class: 'sub-heading', text: DECORATIONS.find }), find),
      list,
      none
    )
  );

  let groups: Group[] | null = null;
  const build = (): Group[] => {
    const keys: { key: Group['key']; name: string }[] = [
      ...THEMES.map((t) => ({ key: t.id, name: t.name })),
      { key: 'everyday', name: DECORATIONS.everyday },
    ];
    return keys
      .map(({ key, name }) => {
        const icons = ICONS.filter((i) => i.themes.includes(key));
        const picks = icons.map((icon) => {
          const b = h(
            'button',
            { type: 'button', class: 'decor-pick', 'data-ph-capture-attribute-icon': icon.id },
            h('span', { class: 'decor-thumb' }, iconThumb(icon.id)),
            h('span', { text: icon.name })
          );
          b.addEventListener('click', () => {
            closeDialog();
            onPick(icon.id);
          });
          return { icon, el: h('li', {}, b) };
        });
        const el = h('section', { class: 'decor-group' }, h('h3', { class: 'sub-heading', text: name }), h('ul', { class: 'decor-picks' }, ...picks.map((p) => p.el)));
        return { key, el, picks };
      })
      .filter((g) => g.picks.length > 0);
  };

  const filter = () => {
    const q = find.value.trim().toLowerCase();
    let any = false;
    for (const g of groups ?? []) {
      let shown = 0;
      for (const p of g.picks) {
        const match = !q || p.icon.name.toLowerCase().includes(q);
        p.el.hidden = !match;
        if (match) shown++;
      }
      g.el.hidden = shown === 0;
      any ||= shown > 0;
    }
    none.hidden = any;
  };
  find.addEventListener('input', filter);

  function closeDialog() {
    if (typeof el.close === 'function') el.close();
    else el.removeAttribute('open');
  }
  close.addEventListener('click', closeDialog);
  el.addEventListener('click', (e) => e.target === el && closeDialog());

  return {
    el,
    open(theme) {
      groups ??= build();
      // The current theme's group first, then the other themes in order, then Everyday.
      list.replaceChildren(...[...groups].sort((a, b) => Number(b.key === theme) - Number(a.key === theme)).map((g) => g.el));
      find.value = '';
      filter();
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
      find.focus();
    },
  };
}
