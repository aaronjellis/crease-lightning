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
        { icon: 'heart', count: 5, minMm: 9, maxMm: 14 },
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
        { icon: 'heart', count: 3, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
