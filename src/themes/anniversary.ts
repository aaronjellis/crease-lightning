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
        { icon: 'heart', count: 5, minMm: 9, maxMm: 14 },
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'standing',
      name: 'Standing hearts',
      border: 'heart-row',
      items: [
        { icon: 'heart-stand', count: 3, minMm: 10, maxMm: 14 },
        { icon: 'sparkle-star', count: 3, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
