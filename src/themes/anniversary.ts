import type { Theme } from './types';

export const anniversary: Theme = {
  id: 'anniversary',
  name: 'Anniversary',
  lines: ['HAPPY ANNIVERSARY', 'ALEX & SAM'],
  font: 'Arvo',
  colours: { inner: '#fff7ee', jacket: '#8c2f39' },
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
      id: 'standing',
      name: 'Standing hearts',
      border: 'heart-row',
      items: [
        { icon: 'heart-stand', count: 2, minMm: 15, maxMm: 19 },
        { icon: 'ring', count: 1, minMm: 17, maxMm: 21 },
        { icon: 'sparkle-star', count: 3, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'toast',
      name: 'Toast',
      border: 'dot-row',
      items: [
        { icon: 'champagne', count: 1, minMm: 23, maxMm: 27 },
        { icon: 'wine-glass', count: 2, minMm: 22, maxMm: 26 },
        { icon: 'sparkle', count: 3, minMm: 16, maxMm: 20 },
      ],
    },
  ],
};
