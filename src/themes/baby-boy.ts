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
        { icon: 'stork', count: 1, minMm: 22, maxMm: 26 },
        { icon: 'star', count: 3, minMm: 9, maxMm: 13 },
        { icon: 'cloud', count: 2, minMm: 12, maxMm: 16 },
      ],
    },
    {
      id: 'nursery',
      name: 'Nursery',
      border: 'scallop-edge',
      items: [
        { icon: 'crib', count: 1, minMm: 15, maxMm: 19 },
        { icon: 'rattle', count: 2, minMm: 15, maxMm: 19 },
        { icon: 'moon', count: 1, minMm: 8, maxMm: 12 },
      ],
    },
  ],
};
