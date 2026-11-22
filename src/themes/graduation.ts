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
        { icon: 'mortarboard', count: 3, minMm: 17, maxMm: 21 },
        { icon: 'star', count: 3, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'honours',
      name: 'Honours',
      border: 'cap-row',
      items: [
        { icon: 'trophy', count: 1, minMm: 19, maxMm: 23 },
        { icon: 'scroll', count: 1, minMm: 19, maxMm: 23 },
        { icon: 'medal', count: 1, minMm: 23, maxMm: 27 },
        { icon: 'star', count: 2, minMm: 9, maxMm: 13 },
      ],
    },
  ],
};
