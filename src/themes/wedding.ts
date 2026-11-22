import type { Theme } from './types';

export const wedding: Theme = {
  id: 'wedding',
  name: 'Wedding',
  lines: ['JUST MARRIED', 'ALEX & SAM'],
  font: 'Arvo',
  colours: { inner: '#fffdf7', jacket: '#7d9a86' },
  motifs: [
    { icon: 'heart', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'sparkle-star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'sparkle-star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
