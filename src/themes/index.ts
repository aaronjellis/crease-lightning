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

export type { Icon, Style, Theme } from './types';
export type { Border } from './borders';
export { BORDERS, borderById } from './borders';
export { loadIcon } from './icon';

const MATERIAL = 'https://github.com/marella/material-symbols (Material Symbols, weight 700, rounded, filled)';
const ORIGINAL = 'Original artwork for this project';
const ORIGINAL_LICENCE = 'Original work © 2026 Aaron Ellis, distributed with Crease Lightning';

export const ICONS: Icon[] = [
  loadIcon(balloonSvg, { id: 'balloon', name: 'Balloon', minHeightMm: 18, defaultMm: [18, 22], source: ORIGINAL, licence: ORIGINAL_LICENCE }),
  loadIcon(cakeSvg, { id: 'cake', name: 'Cake', minHeightMm: 18, defaultMm: [18, 22], source: `${MATERIAL}: cake`, licence: 'Apache-2.0' }),
  loadIcon(confettiSvg, { id: 'confetti', name: 'Confetti', minHeightMm: 9, defaultMm: [9, 14], source: ORIGINAL, licence: ORIGINAL_LICENCE }),
  loadIcon(starSvg, { id: 'star', name: 'Star', minHeightMm: 9, defaultMm: [9, 13], source: `${MATERIAL}: star`, licence: 'Apache-2.0' }),
  loadIcon(heartSvg, { id: 'heart', name: 'Heart', minHeightMm: 8, defaultMm: [9, 14], source: `${MATERIAL}: favorite`, licence: 'Apache-2.0' }),
  loadIcon(heart_standSvg, { id: 'heart-stand', name: 'Heart on a stand', minHeightMm: 10, defaultMm: [10, 14], source: `${MATERIAL}: favorite, with a base added`, licence: 'Apache-2.0' }),
  loadIcon(churchSvg, { id: 'church', name: 'Church', minHeightMm: 15, defaultMm: [15, 20], source: `${MATERIAL}: church`, licence: 'Apache-2.0' }),
  loadIcon(wine_glassSvg, { id: 'wine-glass', name: 'Wine glass', minHeightMm: 13, defaultMm: [13, 17], source: `${MATERIAL}: wine_bar`, licence: 'Apache-2.0' }),
  loadIcon(hourglassSvg, { id: 'hourglass', name: 'Hourglass', minHeightMm: 15, defaultMm: [15, 19], source: `${MATERIAL}: hourglass_top`, licence: 'Apache-2.0' }),
  loadIcon(trophySvg, { id: 'trophy', name: 'Trophy', minHeightMm: 13, defaultMm: [13, 17], source: `${MATERIAL}: emoji_events`, licence: 'Apache-2.0' }),
  loadIcon(mortarboardSvg, { id: 'mortarboard', name: 'Graduation cap', minHeightMm: 12, defaultMm: [12, 16], source: ORIGINAL, licence: ORIGINAL_LICENCE }),
  loadIcon(sparkle_starSvg, { id: 'sparkle-star', name: 'Sparkle star', minHeightMm: 9, defaultMm: [9, 13], source: `${MATERIAL}: kid_star`, licence: 'Apache-2.0' }),
  loadIcon(cribSvg, { id: 'crib', name: 'Crib', minHeightMm: 13, defaultMm: [13, 17], source: `${MATERIAL}: crib`, licence: 'Apache-2.0' }),
  loadIcon(baby_faceSvg, { id: 'baby-face', name: 'Baby face', minHeightMm: 14, defaultMm: [14, 18], source: `${MATERIAL}: child_care`, licence: 'Apache-2.0' }),
  loadIcon(cloudSvg, { id: 'cloud', name: 'Cloud', minHeightMm: 8, defaultMm: [9, 14], source: `${MATERIAL}: cloud`, licence: 'Apache-2.0' }),
  loadIcon(moonSvg, { id: 'moon', name: 'Moon', minHeightMm: 8, defaultMm: [9, 12], source: `${MATERIAL}: bedtime`, licence: 'Apache-2.0' }),
  loadIcon(giftSvg, { id: 'gift', name: 'Gift', minHeightMm: 18, defaultMm: [18, 22], source: `${MATERIAL}: redeem`, licence: 'Apache-2.0' }),
  loadIcon(mailSvg, { id: 'mail', name: 'Envelope', minHeightMm: 11, defaultMm: [11, 15], source: `${MATERIAL}: mail`, licence: 'Apache-2.0' }),
  loadIcon(snowflakeSvg, { id: 'snowflake', name: 'Snowflake', minHeightMm: 16, defaultMm: [16, 20], source: `${MATERIAL}: ac_unit`, licence: 'Apache-2.0' }),
  loadIcon(toy_carSvg, { id: 'toy-car', name: 'Toy car', minHeightMm: 18, defaultMm: [18, 22], source: `${MATERIAL}: toys (a toy car)`, licence: 'Apache-2.0' }),
  loadIcon(treeSvg, { id: 'tree', name: 'Tree', minHeightMm: 14, defaultMm: [14, 18], source: ORIGINAL, licence: ORIGINAL_LICENCE }),
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
