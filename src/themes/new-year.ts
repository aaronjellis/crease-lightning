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
        { icon: 'star', count: 5, minMm: 9, maxMm: 13 },
        { icon: 'sparkle-star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'confetti',
      name: 'Confetti',
      border: 'star-row',
      items: [
        { icon: 'confetti', count: 4, minMm: 10, maxMm: 14 },
        { icon: 'star', count: 3, minMm: 9, maxMm: 13 },
        { icon: 'moon', count: 1, minMm: 8, maxMm: 12 },
      ],
    },
    {
      id: 'fireworks',
      name: 'Fireworks',
      border: 'dot-row',
      items: [
        { icon: 'fireworks', count: 3, minMm: 16, maxMm: 20 },
        { icon: 'champagne', count: 1, minMm: 23, maxMm: 27 },
        { icon: 'sparkle', count: 2, minMm: 16, maxMm: 20 },
      ],
    },
  ],
};
