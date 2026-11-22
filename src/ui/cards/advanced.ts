/**
 * Advanced: per-line step sizes (empty means the fit picks them; the placeholder shows what it
 * picked), jacket overhang, rails, clearance, fold line style, and spine direction.
 */
import type { Card } from '../../core/build';
import type { FoldStyle, Params, StepDims } from '../../core/model';
import type { Ctx, View } from '../context';
import { h, railCard, segmented, syncValue } from '../dom';
import { ADVANCED, FOLD_STYLE, SPINE } from '../strings';

type LineKey = 'line1' | 'line2';
type Dim = keyof StepDims;
type Scalar = 'overhangMm' | 'railMm' | 'clearanceMm';

const fmt = (v: number) => String(Math.round(v * 10) / 10);

function numberInput(name: string, attrs: Record<string, string | number> = {}): HTMLInputElement {
  return h('input', { type: 'number', name, id: `cl-${name}`, class: 'num-input ph-no-capture', inputmode: 'decimal', step: 0.5, ...attrs });
}

export function advancedCard(ctx: Ctx): View {
  // Per-line d, h, s.
  const dims: { line: LineKey; dim: Dim; input: HTMLInputElement }[] = [];
  const lineGroup = (line: LineKey, n: 1 | 2) => {
    const cells = (['d', 'h', 's'] as const).map((dim) => {
      const input = numberInput(`${line}-${dim}`, { min: 1, max: 200 });
      dims.push({ line, dim, input });
      input.addEventListener('input', () => {
        const p = ctx.params();
        const v = input.value === '' ? undefined : Number(input.value);
        if (v !== undefined && !(Number.isFinite(v) && v > 0)) return;
        const cur: StepDims = { ...(p.advanced[line] ?? {}) };
        if (v === undefined) delete cur[dim];
        else cur[dim] = v;
        const advanced = { ...p.advanced };
        if (Object.keys(cur).length) advanced[line] = cur;
        else delete advanced[line];
        ctx.update({ ...p, advanced }, { typing: true });
      });
      const label = { d: ADVANCED.depth, h: ADVANCED.height, s: ADVANCED.letters }[dim];
      return h('label', { class: 'mini-field', for: input.id }, h('span', { text: label }), input);
    });
    return h('fieldset', { class: 'dims' }, h('legend', { text: ADVANCED.lineDims(n) }), h('div', { class: 'dims-row' }, ...cells));
  };

  // Overhang, rails, clearance.
  const scalars: { key: Scalar; input: HTMLInputElement }[] = [];
  const scalar = (key: Scalar, label: string, min: number, max: number) => {
    const input = numberInput(key, { min, max });
    scalars.push({ key, input });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (input.value === '' || !Number.isFinite(v)) return;
      const p = ctx.params();
      ctx.update({ ...p, advanced: { ...p.advanced, [key]: Math.min(max, Math.max(min, v)) } }, { typing: true });
    });
    return h('label', { class: 'row-field', for: input.id }, h('span', { text: label }), h('span', { class: 'with-unit' }, input, h('span', { class: 'unit', text: ADVANCED.mm })));
  };

  const fold = segmented<FoldStyle>(
    ADVANCED.foldStyle,
    (['auto', 'score', 'perforate'] as const).map((f) => ({ value: f, text: FOLD_STYLE[f], attrs: { 'data-ph-capture-attribute-fold': f } })),
    (f) => {
      const p = ctx.params();
      ctx.update({ ...p, advanced: { ...p.advanced, foldStyle: f } });
    }
  );
  const spine = segmented<Params['spine']>(
    ADVANCED.spine,
    (['long', 'short'] as const).map((s) => ({ value: s, text: SPINE[s], attrs: { 'data-ph-capture-attribute-spine': s } })),
    (s) => {
      const p = ctx.params();
      if (p.spine === s) return;
      // Step sizes and fixes depend on the card's shape, like a size change.
      const { line1: _l1, line2: _l2, ...advanced } = p.advanced;
      ctx.update({ ...p, spine: s, advanced, overrides: {} });
    }
  );

  const el = railCard(
    ADVANCED.title,
    false,
    h('p', { class: 'hint', text: ADVANCED.intro }),
    lineGroup('line1', 1),
    lineGroup('line2', 2),
    scalar('overhangMm', ADVANCED.overhang, 0, 6),
    scalar('railMm', ADVANCED.rails, 3, 20),
    scalar('clearanceMm', ADVANCED.clearance, 0, 10),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: ADVANCED.foldStyle }), fold.el),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: ADVANCED.spine }), spine.el)
  );

  return {
    el,
    render(p: Params, card: Card | null) {
      for (const { line, dim, input } of dims) {
        const v = p.advanced[line]?.[dim];
        syncValue(input, v === undefined ? '' : fmt(v));
        // The fitted size, so an empty box still says what the card uses.
        const step = card?.layout.steps.find((s) => s.id === (line === 'line1' ? 'l1' : 'l2'));
        input.placeholder = step ? fmt(step[dim]) : ADVANCED.auto;
      }
      for (const { key, input } of scalars) syncValue(input, fmt(p.advanced[key]));
      fold.set(p.advanced.foldStyle);
      spine.set(p.spine);
    },
  };
}
