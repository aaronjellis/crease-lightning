/** Loads each font family once per session, on the page or in the build worker. */
import { FALLBACK_FAMILY, type FontSet, type LoadedFont } from './fonts';
import type { Params } from './model';

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
