import type { Theme } from './types';

export const thankYou: Theme = {
  id: 'thank-you',
  name: 'Thank you',
  lines: ['THANK YOU', 'SO MUCH'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#2a9d8f' },
  styles: [
    {
      id: 'hearts',
      name: 'Hearts',
      border: null,
      items: [
        { icon: 'heart', count: 5, minMm: 9, maxMm: 14 },
        { icon: 'star', count: 2, minMm: 9, maxMm: 13 },
        { icon: 'sparkle-star', count: 2, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'stars',
      name: 'Stars',
      border: 'star-row',
      items: [
        { icon: 'star', count: 4, minMm: 9, maxMm: 13 },
        { icon: 'sparkle-star', count: 3, minMm: 9, maxMm: 12 },
        { icon: 'heart', count: 2, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
