/**
 * Where builds run (R30). In the browser, two module workers: one for the per-keystroke previews and
 * one for the slow builds (the idle stroke check and exports), so a stroke check never holds up the
 * next preview. Tests (happy-dom) and browsers without module workers build on the page instead.
 *
 * Latest request wins: each kind of request waits in a slot of its own, and a newer request replaces
 * one that hasn't started (the replaced one resolves as `stale`). A build that runs past the timeout
 * has its worker terminated and recreated, and resolves as `timeout`.
 */
import { build, type Card } from '../core/build';
import type { FontLoader } from '../core/fontLoader';
import type { Params } from '../core/model';
import type { FromWorker, ToWorker } from '../worker/protocol';

export type BuildKind = 'preview' | 'stroke' | 'export';

export type BuildOutcome =
  | { ok: true; card: Card }
  | { ok: false; reason: 'stale' | 'fonts' | 'error' | 'timeout'; message?: string };

export interface BuildRequest {
  params: Params;
  target: 'blade' | 'laser';
  strokeCheck: boolean;
  kind: BuildKind;
}

export interface Builder {
  /** Resolves with a card whose `params` is the very object passed in. */
  build(req: BuildRequest): Promise<BuildOutcome>;
  /** Told when a preview starts and stops waiting on fonts. */
  onLoading: ((on: boolean) => void) | null;
  readonly inWorker: boolean;
  destroy(): void;
}

/** Long past the slowest stroke-checked build (about 3 s): anything slower is stuck. */
export const BUILD_TIMEOUT_MS = 20_000;
/** How long a build may wait on a font download before its worker counts as stuck. */
export const FONT_TIMEOUT_MS = 60_000;

/** Whether `new Worker(url, { type: 'module' })` is understood (the browser reads the option). */
export function moduleWorkersSupported(): boolean {
  if (typeof Worker === 'undefined') return false;
  let supported = false;
  const tester = {
    get type(): 'module' {
      supported = true;
      return 'module';
    },
  };
  try {
    new Worker('blob://', tester).terminate();
  } catch {
    // The bad URL throws after the option was read.
  }
  return supported;
}

/** Builds on the page, with the page's fonts. */
export function mainThreadBuilder(fonts: FontLoader): Builder {
  const b: Builder = {
    onLoading: null,
    inWorker: false,
    async build({ params, target, strokeCheck, kind }) {
      let set = fonts.setFor(params);
      if (!set) {
        if (kind === 'preview') b.onLoading?.(true);
        try {
          set = await fonts.ensure(params);
        } catch (e) {
          console.error(e);
          return { ok: false, reason: 'fonts', message: String(e) };
        } finally {
          if (kind === 'preview') b.onLoading?.(false);
        }
      }
      if (strokeCheck) await fonts.ensureHeavy();
      try {
        return { ok: true, card: build(params, { fonts: set }, target, { strokeCheck }) };
      } catch (e) {
        console.error(e);
        return { ok: false, reason: 'error', message: String(e) };
      }
    },
    destroy() {},
  };
  return b;
}

interface Pending extends BuildRequest {
  id: number;
  resolve(o: BuildOutcome): void;
}

/** One worker and its request slots; `order` is which waiting kind goes first. */
class Lane {
  private worker: Worker | null = null;
  private inflight: (Pending & { timer: ReturnType<typeof setTimeout> }) | null = null;
  private readonly waiting = new Map<BuildKind, Pending>();
  private nextId = 0;

  constructor(
    private readonly spawn: () => Worker,
    private readonly base: string,
    private readonly order: BuildKind[],
    private readonly timeoutMs: number,
    private readonly onLoading: (on: boolean) => void,
    /** The worker couldn't start: hand everything waiting to the page. */
    private readonly onBroken: (pending: Pending[]) => void
  ) {}

  request(req: BuildRequest): Promise<BuildOutcome> {
    return new Promise((resolve) => {
      this.waiting.get(req.kind)?.resolve({ ok: false, reason: 'stale' });
      this.waiting.set(req.kind, { ...req, id: ++this.nextId, resolve });
      this.pump();
    });
  }

  private start(): Worker {
    const w = this.spawn();
    w.addEventListener('message', (e: MessageEvent<FromWorker>) => this.receive(w, e.data));
    w.addEventListener('error', (e) => {
      e.preventDefault();
      this.broken(w);
    });
    w.postMessage({ type: 'init', base: this.base } satisfies ToWorker);
    return w;
  }

  private pump() {
    if (this.inflight) return;
    const kind = this.order.find((k) => this.waiting.has(k));
    if (!kind) return;
    if (!this.worker) {
      try {
        this.worker = this.start();
      } catch (e) {
        // A page policy can forbid workers outright (new Worker throws).
        console.error(e);
        const pending = [...this.waiting.values()];
        this.waiting.clear();
        return this.onBroken(pending);
      }
    }
    const next = this.waiting.get(kind)!;
    this.waiting.delete(kind);
    this.inflight = { ...next, timer: this.timer(this.timeoutMs) };
    const { id, params, target, strokeCheck } = next;
    this.worker.postMessage({ type: 'build', id, params, target, strokeCheck } satisfies ToWorker);
  }

  private timer(ms: number) {
    return setTimeout(() => this.timedOut(), ms);
  }

  private finish(outcome: BuildOutcome) {
    const r = this.inflight;
    if (!r) return;
    clearTimeout(r.timer);
    this.inflight = null;
    if (r.kind === 'preview') this.onLoading(false);
    r.resolve(outcome);
    this.pump();
  }

  private receive(w: Worker, m: FromWorker) {
    // A message from a worker that was replaced, or for a request that already timed out, is stale.
    if (w !== this.worker || !this.inflight || m.id !== this.inflight.id) return;
    if (m.type === 'loading' || m.type === 'building') {
      // Waiting on a font download gets longer; the build itself gets the usual time once it starts.
      clearTimeout(this.inflight.timer);
      this.inflight.timer = this.timer(m.type === 'loading' ? FONT_TIMEOUT_MS : this.timeoutMs);
      if (this.inflight.kind === 'preview') this.onLoading(m.type === 'loading');
    } else if (m.type === 'done') {
      // Structured cloning made a copy; the page compares params by identity (R24).
      this.finish({ ok: true, card: { ...m.card, params: this.inflight.params } });
    } else {
      if (m.reason === 'error') console.error(m.message);
      this.finish({ ok: false, reason: m.reason, message: m.message });
    }
  }

  private timedOut() {
    this.worker?.terminate();
    this.worker = null;
    this.finish({ ok: false, reason: 'timeout' });
  }

  private broken(w: Worker) {
    if (w !== this.worker) return;
    w.terminate();
    this.worker = null;
    const pending = [...(this.inflight ? [this.inflight] : []), ...this.waiting.values()];
    if (this.inflight) clearTimeout(this.inflight.timer);
    this.inflight = null;
    this.waiting.clear();
    this.onBroken(pending);
  }

  destroy() {
    if (this.inflight) clearTimeout(this.inflight.timer);
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * Builds in two module workers. `base` is the app's folder as an absolute URL (for the bundled fonts);
 * `spawn` makes a worker. If a worker can't start, every build from then on runs on the page.
 */
export function workerBuilder(
  fonts: FontLoader,
  opts: { base: string; spawn: () => Worker; timeoutMs?: number }
): Builder {
  const fallback = mainThreadBuilder(fonts);
  let broken = false;
  const timeout = opts.timeoutMs ?? BUILD_TIMEOUT_MS;
  const loading = (on: boolean) => b.onLoading?.(on);
  const onBroken = (pending: Pending[]) => {
    if (!broken) console.warn('The build worker could not start; building on the page instead.');
    broken = true;
    fallback.onLoading = loading;
    for (const r of pending) void fallback.build(r).then(r.resolve);
  };
  const preview = new Lane(opts.spawn, opts.base, ['preview'], timeout, loading, onBroken);
  const slow = new Lane(opts.spawn, opts.base, ['export', 'stroke'], timeout, loading, onBroken);
  const b: Builder = {
    onLoading: null,
    get inWorker() {
      return !broken;
    },
    build(req) {
      if (broken) return fallback.build(req);
      return (req.kind === 'preview' ? preview : slow).request(req);
    },
    destroy() {
      preview.destroy();
      slow.destroy();
    },
  };
  return b;
}
