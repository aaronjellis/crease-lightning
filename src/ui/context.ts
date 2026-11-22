/** What every UI part shares: the params, a way to change them, and the font loader. */
import type { Card } from '../core/build';
import type { FontLoader } from '../core/fontLoader';
import type { Params } from '../core/model';
import type { SceneStatus } from '../view3d/scene';
import type { ViewName } from '../view3d/pose';

export type Host = 'labs' | 'atomm';

/** The part of `CardScene` the UI uses, so tests can stand in a scene without WebGL. */
export interface SceneLike {
  ready: Promise<SceneStatus>;
  onTheta: ((deg: number) => void) | null;
  setCard(card: Card): void;
  /** Repaints the paper colours without rebuilding the meshes. Optional: `setCard` stands in. */
  setColours?(colours: Card['params']['colours']): void;
  setTheta(deg: number): void;
  animateTo(deg: number): Promise<void>;
  setFoldStep(i: number | null): void;
  renderPng(width: number, height: number, thetaDeg: number, view: ViewName, type?: 'image/png' | 'image/jpeg'): Promise<Uint8Array>;
  dispose(): void;
}

export interface BuildState {
  /** The shown card ran the (slow) stroke check. */
  strokeChecked: boolean;
  /** The stroke check was stopped (it ran too long), so it shows as not run. */
  strokeSkipped: boolean;
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

/** Tells the labs feedback widget about a milestone, so it can suggest a related experiment. Off on Atomm. */
export function milestone(name: 'export'): void {
  if (analyticsOff) return;
  const fb = (globalThis as { labsFeedback?: { milestone?(m: string): void } }).labsFeedback;
  fb?.milestone?.(name);
}

export { FontLoader } from '../core/fontLoader';
