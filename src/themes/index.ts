import type { ThemeId } from '../core/model';
import { blank } from './blank';
import { birthday } from './birthday';
import { loadIcon } from './icon';
import balloonSvg from './icons/balloon.svg?raw';
import cakeSvg from './icons/cake.svg?raw';
import confettiSvg from './icons/confetti.svg?raw';
import starSvg from './icons/star.svg?raw';
import type { Icon, Theme } from './types';

export type { Icon, Motif, SlotId, Theme } from './types';
export { loadIcon } from './icon';

const MATERIAL = 'https://github.com/marella/material-symbols (Material Symbols, weight 700, rounded, filled)';
const ORIGINAL = 'Original artwork for Crease Lightning';

export const ICONS: Icon[] = [
  loadIcon(balloonSvg, { id: 'balloon', minHeightMm: 18, source: ORIGINAL, licence: 'Original work' }),
  loadIcon(cakeSvg, { id: 'cake', minHeightMm: 18, source: `${MATERIAL}: cake`, licence: 'Apache-2.0' }),
  loadIcon(confettiSvg, { id: 'confetti', minHeightMm: 9, source: ORIGINAL, licence: 'Original work' }),
  loadIcon(starSvg, { id: 'star', minHeightMm: 9, source: `${MATERIAL}: star`, licence: 'Apache-2.0' }),
];

export const THEMES: Theme[] = [birthday, blank];

export function themeById(id: ThemeId): Theme {
  const t = THEMES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown theme "${id}".`);
  return t;
}

export function iconById(id: string): Icon {
  const i = ICONS.find((x) => x.id === id);
  if (!i) throw new Error(`Unknown icon "${id}".`);
  return i;
}
