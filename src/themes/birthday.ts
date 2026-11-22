import type { Theme } from './types';

export const birthday: Theme = {
  id: 'birthday',
  name: 'Birthday',
  lines: ['HAPPY BIRTHDAY', 'SAM'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#e8453c' },
  accents: ['balloon', 'cake'],
  motifs: [
    { icon: 'confetti', slot: 'back-top-row', minMm: 9, maxMm: 14, count: 6 },
    { icon: 'star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
