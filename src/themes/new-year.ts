import type { Theme } from './types';

export const newYear: Theme = {
  id: 'new-year',
  name: 'New Year',
  lines: ['HAPPY NEW YEAR', '2027'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#1b2a49' },
  accents: ['wine-glass', 'hourglass'],
  motifs: [
    { icon: 'star', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'sparkle-star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'sparkle-star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
