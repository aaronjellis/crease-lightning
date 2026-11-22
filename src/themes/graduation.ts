import type { Theme } from './types';

export const graduation: Theme = {
  id: 'graduation',
  name: 'Graduation',
  lines: ['CONGRATS GRAD', 'CLASS OF 2027'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#1f3a5f' },
  motifs: [
    { icon: 'star', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'sparkle-star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'sparkle-star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
