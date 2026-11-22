import type { Theme } from './types';

export const thankYou: Theme = {
  id: 'thank-you',
  name: 'Thank you',
  lines: ['THANK YOU', 'SO MUCH'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#2a9d8f' },
  accents: ['gift', 'mail'],
  motifs: [
    { icon: 'heart', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 5 },
    { icon: 'star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'sparkle-star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
