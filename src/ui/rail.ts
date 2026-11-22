/**
 * The theme rail: a tile per theme (jacket colour with the theme's first pop-up icon, drawn instantly
 * from the icon data), and Surprise me.
 */
import { polyToSvgPath } from '@kerfuffle/engine/geom';
import { applyTheme } from '../core/model';
import { iconById, themeById, THEMES, type Theme } from '../themes';
import type { Ctx, View } from './context';
import { h, svgFrom } from './dom';
import { ACTIONS, THEMES_HEADING } from './strings';

/** The icon as an SVG: its poly is 1 mm tall with y up, so flip it into SVG's y-down box. */
function iconSvg(id: string): string {
  const icon = iconById(id);
  const w = Math.max(...icon.poly.flat().map((p) => p.x));
  const flipped = icon.poly.map((c) => c.map((p) => ({ x: p.x, y: 1 - p.y })));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(3)} 1" aria-hidden="true" focusable="false"><path fill-rule="nonzero" d="${polyToSvgPath(flipped, 4)}"/></svg>`;
}

function thumb(t: Theme): HTMLElement {
  const art = t.accents.length
    ? svgFrom(iconSvg(t.accents[0]))
    : h('span', { class: 'thumb-letter', 'aria-hidden': 'true', text: t.lines[0].charAt(0) });
  return h('span', { class: 'thumb', style: `--thumb-bg:${t.colours.jacket};--thumb-fg:${t.colours.inner}` }, art);
}

export function themeRail(ctx: Ctx): View {
  const pick = (t: Theme) => {
    const p = ctx.params();
    if (p.theme !== t.id) ctx.update(applyTheme(p, t, themeById(p.theme)));
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
