import type { Theme } from './types';

export const babyBoy: Theme = {
  id: 'baby-boy',
  name: 'Baby boy',
  lines: ['WELCOME', 'BABY BOY'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#8fc1e8' },
  motifs: [
    { icon: 'star', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'cloud', slot: 'base-front-left', minMm: 9, maxMm: 14, count: 1 },
    { icon: 'cloud', slot: 'base-front-right', minMm: 9, maxMm: 14, count: 1 },
    { icon: 'moon', slot: 'base-front-right', minMm: 9, maxMm: 12, count: 1 },
  ],
};
