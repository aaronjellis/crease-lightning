import type { Theme } from './types';

export const graduation: Theme = {
  id: 'graduation',
  name: 'Graduation',
  lines: ['CONGRATS GRAD', 'CLASS OF 2027'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#1f3a5f' },
  styles: [
    {
      id: 'caps',
      name: 'Caps',
      border: null,
      items: [
        { icon: 'star', count: 5, minMm: 9, maxMm: 14 },
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'honours',
      name: 'Honours',
      border: 'star-row',
      items: [
        { icon: 'mortarboard', count: 3, minMm: 12, maxMm: 16 },
        { icon: 'star', count: 4, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
