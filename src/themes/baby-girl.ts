import type { Theme } from './types';

export const babyGirl: Theme = {
  id: 'baby-girl',
  name: 'Baby girl',
  lines: ['WELCOME', 'BABY GIRL'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#f4a6c0' },
  styles: [
    {
      id: 'stork',
      name: 'Stork',
      border: null,
      items: [
        { icon: 'stork', count: 1, minMm: 22, maxMm: 26 },
        { icon: 'heart', count: 3, minMm: 8, maxMm: 12 },
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
