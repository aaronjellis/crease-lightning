/**
 * The theme rail: a tile per theme (jacket colour with its first style's first icon, drawn instantly
 * from the icon data), and Surprise me.
 */
import { applyTheme } from '../core/model';
import { themeById, THEMES, type Theme } from '../themes';
import type { Ctx, View } from './context';
import { h } from './dom';
import { iconThumb } from './iconThumb';
import { ACTIONS, THEMES_HEADING } from './strings';

function thumb(t: Theme): HTMLElement {
  const first = t.styles[0]?.items[0]?.icon;
  const art = first
    ? iconThumb(first)
    : h('span', { class: 'thumb-letter', 'aria-hidden': 'true', text: t.lines[0].charAt(0) });
  return h('span', { class: 'thumb', style: `--thumb-bg:${t.colours.jacket};--thumb-fg:${t.colours.inner}` }, art);
}

export function themeRail(ctx: Ctx): View {
  const pick = (t: Theme) => {
    const p = ctx.params();
    if (p.theme !== t.id) ctx.update(applyTheme(p, t, themeById(p.theme)), { undoable: true });
  };
  const tiles = THEMES.map((t) => {
    const b = h('button', { type: 'button', class: 'theme-tile', 'aria-pressed': 'false', 'data-ph-capture-attribute-theme': t.id }, thumb(t), h('span', { class: 'theme-name', text: t.name }));
    b.addEventListener('click', () => pick(t));
    return h('li', {}, b);
  });
  const surprise = h('button', { type: 'button', class: 'surprise' }, h('span', { class: 'surprise-icon', 'aria-hidden': 'true', text: '↻' }), ACTIONS.surprise);
  surprise.addEventListener('click', () => {
    const others = THEMES.filter((t) => t.id !== ctx.params().theme && t.id !== 'blank');
    pick(others[Math.floor(Math.random() * others.length)]);
  });

  const el = h(
    'nav',
    { class: 'themes', 'aria-labelledby': 'cl-themes-heading', 'data-ph-capture-attribute-section': 'themes' },
    h('h2', { class: 'rail-heading', id: 'cl-themes-heading', text: THEMES_HEADING }),
    h('ul', { class: 'theme-list', 'aria-label': 'Themes' }, ...tiles),
    surprise
  );

  return {
    el,
    render(p) {
      tiles.forEach((li, i) => li.firstElementChild!.setAttribute('aria-pressed', String(THEMES[i].id === p.theme)));
    },
  };
}
