import type { Theme } from './types';

export const love: Theme = {
  id: 'love',
  name: 'Love',
  lines: ['LOVE YOU', 'ALWAYS'],
  font: 'Arvo',
  colours: { inner: '#fff0f3', jacket: '#c2185b' },
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
      id: 'sweethearts',
      name: 'Sweethearts',
      border: 'heart-row',
      items: [
        { icon: 'heart-stand', count: 3, minMm: 15, maxMm: 19 },
        { icon: 'heart', count: 4, minMm: 8, maxMm: 12 },
      ],
    },
    {
      id: 'roses',
      name: 'Tulips',
      border: 'scallop-edge',
      items: [
        { icon: 'flower-tulip', count: 3, minMm: 22, maxMm: 26 },
        { icon: 'heart-straight', count: 3, minMm: 8, maxMm: 12 },
        { icon: 'mail', count: 1, minMm: 16, maxMm: 20 },
      ],
    },
  ],
};
