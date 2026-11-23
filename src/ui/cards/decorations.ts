/**
 * Decorations: style tiles, border tiles (None or a pattern), a chip per illustration with a Size
 * slider for the selected one, Add, Shuffle, Unpin all, and Undo. Picking a style, changing the
 * theme, and Unpin all can be undone (the stash lives in the app); the rest edit the decor in place.
 * Add turns off at MAX_ITEMS, the most a link, file or autosave keeps.
 */
import { addItem, decorFromStyle, removeItem, resizeItem, shuffle, unpinAll } from '../../core/decor/model';
import type { Decor } from '../../core/decor/types';
import { MAX_ITEM_MM, MAX_ITEMS } from '../../core/codec';
import type { Params } from '../../core/model';
import { BORDERS, borderById, iconById, themeById, type Theme } from '../../themes';
import type { Ctx, View } from '../context';
import { track } from '../context';
import { h, railCard } from '../dom';
import { iconThumb } from '../iconThumb';
import { DECORATIONS } from '../strings';
import { addIllustrationDialog } from './addIllustration';

/** Border patterns: the theme styles' own first, then the rest. */
function patternsFor(theme: Theme): { id: string; name: string }[] {
  const own = theme.styles.flatMap((s) => (s.border ? [s.border] : []));
  const ids = [...new Set([...own, ...BORDERS.map((b) => b.id)])];
  return ids.map((id) => ({ id, name: BORDERS.find((b) => b.id === id)!.name }));
}

/** True when the decor differs from the style's own in anything but the seed. */
function isCustom(theme: Theme, decor: Decor): boolean {
  const base = decorFromStyle(theme, decor.style, decor.seed);
  return JSON.stringify({ ...base, seed: 0 }) !== JSON.stringify({ ...decor, seed: 0 });
}

export function decorationsCard(ctx: Ctx): View {
  const setDecor = (decor: Decor, opts?: { undoable?: boolean }) => ctx.update({ ...ctx.params(), decor }, opts);

  // ------------------------------------------------------------ style
  const styleRow = h('div', { class: 'decor-styles', role: 'group', 'aria-label': DECORATIONS.style });
  let styleTheme = '';
  let tiles: { id: string | null; el: HTMLButtonElement }[] = [];
  const pickStyle = (id: string | null) => {
    const p = ctx.params();
    const theme = themeById(p.theme);
    const next = decorFromStyle(theme, id, p.decor.seed);
    if (JSON.stringify(next) === JSON.stringify(p.decor)) return;
    setDecor(next, { undoable: true });
    track('decor_style_picked', { theme: theme.id, style: id ?? 'none' });
  };
  const buildTiles = (theme: Theme) => {
    const ids: (string | null)[] = [null, ...theme.styles.map((s) => s.id)];
    tiles = ids.map((id) => {
      const el = h('button', { type: 'button', class: 'decor-style', 'aria-pressed': 'false', 'data-ph-capture-attribute-style': id ?? 'none' });
      el.addEventListener('click', () => pickStyle(id));
      return { id, el };
    });
    styleRow.replaceChildren(...tiles.map((t) => t.el));
    styleTheme = theme.id;
  };

  // ------------------------------------------------------------ border
  // One pill per choice, None first, like the style row: what's on is what's pressed.
  const borderRow = h('div', { class: 'decor-styles decor-borders', role: 'group', 'aria-label': DECORATIONS.border });
  let borderTheme = '';
  let borderTiles: { id: string | null; el: HTMLButtonElement }[] = [];
  const pickBorder = (id: string | null) => {
    const p = ctx.params();
    if (p.decor.border === id) return;
    setDecor({ ...p.decor, border: id });
    track('decor_border_picked', { border: id ?? 'none' });
  };
  const buildBorderTiles = (theme: Theme) => {
    const none = { id: null, name: DECORATIONS.none, tile: null as string | null };
    const patterns = patternsFor(theme).map((b) => ({ ...b, tile: borderById(b.id).tile as string | null }));
    borderTiles = [none, ...patterns].map((b) => {
      const el = h(
        'button',
        { type: 'button', class: 'decor-style', 'aria-pressed': 'false', 'data-ph-capture-attribute-border': b.id ?? 'none' },
        b.tile ? h('span', { class: 'decor-thumb', 'aria-hidden': 'true' }, iconThumb(b.tile)) : null,
        h('span', { text: b.name })
      );
      el.addEventListener('click', () => pickBorder(b.id));
      return { id: b.id, el };
    });
    borderRow.replaceChildren(...borderTiles.map((t) => t.el));
    borderTheme = theme.id;
  };

  // ------------------------------------------------------------ illustrations
  const chipList = h('ul', { class: 'decor-chips', 'aria-label': DECORATIONS.items });
  const empty = h('p', { class: 'hint decor-empty', text: DECORATIONS.empty });
  let chipKey = '';
  const chipEls = new Map<string, HTMLButtonElement>();
  const buildChips = (decor: Decor) => {
    chipEls.clear();
    chipList.replaceChildren(
      ...decor.items.map((item) => {
        const icon = iconById(item.icon);
        const select = h('button', { type: 'button', class: 'decor-chip-select', 'aria-pressed': 'false', 'data-ph-capture-attribute-icon': icon.id }, h('span', { class: 'decor-thumb' }, iconThumb(icon.id)), h('span', { text: icon.name }));
        select.addEventListener('click', () => ctx.select(ctx.selection() === item.id ? null : item.id));
        const remove = h('button', { type: 'button', class: 'decor-chip-remove', 'aria-label': DECORATIONS.remove(icon.name), 'data-ph-capture-attribute-icon': icon.id }, '×');
        remove.addEventListener('click', () => {
          setDecor(removeItem(ctx.params().decor, item.id));
          track('decor_item_removed', { icon: icon.id });
        });
        chipEls.set(item.id, select);
        return h('li', { class: 'decor-chip', 'data-ph-capture-attribute-item': item.id }, select, remove);
      })
    );
  };

  const size = h('input', { type: 'range', name: 'decor-size', id: 'cl-decor-size', step: 1, 'data-ph-capture-attribute-control': 'size' });
  const sizeOut = h('output', { class: 'hint', for: 'cl-decor-size' });
  const sizeRow = h('label', { class: 'decor-size', hidden: true, for: 'cl-decor-size' }, h('span', { class: 'sub-heading', text: DECORATIONS.size }), size, sizeOut);
  size.addEventListener('input', () => {
    const id = ctx.selection();
    if (id) setDecor(resizeItem(ctx.params().decor, id, Number(size.value)));
  });

  const addDialog = addIllustrationDialog((iconId) => {
    const p = ctx.params();
    // Links, files and the autosave keep MAX_ITEMS: an item past it would vanish from all three.
    if (p.decor.items.length >= MAX_ITEMS) return;
    const next = addItem(p.decor, iconId);
    setDecor(next);
    ctx.select(next.items[next.items.length - 1].id);
    track('decor_item_added', { icon: iconId });
  });
  const button = (text: string, cls: string, attrs: Record<string, string> = {}) => h('button', { type: 'button', class: `ghost decor-action ${cls}`, ...attrs }, text);
  const add = button(DECORATIONS.add, 'decor-add-open');
  add.addEventListener('click', () => addDialog.open(ctx.params().theme));
  const shuffleBtn = button(DECORATIONS.shuffle, 'decor-shuffle');
  shuffleBtn.addEventListener('click', () => {
    setDecor(shuffle(ctx.params().decor));
    track('decor_shuffled');
  });
  const unpin = button(DECORATIONS.unpinAll, 'decor-unpin');
  unpin.addEventListener('click', () => setDecor(unpinAll(ctx.params().decor), { undoable: true }));
  const undo = h('button', { type: 'button', class: 'link-button decor-undo', hidden: true }, DECORATIONS.undo);
  undo.addEventListener('click', () => ctx.decorUndo());

  const el = railCard(
    DECORATIONS.title,
    true,
    h('h3', { class: 'sub-heading', text: DECORATIONS.style }),
    styleRow,
    undo,
    h('h3', { class: 'sub-heading', text: DECORATIONS.border }),
    borderRow,
    h('h3', { class: 'sub-heading', text: DECORATIONS.items }),
    empty,
    chipList,
    sizeRow,
    h('div', { class: 'decor-actions' }, add, shuffleBtn, unpin)
  );
  el.append(addDialog.el);

  return {
    el,
    render(p: Params, card) {
      const theme = themeById(p.theme);
      if (styleTheme !== theme.id) buildTiles(theme);
      const custom = isCustom(theme, p.decor);
      tiles.forEach((t, i) => {
        const pressed = t.id === p.decor.style;
        t.el.setAttribute('aria-pressed', String(pressed));
        const name = i === 0 ? DECORATIONS.none : theme.styles[i - 1].name;
        // No style with a border or items is the user's own design: "Custom", not "None (custom)".
        const label = pressed && custom ? (i === 0 ? DECORATIONS.customLabel : DECORATIONS.custom(name)) : name;
        if (t.el.textContent !== label) t.el.textContent = label;
      });
      undo.hidden = !ctx.canDecorUndo();

      if (borderTheme !== theme.id) buildBorderTiles(theme);
      for (const t of borderTiles) t.el.setAttribute('aria-pressed', String(t.id === p.decor.border));

      const key = p.decor.items.map((i) => `${i.id}:${i.icon}`).join(',');
      if (key !== chipKey) {
        buildChips(p.decor);
        chipKey = key;
      }
      empty.hidden = p.decor.items.length > 0;
      const selected = ctx.selection();
      for (const [id, b] of chipEls) b.setAttribute('aria-pressed', String(id === selected));
      const item = p.decor.items.find((i) => i.id === selected);
      sizeRow.hidden = !item;
      unpin.disabled = !p.decor.items.some((i) => i.at);
      const full = p.decor.items.length >= MAX_ITEMS;
      add.disabled = full;
      if (full) add.setAttribute('title', DECORATIONS.addFull(MAX_ITEMS));
      else add.removeAttribute('title');
      if (item) {
        const icon = iconById(item.icon);
        const shown = item.sizeMm ?? card?.decor.items.find((i) => i.id === item.id)?.sizeMm ?? (item.minMm + item.maxMm) / 2;
        size.min = String(icon.minHeightMm);
        size.max = String(MAX_ITEM_MM);
        if (document.activeElement !== size) size.value = String(Math.round(shown));
        sizeOut.textContent = `${size.value} mm`;
      }
    },
  };
}
