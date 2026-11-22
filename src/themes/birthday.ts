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
        { icon: 'confetti', count: 6, minMm: 10, maxMm: 14 },
        { icon: 'star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'balloons',
      name: 'Balloons',
      border: null,
      items: [
        { icon: 'balloon', count: 3, minMm: 12, maxMm: 16 },
        { icon: 'gift', count: 2, minMm: 18, maxMm: 22 },
      ],
    },
    {
      id: 'candles',
      name: 'Candles',
      border: 'dot-row',
      items: [
        { icon: 'cake', count: 1, minMm: 22, maxMm: 26 },
        { icon: 'candles', count: 2, minMm: 14, maxMm: 18 },
        { icon: 'party-hat', count: 1, minMm: 16, maxMm: 20 },
      ],
    },
  ],
};
