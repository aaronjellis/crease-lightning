import { describe, expect, test } from 'vitest';
import { decodeLink, encodeLink, loadJson, migrate, saveJson } from '../src/core/codec';
import { defaultParams, type Params } from '../src/core/model';
import { decorFromStyle } from '../src/core/decor/model';
import { iconById, themeById } from '../src/themes';

/** A version 1 card, as links and files saved before decorations carried them. */
function v1(over: Record<string, unknown> = {}): Record<string, unknown> {
  const { decor: _decor, ...rest } = defaultParams('en-US');
  return { ...rest, version: 1, accents: true, motifs: true, ...over };
}

describe('migrate trusts nothing a link says (M6)', () => {
  test('an unknown font becomes the theme font; a known one stays', () => {
    const p = defaultParams('en-US');
    expect(migrate({ ...p, font: 'Comic Sans MS' })!.font).toBe('Arvo');
    expect(migrate({ ...p, theme: 'christmas', font: '<img src=x>' })!.font).toBe('Arvo');
    expect(migrate({ ...p, font: 'Ultra' })!.font).toBe('Ultra');
  });
  test('lines are cut to the 40-character input limit, never through a surrogate pair', () => {
    const p = defaultParams('en-US');
    const out = migrate({ ...p, line1: 'A'.repeat(500), line2: 'B'.repeat(39) + '😀' })!;
    expect(out.line1).toBe('A'.repeat(40));
    expect(out.line2).toBe('B'.repeat(39));
    expect(migrate({ ...p, line1: 'HAPPY BIRTHDAY' })!.line1).toBe('HAPPY BIRTHDAY');
  });
});

describe('codec', () => {
  test('link round-trips', () => {
    const p = defaultParams('en-US');
    expect(decodeLink(encodeLink(p))).toEqual(p);
  });
  test('link starts with #d= and is URL safe', () => {
    const l = encodeLink(defaultParams('en-US'));
    expect(l.startsWith('#d=')).toBe(true);
    expect(l.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  test('non-ASCII text survives', () => {
    const p = { ...defaultParams('en-US'), line1: 'FELIZ CUMPLEAÑOS ✨', line2: 'ÅSA' };
    expect(decodeLink(encodeLink(p))).toEqual(p);
  });
  test.each(['', '#d=', '#d=%%%', '#d=' + btoa('{"version":99}'), '#d=' + btoa('[]')])(
    'bad link %s decodes to null',
    (h) => {
      expect(decodeLink(h)).toBeNull();
    },
  );
  test('loadJson round-trips saveJson', () => {
    const p = defaultParams('de-DE');
    expect(loadJson(saveJson(p))).toEqual({ ok: true, params: p });
  });
  test('loadJson reports why', () => {
    expect(loadJson('nope')).toEqual({ ok: false, error: 'not-json' });
    expect(loadJson('{"a":1}')).toEqual({ ok: false, error: 'not-a-card' });
    expect(loadJson('{"version":3}')).toEqual({ ok: false, error: 'newer-version' });
    expect(loadJson('{"version":2}')).toEqual({ ok: false, error: 'not-a-card' });
    expect(loadJson('[]')).toEqual({ ok: false, error: 'not-a-card' });
  });
  test('migrate clamps numbers and drops unknown fields', () => {
    const raw = { ...defaultParams('en-US'), extra: 1, advanced: { ...defaultParams('en-US').advanced, overhangMm: 99, railMm: -4 } };
    const q = migrate(raw)!;
    expect(q).not.toBeNull();
    expect(q.advanced.overhangMm).toBe(6);
    expect(q.advanced.railMm).toBe(3);
    expect('extra' in q).toBe(false);
  });
  test('migrate rejects wrong field types', () => {
    expect(migrate({ ...defaultParams('en-US'), line1: 5 })).toBeNull();
    expect(migrate({ ...defaultParams('en-US'), size: 'letter' })).toBeNull();
    expect(migrate({ ...defaultParams('en-US'), theme: 'nope' })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});

describe('migrate from version 1', () => {
  test.each(['birthday', 'christmas', 'graduation'] as const)('%s with motifs on gets its first style', (id) => {
    const t = themeById(id);
    const q = migrate(v1({ theme: id, motifs: true }))!;
    expect(q.version).toBe(2);
    expect(q.decor).toEqual(decorFromStyle(t, t.styles[0].id, 1));
    expect(q.decor.items.length).toBeGreaterThan(0);
  });
  test('motifs off gives no style, no border, no items', () => {
    expect(migrate(v1({ motifs: false }))!.decor).toEqual({ style: null, border: null, seed: 1, items: [] });
  });
  test('Blank with motifs on has nothing to add', () => {
    expect(migrate(v1({ theme: 'blank', motifs: true }))!.decor).toEqual({ style: null, border: null, seed: 1, items: [] });
  });
  test('accents and motifs are dropped', () => {
    const q = migrate(v1({ accents: true }))!;
    expect('accents' in q).toBe(false);
    expect('motifs' in q).toBe(false);
  });
  test('a version 1 card still needs its booleans', () => {
    expect(migrate(v1({ accents: 'yes' }))).toBeNull();
    expect(migrate(v1({ motifs: undefined }))).toBeNull();
  });
  test('a version 1 link decodes to version 2', () => {
    const link = '#d=' + btoa(JSON.stringify(v1()));
    expect(decodeLink(link)!.version).toBe(2);
  });
});

describe('migrate version 2 validates the decor', () => {
  const p = defaultParams('en-US');
  const withDecor = (decor: unknown) => migrate({ ...p, decor });
  const item = (over: Record<string, unknown> = {}) => ({ id: 'i1', icon: 'star', minMm: 9, maxMm: 13, ...over });

  test('an unknown style becomes null; a known one stays', () => {
    expect(withDecor({ ...p.decor, style: 'nope' })!.decor.style).toBeNull();
    expect(withDecor({ ...p.decor, style: 'holly' })!.decor.style).toBeNull();
    expect(withDecor({ ...p.decor, style: 'balloons' })!.decor.style).toBe('balloons');
  });
  test('an unknown border becomes null; a known one stays', () => {
    expect(withDecor({ ...p.decor, border: 'nope' })!.decor.border).toBeNull();
    expect(withDecor({ ...p.decor, border: 5 })!.decor.border).toBeNull();
    expect(withDecor({ ...p.decor, border: 'star-row' })!.decor.border).toBe('star-row');
  });
  test('items with unknown icons are dropped', () => {
    const q = withDecor({ ...p.decor, items: [item(), item({ id: 'i2', icon: 'nope' }), item({ id: 'i3' })] })!;
    expect(q.decor.items.map((i) => i.id)).toEqual(['i1', 'i3']);
  });
  test('malformed and duplicate items are dropped', () => {
    const q = withDecor({ ...p.decor, items: [item(), 'x', null, item({ minMm: 'big' }), item({ id: 'i2', icon: 7 }), item({ id: 'i3' })] })!;
    expect(q.decor.items.map((i) => i.id)).toEqual(['i1', 'i3']);
  });
  test('items are capped at 40', () => {
    const items = Array.from({ length: 50 }, (_, k) => item({ id: `i${k + 1}` }));
    expect(withDecor({ ...p.decor, items })!.decor.items).toHaveLength(40);
  });
  test('sizes are clamped to the icon minimum and 60 mm', () => {
    const [a] = withDecor({ ...p.decor, items: [item({ icon: 'balloon', minMm: 2, maxMm: 100, sizeMm: 99 })] })!.decor.items;
    expect(a).toMatchObject({ minMm: iconById('balloon').minHeightMm, maxMm: 60, sizeMm: 60 });
    const [b] = withDecor({ ...p.decor, items: [item({ minMm: 20, maxMm: 10, sizeMm: 1 })] })!.decor.items;
    expect(b.minMm).toBe(20);
    expect(b.maxMm).toBe(20);
    expect(b.sizeMm).toBe(9);
  });
  test('pinned positions are clamped to the page; a bad pin unpins', () => {
    const [a, b] = withDecor({
      ...p.decor,
      items: [item({ at: { page: 'back', u: -1, v: 3 } }), item({ id: 'i2', at: { page: 'side', u: 0.5, v: 0.5 } })],
    })!.decor.items;
    expect(a.at).toEqual({ page: 'back', u: 0, v: 1 });
    expect('at' in b).toBe(false);
  });
  test('the seed is a 32-bit unsigned integer', () => {
    for (const seed of [-1, 1.5, 2 ** 40 + 3, 7]) {
      const s = withDecor({ ...p.decor, seed })!.decor.seed;
      expect(Number.isInteger(s), String(seed)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
    expect(withDecor({ ...p.decor, seed: 7 })!.decor.seed).toBe(7);
    expect(withDecor({ ...p.decor, seed: 'x' })).toBeNull();
  });
  test('a card without a decor is not a card', () => {
    expect(withDecor(undefined)).toBeNull();
    expect(withDecor([])).toBeNull();
  });
  test('unknown decor and item fields are dropped', () => {
    const q = withDecor({ ...p.decor, extra: 1, items: [item({ extra: 2 })] })!;
    expect('extra' in q.decor).toBe(false);
    expect('extra' in q.decor.items[0]).toBe(false);
  });
  test('a decor with pinned and resized items round-trips through a link and a file', () => {
    const q: Params = {
      ...p,
      decor: {
        style: 'confetti',
        border: 'confetti-row',
        seed: 4242,
        items: [
          { id: 'i1', icon: 'confetti', minMm: 10, maxMm: 14, sizeMm: 11.5, at: { page: 'back', u: 0.25, v: 0.75 } },
          { id: 'i2', icon: 'star', minMm: 9, maxMm: 13 },
          { id: 'i7', icon: 'balloon', minMm: 18, maxMm: 22, at: { page: 'base', u: 1, v: 0 } },
        ],
      },
    };
    expect(decodeLink(encodeLink(q))).toEqual(q);
    expect(loadJson(saveJson(q))).toEqual({ ok: true, params: q });
  });
});
