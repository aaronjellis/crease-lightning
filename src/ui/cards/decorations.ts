/** Decorations: the pop-up icons (accents) and the cut-out shapes (motifs), each on or off. */
import { themeById } from '../../themes';
import type { Ctx, View } from '../context';
import { h, railCard, toggle } from '../dom';
import { DECORATIONS } from '../strings';

export function decorationsCard(ctx: Ctx): View {
  const accents = toggle(DECORATIONS.accents, 'accents', (on) => ctx.update({ ...ctx.params(), accents: on }), DECORATIONS.accentsHint);
  const motifs = toggle(DECORATIONS.motifs, 'motifs', (on) => ctx.update({ ...ctx.params(), motifs: on }), DECORATIONS.motifsHint);
  const none = h('p', { class: 'hint', hidden: true });
  const el = railCard(DECORATIONS.title, true, h('div', { class: 'toggles' }, accents.el, motifs.el), none);

  return {
    el,
    render(p) {
      const theme = themeById(p.theme);
      const hasAccents = theme.accents.length > 0;
      const hasMotifs = theme.motifs.length > 0;
      accents.input.checked = hasAccents && p.accents;
      motifs.input.checked = hasMotifs && p.motifs;
      accents.input.disabled = !hasAccents;
      motifs.input.disabled = !hasMotifs;
      none.hidden = hasAccents || hasMotifs;
      none.textContent = DECORATIONS.none(theme.name);
    },
  };
}
