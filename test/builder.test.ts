/**
 * The build worker client (R30): latest request wins, a stuck worker is terminated and recreated, a
 * worker that can't start hands its builds to the page, and cards keep their params by identity.
 */
import { describe, expect, test, vi } from 'vitest';
import { build } from '../src/core/build';
import { FontLoader } from '../src/core/fontLoader';
import { defaultParams, type Params } from '../src/core/model';
import { workerBuilder, type BuildRequest } from '../src/ui/builder';
import type { FromWorker, ToWorker } from '../src/worker/protocol';
import { alfa, arvo, rokkitt, testFonts } from './helpers/fonts';

const FONTS = { 'Alfa Slab One': alfa, Arvo: arvo, Rokkitt: rokkitt } as const;
const loader = () =>
  new FontLoader(async (family) => ({ font: FONTS[family as keyof typeof FONTS] ?? arvo, usedFamily: family in FONTS ? family : 'Arvo' }));

/** A stand-in worker: builds in-process when told to, or never answers (`stuck`), or fails to start. */
class FakeWorker {
  static made: FakeWorker[] = [];
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  received: ToWorker[] = [];
  terminated = false;
  constructor(readonly mode: 'ok' | 'stuck' | 'broken' = 'ok') {
    FakeWorker.made.push(this);
    if (mode === 'broken') setTimeout(() => this.emit('error', { preventDefault() {} }), 0);
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, e: unknown) {
    for (const fn of this.listeners[type] ?? []) fn(e);
  }
  postMessage(m: ToWorker) {
    this.received.push(m);
    if (m.type !== 'build' || this.mode !== 'ok') return;
    // Structured cloning: the card that comes back is a copy, params included.
    const card = structuredClone(build(m.params, { fonts: testFonts() }, m.target, { strokeCheck: m.strokeCheck }));
    setTimeout(() => this.emit('message', { data: { type: 'done', id: m.id, card } satisfies FromWorker }), 5);
  }
  terminate() {
    this.terminated = true;
  }
}

const P0 = defaultParams('en-US');
const req = (params: Params, kind: BuildRequest['kind'] = 'preview'): BuildRequest => ({ params, target: 'blade', strokeCheck: false, kind });

describe('workerBuilder', () => {
  test('a card comes back with the very params object that was sent (R24)', async () => {
    FakeWorker.made = [];
    const b = workerBuilder(loader(), { base: 'http://x/', spawn: () => new FakeWorker() as unknown as Worker });
    const r = await b.build(req(P0));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.card.params).toBe(P0);
    expect(FakeWorker.made[0].received[0]).toEqual({ type: 'init', base: 'http://x/' });
    b.destroy();
  });

  test('latest request wins: a waiting request replaced by a newer one resolves as stale and never runs', async () => {
    FakeWorker.made = [];
    const b = workerBuilder(loader(), { base: 'http://x/', spawn: () => new FakeWorker() as unknown as Worker });
    const first = b.build(req({ ...P0, line1: 'ONE' }));
    const second = b.build(req({ ...P0, line1: 'TWO' }));
    const third = b.build(req({ ...P0, line1: 'THREE' }));
    expect(await second).toEqual({ ok: false, reason: 'stale' });
    const [r1, r3] = await Promise.all([first, third]);
    expect(r1.ok && r1.card.params.line1).toBe('ONE');
    expect(r3.ok && r3.card.params.line1).toBe('THREE');
    const sent = FakeWorker.made.flatMap((w) => w.received).filter((m) => m.type === 'build');
    expect(sent.map((m) => (m.type === 'build' ? m.params.line1 : ''))).toEqual(['ONE', 'THREE']);
    b.destroy();
  });

  test('stroke checks and exports run in their own worker, so a preview never waits behind one', async () => {
    FakeWorker.made = [];
    const b = workerBuilder(loader(), { base: 'http://x/', spawn: () => new FakeWorker() as unknown as Worker });
    await Promise.all([b.build(req(P0, 'stroke')), b.build(req(P0, 'preview'))]);
    expect(FakeWorker.made).toHaveLength(2);
    b.destroy();
  });

  test('a stuck worker is terminated and recreated; the build resolves as timeout', async () => {
    vi.useFakeTimers();
    try {
      FakeWorker.made = [];
      let n = 0;
      const b = workerBuilder(loader(), {
        base: 'http://x/',
        timeoutMs: 1000,
        spawn: () => new FakeWorker(n++ === 0 ? 'stuck' : 'ok') as unknown as Worker,
      });
      const stuck = b.build(req(P0, 'stroke'));
      await vi.advanceTimersByTimeAsync(1001);
      expect(await stuck).toEqual({ ok: false, reason: 'timeout' });
      expect(FakeWorker.made[0].terminated).toBe(true);
      const next = b.build(req(P0, 'stroke'));
      await vi.advanceTimersByTimeAsync(10);
      expect((await next).ok).toBe(true);
      expect(FakeWorker.made).toHaveLength(2);
      b.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a page that forbids workers (new Worker throws) builds on the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = workerBuilder(loader(), {
      base: 'http://x/',
      spawn: () => {
        throw new Error('blocked by worker-src');
      },
    });
    const r = await b.build(req(P0));
    expect(r.ok && r.card.params).toBe(P0);
    expect(b.inWorker).toBe(false);
    warn.mockRestore();
    error.mockRestore();
    b.destroy();
  });

  test('a worker that cannot start hands its builds to the page', async () => {
    FakeWorker.made = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b = workerBuilder(loader(), { base: 'http://x/', spawn: () => new FakeWorker('broken') as unknown as Worker });
    const r = await b.build(req(P0));
    expect(r.ok && r.card.params).toBe(P0);
    expect(b.inWorker).toBe(false);
    warn.mockRestore();
    b.destroy();
  });
});
