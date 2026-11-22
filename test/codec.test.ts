import { describe, expect, test } from 'vitest';
import { decodeLink, encodeLink, loadJson, migrate, saveJson } from '../src/core/codec';
import { defaultParams } from '../src/core/model';

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
    expect(loadJson('{"version":2}')).toEqual({ ok: false, error: 'newer-version' });
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
