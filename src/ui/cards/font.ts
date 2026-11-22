/**
 * Font: the slab list, each name drawn in its own font once it loads (from the same outlines the cutter
 * gets, so the preview never lies), and the Letter spacing control.
 */
import type { TextFont } from '@kerfuffle/engine/hbFont';
import { SLAB_FONTS } from '../../core/fonts';
import type { Spacing } from '../../core/model';
import type { Ctx, View } from '../context';
import { h, railCard, segmented, svgFrom } from '../dom';
import { FONT, SPACING } from '../strings';

const SAMPLE_PX = 100;

/** The text as an SVG in the font's own outlines, sized by CSS. */
export function fontSampleSvg(font: TextFont, text: string): string {
  const { advance, glyphs } = font.shape(text, SAMPLE_PX);
  const top = font.emTopToBaseline(SAMPLE_PX);
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const d = glyphs
    .flatMap((g) => g.commands.map((c) => c.type + c.values.map(n).join(' ')))
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${n(-top)} ${n(advance)} ${n(SAMPLE_PX)}" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

export function fontCard(ctx: Ctx): View {
  const rows = SLAB_FONTS.map((f) => {
    const sample = h('span', { class: 'font-sample' }, h('span', { class: 'font-name-plain', text: f.family }));
    const b = h(
      'button',
      { type: 'button', class: 'font-option', 'aria-pressed': 'false', 'aria-label': f.family, 'data-ph-capture-attribute-font': f.family },
      sample,
      h('span', { class: 'font-check', 'aria-hidden': 'true' })
    );
    b.addEventListener('click', () => {
      const p = ctx.params();
      if (p.font !== f.family) ctx.update({ ...p, font: f.family });
    });
    return { family: f.family, b, sample, drawn: false };
  });

  /** Draws each loaded family's name in itself; a family that fell back keeps the plain name. */
  const drawSamples = () => {
    for (const r of rows) {
      const l = ctx.fonts.peek(r.family);
      if (r.drawn || !l || l.usedFamily !== r.family) continue;
      r.sample.replaceChildren(svgFrom(fontSampleSvg(l.font, r.family)));
      r.drawn = true;
    }
  };
  const prev = ctx.fonts.onLoad;
  ctx.fonts.onLoad = (family) => {
    prev?.(family);
    drawSamples();
  };

  const spacing = segmented<Spacing>(
    FONT.spacing,
    (['tight', 'normal', 'loose'] as const).map((s) => ({ value: s, text: SPACING[s], attrs: { 'data-ph-capture-attribute-spacing': s } })),
    (s) => ctx.update({ ...ctx.params(), spacing: s })
  );
  const note = h('p', { class: 'note note-info', hidden: true });

  const el = railCard(
    FONT.title,
    true,
    h('div', { class: 'font-list', role: 'group', 'aria-label': FONT.title }, ...rows.map((r) => r.b)),
    note,
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: FONT.spacing }), spacing.el)
  );

  // Fetch the other families' previews after the first card is up, or when someone opens the list.
  // (A details element that starts open fires one toggle right away, so the timer gates both.)
  const details = el.querySelector('details')!;
  let settled = false;
  let fetched = false;
  const fetchAll = () => {
    if (fetched || !settled || !details.open) return;
    fetched = true;
    const p = ctx.params();
    for (const r of rows) void ctx.fonts.request(r.family, p.line1 + p.line2).catch(() => {});
  };
  details.addEventListener('toggle', fetchAll);
  setTimeout(() => {
    settled = true;
    fetchAll();
  }, 2000);

  return {
    el,
    render(p) {
      rows.forEach((r) => r.b.setAttribute('aria-pressed', String(r.family === p.font)));
      spacing.set(p.spacing);
      const l = ctx.fonts.peek(p.font);
      const fell = !!l && l.usedFamily !== p.font;
      note.hidden = !fell;
      if (fell) note.textContent = FONT.fellBack(p.font);
      drawSamples();
    },
  };
}
