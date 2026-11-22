/** File-name slug shared by the bundle and the how-to PDF. */
export const DEFAULT_NAME = 'crease-lightning-card';

/** Lowercase line 1 with non-alphanumerics as `-`, trimmed; empty gives the default name. */
export function slugName(line1: string): string {
  return line1.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || DEFAULT_NAME;
}
