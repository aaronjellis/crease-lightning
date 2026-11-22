/** What every UI part shares: the params, a way to change them, and the font loader. */
import type { Card } from '../core/build';
import { FALLBACK_FAMILY, type FontSet, type LoadedFont } from '../core/fonts';
import type { Params } from '../core/model';
import type { SceneStatus } from '../view3d/scene';
import type { ViewName } from '../view3d/pose';

export type Host = 'labs' | 'atomm';

/** The part of `CardScene` the UI uses, so tests can stand in a scene without WebGL. */
export interface SceneLike {
  ready: Promise<SceneStatus>;
  onTheta: ((deg: number) => void) | null;
  setCard(card: Card): void;
  setTheta(deg: number): void;
  animateTo(deg: number): Promise<void>;
  setFoldStep(i: number | null): void;
  renderPng(width: number, height: number, thetaDeg: number, view: ViewName): Promise<Uint8Array>;
  dispose(): void;
}

export interface BuildState {
  /** The shown card ran the (slow) stroke check. */
  strokeChecked: boolean;
}

export interface Ctx {
  host: Host;
  params(): Params;
  /** Change the design. `typing` waits 150 ms of quiet before rebuilding. */
  update(next: Params, opts?: { typing?: boolean }): void;
  fonts: FontLoader;
}

/** A UI part: built once, then told about every params change and every new card. */
export interface View {
  el: HTMLElement;
  render(p: Params, card: Card | null, state: BuildState): void;
}

let analyticsOff = false;
/** Events are labs-only: the Atomm host turns them off for good (R27). */
export function setAnalytics(on: boolean): void {
  analyticsOff = !on;
}

/** Sends a custom PostHog event when the loader is on the page. Never carries message text. */
export function track(event: string, props: Record<string, string | number | boolean> = {}): void {
  if (analyticsOff) return;
  const ph = (globalThis as { posthog?: { capture(e: string, p: object): void } }).posthog;
  ph?.capture(event, { project: 'crease-lightning', ...props });
}

/** Loads each font family once and keeps it for the session. */
export class FontLoader {
  private readonly pending = new Map<string, Promise<LoadedFont>>();
  private readonly loaded = new Map<string, LoadedFont>();
  /** Called whenever a family finishes loading, for previews to redraw. */
  onLoad: ((family: string) => void) | null = null;

  constructor(private readonly load: (family: string, text: string) => Promise<LoadedFont>) {}

  request(family: string, text = ''): Promise<LoadedFont> {
    let p = this.pending.get(family);
    if (!p) {
      p = this.load(family, text).then(
        (l) => {
          this.loaded.set(family, l);
          this.onLoad?.(family);
          return l;
        },
        (e) => {
          // Only the bundled Arvo failing throws; let a later attempt try again.
          this.pending.delete(family);
          throw e;
        }
      );
      this.pending.set(family, p);
    }
    return p;
  }

  peek(family: string): LoadedFont | undefined {
    return this.loaded.get(family);
  }

  /**
   * The fonts for these params, if they're all here. A family that fell back is left out of the set,
   * so the fit uses Arvo and adds its own "We couldn't load …" note.
   */
  setFor(p: Params): FontSet | null {
    const fallback = this.loaded.get(FALLBACK_FAMILY);
    if (!fallback || !this.loaded.has(p.font)) return null;
    return {
      get: (family) => {
        const l = this.loaded.get(family);
        return l && l.usedFamily === family ? l.font : undefined;
      },
      fallback: fallback.font,
    };
  }

  async ensure(p: Params): Promise<FontSet> {
    const text = p.line1 + p.line2;
    await Promise.all([this.request(FALLBACK_FAMILY, text), this.request(p.font, text)]);
    return this.setFor(p)!;
  }
}
