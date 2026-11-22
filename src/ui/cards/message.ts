/** Message: the two lines, auto-split, and all caps. Message text never reaches analytics. */
import { MAX_LINE_CHARS } from '../../core/codec';
import { themeById } from '../../themes';
import type { Ctx, View } from '../context';
import { h, railCard, syncValue, toggle } from '../dom';
import { MESSAGE } from '../strings';

const MAX_CHARS = MAX_LINE_CHARS;

export function messageCard(ctx: Ctx): View {
  const line = (name: 'line1' | 'line2', label: string, optional: boolean) => {
    const input = h('input', {
      type: 'text',
      name,
      id: `cl-${name}`,
      class: 'text-input ph-no-capture',
      maxlength: MAX_CHARS,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    input.addEventListener('input', () => ctx.update({ ...ctx.params(), [name]: input.value }, { typing: true }));
    const field = h(
      'div',
      { class: 'field' },
      h('label', { for: `cl-${name}` }, label, optional ? h('span', { class: 'optional', text: ` (${MESSAGE.optional})` }) : null),
      input
    );
    return { field, input };
  };

  const l1 = line('line1', MESSAGE.line1, false);
  const l2 = line('line2', MESSAGE.line2, true);
  const split = toggle(MESSAGE.autoSplit, 'autoSplit', (on) => ctx.update({ ...ctx.params(), autoSplit: on }));
  const caps = toggle(MESSAGE.allCaps, 'allCaps', (on) => ctx.update({ ...ctx.params(), allCaps: on }));

  const el = railCard(MESSAGE.title, true, l1.field, l2.field, h('div', { class: 'toggles' }, split.el, caps.el));

  return {
    el,
    render(p) {
      const theme = themeById(p.theme);
      syncValue(l1.input, p.line1);
      syncValue(l2.input, p.line2);
      // A blank line previews the theme's own words, greyed as the placeholder.
      l1.input.placeholder = theme.lines[0];
      l2.input.placeholder = theme.lines[1];
      l1.input.autocapitalize = l2.input.autocapitalize = p.allCaps ? 'characters' : 'sentences';
      l1.input.classList.toggle('caps', p.allCaps);
      l2.input.classList.toggle('caps', p.allCaps);
      split.input.checked = p.autoSplit;
      caps.input.checked = p.allCaps;
    },
  };
}
