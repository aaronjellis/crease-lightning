import type { Theme } from './types';

export const wedding: Theme = {
  id: 'wedding',
  name: 'Wedding',
  lines: ['JUST MARRIED', 'ALEX & SAM'],
  font: 'Arvo',
  colours: { inner: '#fffdf7', jacket: '#7d9a86' },
  styles: [
    {
      id: 'hearts',
      name: 'Hearts',
      border: null,
      items: [
        { icon: 'heart', count: 5, minMm: 8, maxMm: 12 },
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'starlit',
      name: 'Starlit',
      border: 'star-row',
      items: [
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
        { icon: 'moon', count: 1, minMm: 8, maxMm: 12 },
        { icon: 'heart', count: 2, minMm: 8, maxMm: 12 },
      ],
    },
    {
      id: 'rings',
      name: 'Rings',
      border: 'scallop-edge',
      items: [
        { icon: 'ring', count: 2, minMm: 17, maxMm: 21 },
        { icon: 'bell', count: 2, minMm: 14, maxMm: 18 },
        { icon: 'flower', count: 3, minMm: 12, maxMm: 16 },
      ],
    },
  ],
};
