/** Messages between the page and the build worker. Everything here survives structured cloning. */
import type { Card } from '../core/build';
import type { Params } from '../core/model';

export type ToWorker =
  /** `base` is the app's folder as an absolute URL, for the bundled fonts. */
  | { type: 'init'; base: string }
  | { type: 'build'; id: number; params: Params; target: 'blade' | 'laser'; strokeCheck: boolean };

export type FromWorker =
  /** The fonts for this build aren't loaded yet; the page shows its loading state. */
  | { type: 'loading'; id: number }
  /** The fonts arrived after a `loading`; the build itself starts now. */
  | { type: 'building'; id: number }
  | { type: 'done'; id: number; card: Card }
  | { type: 'failed'; id: number; reason: 'fonts' | 'error'; message: string };
