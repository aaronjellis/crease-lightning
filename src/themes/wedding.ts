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
        { icon: 'heart', count: 5, minMm: 9, maxMm: 14 },
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'starlit',
      name: 'Starlit',
      border: 'star-row',
      items: [
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
        { icon: 'moon', count: 1, minMm: 9, maxMm: 12 },
        { icon: 'heart', count: 2, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
