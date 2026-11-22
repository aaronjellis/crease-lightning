/** Card: the four size tiles (never hidden) and the inner and jacket colours. */
import { CARD_SIZES, withSize, type CardSize } from '../../core/model';
import type { Ctx, View } from '../context';
import { h, railCard } from '../dom';
import { CARD, SIZE_TILES } from '../strings';

const SIZES: CardSize[] = ['5x7', 'a2', 'a6', 'a5'];
/** The largest closed card, so each tile's outline is drawn to scale. */
const MAX_L = Math.max(...SIZES.map((s) => CARD_SIZES[s].closedL));

export function cardCard(ctx: Ctx): View {
  const tiles = SIZES.map((size) => {
    const t = SIZE_TILES[size];
    const { closedW, closedL } = CARD_SIZES[size];
    const glyph = h('span', {
      class: 'size-glyph',
      'aria-hidden': 'true',
      style: `width:${((closedW / MAX_L) * 30).toFixed(1)}px;height:${((closedL / MAX_L) * 30).toFixed(1)}px`,
    });
    const b = h(
      'button',
      { type: 'button', class: 'size-tile', 'aria-pressed': 'false', 'data-ph-capture-attribute-size': size },
      glyph,
      h('span', { class: 'size-name', text: t.name }),
      h('span', { class: 'size-dim', text: t.mm }),
      h('span', { class: 'size-dim', text: t.inches })
    );
    b.addEventListener('click', () => {
      const p = ctx.params();
      if (p.size !== size) ctx.update(withSize(p, size));
    });
    return b;
  });

  const colour = (piece: 'inner' | 'jacket', label: string) => {
    const input = h('input', { type: 'color', name: `colour-${piece}`, id: `cl-colour-${piece}` });
    const hex = h('span', { class: 'hex', 'aria-hidden': 'true' });
    input.addEventListener('input', () => {
      const p = ctx.params();
      ctx.update({ ...p, colours: { ...p.colours, [piece]: input.value.toLowerCase() } }, { typing: true });
    });
    const el = h('label', { class: 'colour', for: `cl-colour-${piece}` }, input, h('span', { class: 'colour-text' }, h('span', { text: label }), hex));
    return { el, input, hex };
  };
  const inner = colour('inner', CARD.inner);
  const jacket = colour('jacket', CARD.jacket);

  const el = railCard(
    CARD.title,
    true,
    h('div', { class: 'sizes', role: 'group', 'aria-label': CARD.size }, ...tiles),
    h('div', { class: 'colours', role: 'group', 'aria-label': CARD.colours }, inner.el, jacket.el)
  );

  return {
    el,
    render(p) {
      tiles.forEach((b, i) => b.setAttribute('aria-pressed', String(SIZES[i] === p.size)));
      for (const [c, value] of [[inner, p.colours.inner], [jacket, p.colours.jacket]] as const) {
        if (document.activeElement !== c.input) c.input.value = value;
        c.hex.textContent = value.toUpperCase();
      }
    },
  };
}
