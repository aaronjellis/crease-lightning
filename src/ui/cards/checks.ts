/**
 * Checks: whether the card is ready, each pre-export check, the fixes the fit made (each with Undo,
 * except bridges, which always stay), and the notes. Undoing a fix sets `overrides[id]`; the fit then
 * leaves a warning, which carries a Restore button. A note with a remedy (the heavier font, R31)
 * carries a button for it.
 */
import type { Card } from '../../core/build';
import { undone } from '../../core/fixes';
import type { Params } from '../../core/model';
import type { BuildState, Ctx, View } from '../context';
import { h, railCard } from '../dom';
import { CHECK_NAMES, CHECKS } from '../strings';

const withoutKey = (o: Record<string, true>, key: string): Record<string, true> => {
  const { [key]: _drop, ...rest } = o;
  return rest;
};

/** The override a warning came from, if it's the "you undid this" note for one. */
function overrideFor(message: string, p: Params): string | undefined {
  return Object.keys(p.overrides).find((id) => undone(id).message === message || undone(id, 'narrow').message === message);
}

export function checksCard(ctx: Ctx): View {
  const status = h('p', { class: 'check-status', role: 'status' });
  const list = h('ul', { class: 'check-list', 'aria-label': CHECKS.title });
  const fixesHead = h('h3', { class: 'sub-heading', text: CHECKS.fixes });
  const fixes = h('ul', { class: 'fix-list', 'aria-label': CHECKS.fixes });
  const notes = h('ul', { class: 'note-list', 'aria-label': 'Notes' });
  const el = railCard(CHECKS.title, true, h('div', { class: 'checks' }, status, list, notes, fixesHead, fixes));

  const undo = (id: string) => {
    const p = ctx.params();
    ctx.update({ ...p, overrides: { ...p.overrides, [id]: true } });
  };
  const restore = (id: string) => {
    const p = ctx.params();
    ctx.update({ ...p, overrides: withoutKey(p.overrides, id) });
  };

  /** What the status line says now; it's rewritten only when this changes, so screen readers hear it once (M12). */
  let statusKey = '';

  const render = (p: Params, card: Card | null, state: BuildState) => {
    if (!card) return;
    // A failed stroke check warns but doesn't block export (R23).
    const warned = card.exportable && card.checks.some((c) => c.id === 'stroke' && !c.ok);
    const kind = warned ? 'is-warned' : card.exportable ? 'is-ready' : 'is-blocked';
    const said = warned ? CHECKS.readyWithWarning : card.exportable ? CHECKS.ready : CHECKS.notReady;
    if (`${kind}|${said}` !== statusKey) {
      statusKey = `${kind}|${said}`;
      status.className = `check-status ${kind}`;
      status.replaceChildren(h('span', { class: 'check-icon', 'aria-hidden': 'true', text: card.exportable && !warned ? '✓' : '!' }), said);
    }

    list.replaceChildren(
      ...card.checks.map((c) => {
        const pending = c.id === 'stroke' && !state.strokeChecked && c.ok;
        const warn = c.id === 'stroke' && !c.ok;
        const text = pending ? (state.strokeSkipped ? CHECKS.notRun : CHECKS.pending) : c.ok ? CHECK_NAMES[c.id].ok : CHECK_NAMES[c.id].fail;
        const kind = pending ? 'is-pending' : c.ok ? 'is-ok' : warn ? 'is-warn' : 'is-fail';
        return h(
          'li',
          { class: `check ${kind}` },
          h('span', { class: 'check-mark', 'aria-hidden': 'true', text: pending ? '…' : c.ok ? '✓' : warn ? '!' : '✕' }),
          // The stroke detail repeats the thin-stroke note below, so it isn't shown twice.
          h('span', {}, text, !c.ok && !warn && c.detail ? h('small', { text: c.detail }) : null)
        );
      })
    );

    fixesHead.hidden = card.fixes.length === 0;
    fixes.replaceChildren(
      ...card.fixes.map((f) => {
        // Undoing a bridge would only leave a piece to fall out, and the fit keeps it anyway (M11).
        if (f.id.startsWith('bridge:')) return h('li', { class: 'fix' }, h('span', { text: f.message }));
        const b = h('button', { type: 'button', class: 'link-button', 'aria-label': CHECKS.undoLabel(f.message), 'data-ph-capture-attribute-fix': f.id }, CHECKS.undo);
        b.addEventListener('click', () => undo(f.id));
        return h('li', { class: 'fix' }, h('span', { text: f.message }), b);
      })
    );

    // A note can quote the message (a word too long to split), so its text stays out of analytics.
    notes.replaceChildren(
      ...card.notes.map((n) => {
        const id = n.level === 'warn' ? overrideFor(n.message, p) : undefined;
        let action: HTMLButtonElement | null = null;
        if (id) {
          action = h('button', { type: 'button', class: 'link-button', 'aria-label': CHECKS.restoreLabel, 'data-ph-capture-attribute-fix': id }, CHECKS.restore);
          action.addEventListener('click', () => restore(id));
        } else if (n.action?.kind === 'font') {
          const family = n.action.family;
          action = h('button', { type: 'button', class: 'link-button', 'data-ph-capture-attribute-font': family }, CHECKS.useFont(family));
          action.addEventListener('click', () => {
            const cur = ctx.params();
            if (cur.font !== family) ctx.update({ ...cur, font: family });
          });
        }
        return h('li', { class: `note note-${n.level}` }, h('span', { class: 'note-text ph-no-capture', text: n.message }), action);
      })
    );
  };

  return { el, render };
}
