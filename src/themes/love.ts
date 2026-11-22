import type { Theme } from './types';

export const love: Theme = {
  id: 'love',
  name: 'Love',
  lines: ['LOVE YOU', 'ALWAYS'],
  font: 'Arvo',
  colours: { inner: '#fff0f3', jacket: '#c2185b' },
  accents: ['heart-stand', 'mail'],
  motifs: [
    { icon: 'heart', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'sparkle-star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'sparkle-star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
