import type { Theme } from './types';

export const birthday: Theme = {
  id: 'birthday',
  name: 'Birthday',
  lines: ['HAPPY BIRTHDAY', 'SAM'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#e8453c' },
  styles: [
    {
      id: 'confetti',
      name: 'Confetti',
      border: null,
      items: [
        { icon: 'confetti', count: 6, minMm: 9, maxMm: 14 },
        { icon: 'star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'balloons',
      name: 'Balloons',
      border: null,
      items: [
        { icon: 'balloon', count: 3, minMm: 18, maxMm: 22 },
        { icon: 'star', count: 3, minMm: 9, maxMm: 12 },
      ],
    },
    {
      id: 'candles',
      name: 'Candles',
      border: 'confetti-row',
      items: [
        { icon: 'cake', count: 2, minMm: 18, maxMm: 22 },
        { icon: 'star', count: 4, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
