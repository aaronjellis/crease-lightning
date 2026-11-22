import type { Theme } from './types';

export const babyBoy: Theme = {
  id: 'baby-boy',
  name: 'Baby boy',
  lines: ['WELCOME', 'BABY BOY'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#8fc1e8' },
  styles: [
    {
      id: 'stork',
      name: 'Stork',
      border: null,
      items: [
        { icon: 'star', count: 5, minMm: 9, maxMm: 14 },
        { icon: 'cloud', count: 2, minMm: 9, maxMm: 14 },
        { icon: 'moon', count: 1, minMm: 9, maxMm: 12 },
      ],
    },
    {
      id: 'nursery',
      name: 'Nursery',
      border: null,
      items: [
        { icon: 'moon', count: 2, minMm: 9, maxMm: 12 },
        { icon: 'cloud', count: 2, minMm: 9, maxMm: 14 },
        { icon: 'star', count: 3, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
