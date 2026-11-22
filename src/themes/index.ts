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
import { loadIcon, type IconMeta } from './icon';
import type { Icon, Theme } from './types';

export type { Icon, Style, Theme } from './types';
export type { Border } from './borders';
export { BORDERS, borderById } from './borders';
export { loadIcon } from './icon';

/** Every icon's SVG, by file name. */
const SVGS = import.meta.glob<string>('./icons/*.svg', { query: '?raw', import: 'default', eager: true });

const PHOSPHOR = 'https://github.com/phosphor-icons/core (Phosphor Icons 2.1.1, fill weight)';
export const ORIGINAL_LICENCE = 'Original work © 2026 Aaron Ellis, distributed with Crease Lightning';

type Group = Icon['themes'][number];
const B: Group = 'birthday';
const AN: Group = 'anniversary';
const W: Group = 'wedding';
const G: Group = 'graduation';
const GIRL: Group = 'baby-girl';
const BOY: Group = 'baby-boy';
const BABY: Group[] = [GIRL, BOY];
const X: Group = 'christmas';
const NY: Group = 'new-year';
const TY: Group = 'thank-you';
const L: Group = 'love';
const E: Group = 'everyday';

/**
 * One row per icon: id, picker name, minimum height (mm), groups, and the Phosphor fill icon it
 * comes from (null for an original drawn by scripts/draw-originals.ts). `fill` fills the icon's
 * paper details instead of bridging them, where a bridge would look wrong.
 */
type Row = [id: string, name: string, minMm: number, themes: Group[], phosphor: string | null, opts?: { fill?: true }];
const FILL = { fill: true } as const;

const ROWS: Row[] = [
  // The original set: ids stay, because share links carry them.
  ['balloon', 'Balloon', 12, [B, ...BABY, NY], 'balloon', FILL],
  ['cake', 'Cake', 22, [B, AN, W], 'cake'],
  ['confetti', 'Confetti', 10, [B, NY, G], null],
  ['star', 'Star', 9, [B, G, BOY, X, NY, TY, E], 'star'],
  ['heart', 'Heart', 8, [AN, W, GIRL, L, TY, E], 'heart'],
  ['heart-stand', 'Heart on a stand', 15, [AN, W, L], null],
  ['church', 'Church', 21, [W, X], 'church'],
  ['wine-glass', 'Wine glass', 22, [AN, W, NY, L], 'wine'],
  ['hourglass', 'Hourglass', 12, [AN, NY, G], 'hourglass'],
  ['trophy', 'Trophy', 19, [G, TY], 'trophy'],
  ['mortarboard', 'Graduation cap', 17, [G], null],
  ['sparkle-star', 'Four-point star', 9, [AN, W, NY, GIRL, TY, L], 'star-four'],
  ['crib', 'Crib', 15, BABY, null],
  ['baby-face', 'Baby face', 20, BABY, null],
  ['cloud', 'Cloud', 12, [...BABY, E], 'cloud'],
  ['moon', 'Moon', 8, [...BABY, W, NY, E], 'moon'],
  ['gift', 'Gift', 18, [B, X, TY], null],
  ['mail', 'Envelope', 16, [TY, L, E], 'envelope'],
  ['snowflake', 'Snowflake', 14, [X, E], null],
  ['toy-car', 'Toy car', 14, [BOY], 'car-profile', FILL],
  ['tree', 'Christmas tree', 12, [X, E], null],
  // Originals in Phosphor's style, for subjects it lacks.
  ['candle', 'Candle', 14, [B, AN, X], null],
  ['candles', 'Candles', 14, [B], null],
  ['stork', 'Stork', 22, BABY, null],
  ['rattle', 'Rattle', 15, BABY, null],
  ['baby-bottle', 'Baby bottle', 15, BABY, null],
  ['pacifier', 'Pacifier', 15, BABY, null],
  ['teddy-bear', 'Teddy bear', 16, [...BABY, B], null],
  ['party-hat', 'Party hat', 16, [B, NY], null],
  ['cupcake', 'Cupcake', 16, [B, TY], null],
  ['fireworks', 'Fireworks', 16, [NY, B], null],
  ['holly', 'Holly', 18, [X], null],
  ['snowman', 'Snowman', 17, [X, E], null],
  ['candy-cane', 'Candy cane', 16, [X], null],
  ['mitten', 'Mitten', 15, [X, E], null],
  ['ring', 'Ring', 17, [W, AN, L], null],
  ['pumpkin', 'Pumpkin', 15, [TY, E], null],
  ['dot', 'Dot', 4, [E], null],
  ['scallop', 'Scallop', 6, [E], null],
  // From Phosphor's fill set.
  ['baby-carriage', 'Pram', 20, BABY, 'baby-carriage'],
  ['bird', 'Bird', 12, [W, ...BABY, E], 'bird', FILL],
  ['heart-straight', 'Heart, pointed', 8, [L, AN, W], 'heart-straight'],
  ['hand-heart', 'Hand with heart', 18, [TY, L], 'hand-heart'],
  ['champagne', 'Champagne', 23, [NY, W, AN, B], 'champagne'],
  ['sparkle', 'Sparkle', 16, [NY, W, AN, L, E], 'sparkle'],
  ['shooting-star', 'Shooting star', 21, [NY, G], 'shooting-star'],
  ['flower', 'Flower', 12, [TY, L, W, AN, GIRL, E], 'flower', FILL],
  ['flower-tulip', 'Tulip', 22, [L, TY, AN, E], 'flower-tulip', FILL],
  ['cat', 'Cat', 13, [E], 'cat', FILL],
  ['dog', 'Dog', 20, [E], 'dog'],
  ['paw-print', 'Paw print', 13, [E], 'paw-print'],
  ['crown-simple', 'Crown', 12, [B, G, L], 'crown-simple'],
  ['diamond', 'Diamond', 10, [W, AN, L], 'diamond'],
  ['diamonds-four', 'Four diamonds', 13, [E], 'diamonds-four'],
  ['music-notes', 'Music notes', 21, [B, W, E], 'music-notes'],
  ['music-note', 'Music note', 19, [E], 'music-note'],
  ['sun', 'Sun', 23, [BOY, E], 'sun'],
  ['moon-stars', 'Moon and stars', 13, [NY, ...BABY, E], 'moon-stars'],
  ['rainbow-cloud', 'Rainbow', 15, [...BABY, TY, E], 'rainbow-cloud'],
  ['umbrella-simple', 'Umbrella', 21, [E], 'umbrella-simple'],
  ['cookie', 'Cookie', 12, [X, TY, E], 'cookie', FILL],
  ['ice-cream', 'Ice cream', 14, [B, E], 'ice-cream', FILL],
  ['coffee', 'Coffee', 22, [TY, E], 'coffee'],
  ['martini', 'Cocktail', 19, [NY, B], 'martini'],
  ['house', 'House', 12, [E], 'house'],
  ['key', 'Key', 12, [B, E], 'key', FILL],
  ['fish', 'Fish', 12, [E], 'fish', FILL],
  ['ghost', 'Ghost', 12, [E], 'ghost', FILL],
  ['egg', 'Egg', 10, [E], 'egg'],
  ['egg-crack', 'Hatching egg', 15, BABY, 'egg-crack'],
  ['clover', 'Clover', 22, [E], 'clover'],
  ['bell', 'Bell', 14, [X, W], 'bell'],
  ['scroll', 'Scroll', 19, [G], 'scroll', FILL],
  ['medal', 'Medal', 23, [G, TY], 'medal'],
  ['lightning', 'Lightning', 15, [E], 'lightning'],
  ['leaf', 'Leaf', 12, [TY, E], 'leaf'],
  ['cactus', 'Cactus', 20, [E], 'cactus'],
  ['acorn', 'Acorn', 23, [TY, E], 'acorn'],
  ['piggy-bank', 'Piggy bank', 19, [E], 'piggy-bank', FILL],
  ['rocket', 'Rocket', 22, [G, BOY, E], 'rocket', FILL],
  ['airplane', 'Airplane', 12, [G, E], 'airplane'],
  ['camera', 'Camera', 14, [E], 'camera'],
  ['guitar', 'Guitar', 14, [E], 'guitar', FILL],
  ['book-open', 'Book', 16, [G, E], 'book-open'],
  ['basketball', 'Basketball', 14, [E], 'basketball'],
  ['tennis-ball', 'Tennis ball', 15, [E], 'tennis-ball'],
  ['football', 'Football', 12, [E], 'football', FILL],
  ['flag', 'Flag', 19, [G, E], 'flag'],
  ['flag-pennant', 'Pennant', 18, [G, B], 'flag-pennant'],
  ['student', 'Graduate', 20, [G], 'student'],
  ['sailboat', 'Sailboat', 22, [E], 'sailboat'],
  ['tree-palm', 'Palm tree', 19, [E], 'tree-palm'],
  ['cherries', 'Cherries', 20, [E], 'cherries'],
  ['cloud-sun', 'Sun and cloud', 20, [E], 'cloud-sun'],
  ['sun-horizon', 'Sunrise', 17, [E], 'sun-horizon'],
  ['feather', 'Feather', 21, [E], 'feather'],
  ['island', 'Island', 21, [E], 'island'],
  ['lightbulb', 'Light bulb', 22, [G], 'lightbulb', FILL],
];

const ORIGINALS: Record<string, string> = {
  confetti: 'a scatter of squares, dots, and a curl',
  'heart-stand': 'a heart on a stem and base',
  mortarboard: 'a graduation cap with its tassel',
  crib: 'a crib with posts, rails, and slats',
  'baby-face': 'a baby face with a curl of hair',
  gift: 'a gift box with a bow and ribbon',
  snowflake: 'a six-armed snowflake',
  candle: 'a striped candle with its flame',
  candles: 'three striped candles',
  stork: 'a stork in flight carrying a bundle',
  rattle: 'a baby rattle',
  'baby-bottle': 'a baby bottle',
  pacifier: 'a pacifier',
  'teddy-bear': 'a teddy bear',
  'party-hat': 'a striped party hat',
  cupcake: 'a cupcake with a cherry',
  fireworks: 'a firework burst',
  holly: 'two holly leaves and berries',
  snowman: 'a snowman in a top hat',
  'candy-cane': 'a striped candy cane',
  mitten: 'a mitten',
  ring: 'a ring with a gem',
  pumpkin: 'a pumpkin',
  tree: 'an evergreen in three tiers',
  dot: 'a disc, the dot border tile',
  scallop: 'a scalloped disc, the scallop border tile',
};

const meta = ([id, name, minMm, themes, phosphor, opts]: Row): IconMeta => ({
  id,
  name,
  themes,
  minHeightMm: minMm,
  defaultMm: [minMm, Math.min(60, minMm + 4)],
  source: phosphor ? `${PHOSPHOR}: ${phosphor}` : `Original artwork for this project (${ORIGINALS[id]})`,
  licence: phosphor ? 'MIT' : ORIGINAL_LICENCE,
  ...opts,
});

export const ICONS: Icon[] = ROWS.map((row) => {
  const svg = SVGS[`./icons/${row[0]}.svg`];
  if (!svg) throw new Error(`Icon "${row[0]}" has no SVG file.`);
  return loadIcon(svg, meta(row));
});

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
