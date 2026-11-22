/** Decorations: the cut-out shapes (motifs), on or off. */
import { themeById } from '../../themes';
import type { Ctx, View } from '../context';
import { h, railCard, toggle } from '../dom';
import { DECORATIONS } from '../strings';

export function decorationsCard(ctx: Ctx): View {
  const motifs = toggle(DECORATIONS.motifs, 'motifs', (on) => ctx.update({ ...ctx.params(), motifs: on }), DECORATIONS.motifsHint);
  const none = h('p', { class: 'hint', hidden: true });
  const el = railCard(DECORATIONS.title, true, h('div', { class: 'toggles' }, motifs.el), none);

  return {
    el,
    render(p) {
      const theme = themeById(p.theme);
      const hasMotifs = theme.motifs.length > 0;
      motifs.input.checked = hasMotifs && p.motifs;
      motifs.input.disabled = !hasMotifs;
      none.hidden = hasMotifs;
      none.textContent = DECORATIONS.none(theme.name);
    },
  };
}
