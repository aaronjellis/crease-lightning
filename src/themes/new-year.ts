import type { Theme } from './types';

export const newYear: Theme = {
  id: 'new-year',
  name: 'New Year',
  lines: ['HAPPY NEW YEAR', '2027'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#1b2a49' },
  styles: [
    {
      id: 'stars',
      name: 'Stars',
      border: null,
      items: [
        { icon: 'star', count: 5, minMm: 9, maxMm: 14 },
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'confetti',
      name: 'Confetti',
      border: 'star-row',
      items: [
        { icon: 'confetti', count: 4, minMm: 9, maxMm: 12 },
        { icon: 'star', count: 3, minMm: 9, maxMm: 12 },
        { icon: 'moon', count: 1, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
