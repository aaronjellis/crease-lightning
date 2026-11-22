import type { Theme } from './types';

export const anniversary: Theme = {
  id: 'anniversary',
  name: 'Anniversary',
  lines: ['HAPPY ANNIVERSARY', 'ALEX & SAM'],
  font: 'Arvo',
  colours: { inner: '#fff7ee', jacket: '#8c2f39' },
  motifs: [
    { icon: 'heart', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'sparkle-star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'sparkle-star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
