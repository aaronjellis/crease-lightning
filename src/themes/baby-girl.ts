import type { Theme } from './types';

export const babyGirl: Theme = {
  id: 'baby-girl',
  name: 'Baby girl',
  lines: ['WELCOME', 'BABY GIRL'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#f4a6c0' },
  motifs: [
    { icon: 'heart', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'cloud', slot: 'base-front-left', minMm: 9, maxMm: 14, count: 1 },
    { icon: 'cloud', slot: 'base-front-right', minMm: 9, maxMm: 14, count: 1 },
    { icon: 'moon', slot: 'base-front-left', minMm: 9, maxMm: 12, count: 1 },
  ],
};
