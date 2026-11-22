/**
 * Decorations: an interim switch for the cut-out shapes until the full card lands. On is the theme's
 * first style; off is no style, border, or items. The seed stays either way.
 */
import { decorFromStyle } from '../../core/decor/model';
import { themeById } from '../../themes';
import type { Ctx, View } from '../context';
import { h, railCard, toggle } from '../dom';
import { DECORATIONS } from '../strings';

export function decorationsCard(ctx: Ctx): View {
  const motifs = toggle(
    DECORATIONS.motifs,
    'motifs',
    (on) => {
      const p = ctx.params();
      const theme = themeById(p.theme);
      ctx.update({ ...p, decor: decorFromStyle(theme, on ? (theme.styles[0]?.id ?? null) : null, p.decor.seed) });
    },
    DECORATIONS.motifsHint
  );
  const none = h('p', { class: 'hint', hidden: true });
  const el = railCard(DECORATIONS.title, true, h('div', { class: 'toggles' }, motifs.el), none);

  return {
    el,
    render(p) {
      const theme = themeById(p.theme);
      const hasStyles = theme.styles.length > 0;
      motifs.input.checked = hasStyles && p.decor.items.length > 0;
      motifs.input.disabled = !hasStyles;
      none.hidden = hasStyles;
      none.textContent = DECORATIONS.none(theme.name);
    },
  };
}
