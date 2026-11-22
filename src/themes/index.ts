import type { ThemeId } from '../core/model';
import { blank } from './blank';
import { birthday } from './birthday';
import { anniversary } from './anniversary';
import { wedding } from './wedding';
import { graduation } from './graduation';
import { babyGirl } from './baby-girl';
import { babyBoy } from './baby-boy';
import { christmas } from './christmas';
import { newYear } from './new-year';
import { thankYou } from './thank-you';
import { love } from './love';
import { loadIcon } from './icon';
import balloonSvg from './icons/balloon.svg?raw';
import cakeSvg from './icons/cake.svg?raw';
import confettiSvg from './icons/confetti.svg?raw';
import starSvg from './icons/star.svg?raw';
import heartSvg from './icons/heart.svg?raw';
import heart_standSvg from './icons/heart-stand.svg?raw';
import churchSvg from './icons/church.svg?raw';
import wine_glassSvg from './icons/wine-glass.svg?raw';
import hourglassSvg from './icons/hourglass.svg?raw';
import trophySvg from './icons/trophy.svg?raw';
import mortarboardSvg from './icons/mortarboard.svg?raw';
import sparkle_starSvg from './icons/sparkle-star.svg?raw';
import cribSvg from './icons/crib.svg?raw';
import baby_faceSvg from './icons/baby-face.svg?raw';
import cloudSvg from './icons/cloud.svg?raw';
import moonSvg from './icons/moon.svg?raw';
import giftSvg from './icons/gift.svg?raw';
import mailSvg from './icons/mail.svg?raw';
import snowflakeSvg from './icons/snowflake.svg?raw';
import toy_carSvg from './icons/toy-car.svg?raw';
import treeSvg from './icons/tree.svg?raw';
import type { Icon, Theme } from './types';

export type { Icon, Motif, SlotId, Theme } from './types';
export { loadIcon } from './icon';

const MATERIAL = 'https://github.com/marella/material-symbols (Material Symbols, weight 700, rounded, filled)';
const ORIGINAL = 'Original artwork for this project';
const ORIGINAL_LICENCE = 'Original work © 2026 Aaron Ellis, distributed with Crease Lightning';

export const ICONS: Icon[] = [
  loadIcon(balloonSvg, { id: 'balloon', minHeightMm: 18, source: ORIGINAL, licence: ORIGINAL_LICENCE }),
  loadIcon(cakeSvg, { id: 'cake', minHeightMm: 18, source: `${MATERIAL}: cake`, licence: 'Apache-2.0' }),
  loadIcon(confettiSvg, { id: 'confetti', minHeightMm: 9, source: ORIGINAL, licence: ORIGINAL_LICENCE }),
  loadIcon(starSvg, { id: 'star', minHeightMm: 9, source: `${MATERIAL}: star`, licence: 'Apache-2.0' }),
  loadIcon(heartSvg, { id: 'heart', minHeightMm: 8, source: `${MATERIAL}: favorite`, licence: 'Apache-2.0' }),
  loadIcon(heart_standSvg, { id: 'heart-stand', minHeightMm: 10, source: `${MATERIAL}: favorite, with a base added`, licence: 'Apache-2.0' }),
  loadIcon(churchSvg, { id: 'church', minHeightMm: 15, source: `${MATERIAL}: church`, licence: 'Apache-2.0' }),
  loadIcon(wine_glassSvg, { id: 'wine-glass', minHeightMm: 13, source: `${MATERIAL}: wine_bar`, licence: 'Apache-2.0' }),
  loadIcon(hourglassSvg, { id: 'hourglass', minHeightMm: 15, source: `${MATERIAL}: hourglass_top`, licence: 'Apache-2.0' }),
  loadIcon(trophySvg, { id: 'trophy', minHeightMm: 13, source: `${MATERIAL}: emoji_events`, licence: 'Apache-2.0' }),
  loadIcon(mortarboardSvg, { id: 'mortarboard', minHeightMm: 12, source: ORIGINAL, licence: ORIGINAL_LICENCE }),
  loadIcon(sparkle_starSvg, { id: 'sparkle-star', minHeightMm: 9, source: `${MATERIAL}: kid_star`, licence: 'Apache-2.0' }),
  loadIcon(cribSvg, { id: 'crib', minHeightMm: 13, source: `${MATERIAL}: crib`, licence: 'Apache-2.0' }),
  loadIcon(baby_faceSvg, { id: 'baby-face', minHeightMm: 14, source: `${MATERIAL}: child_care`, licence: 'Apache-2.0' }),
  loadIcon(cloudSvg, { id: 'cloud', minHeightMm: 8, source: `${MATERIAL}: cloud`, licence: 'Apache-2.0' }),
  loadIcon(moonSvg, { id: 'moon', minHeightMm: 8, source: `${MATERIAL}: bedtime`, licence: 'Apache-2.0' }),
  loadIcon(giftSvg, { id: 'gift', minHeightMm: 18, source: `${MATERIAL}: redeem`, licence: 'Apache-2.0' }),
  loadIcon(mailSvg, { id: 'mail', minHeightMm: 11, source: `${MATERIAL}: mail`, licence: 'Apache-2.0' }),
  loadIcon(snowflakeSvg, { id: 'snowflake', minHeightMm: 16, source: `${MATERIAL}: ac_unit`, licence: 'Apache-2.0' }),
  loadIcon(toy_carSvg, { id: 'toy-car', minHeightMm: 18, source: `${MATERIAL}: toys (a toy car)`, licence: 'Apache-2.0' }),
  loadIcon(treeSvg, { id: 'tree', minHeightMm: 14, source: ORIGINAL, licence: ORIGINAL_LICENCE }),
];

export const THEMES: Theme[] = [birthday, anniversary, wedding, graduation, babyGirl, babyBoy, christmas, newYear, thankYou, love, blank];

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
