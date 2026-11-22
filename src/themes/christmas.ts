import type { Theme } from './types';

export const christmas: Theme = {
  id: 'christmas',
  name: 'Christmas',
  lines: ['MERRY CHRISTMAS', 'LOVE, SAM'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#c8102e' },
  styles: [
    {
      id: 'holly',
      name: 'Holly',
      border: null,
      items: [
        { icon: 'snowflake', count: 4, minMm: 16, maxMm: 20 },
        { icon: 'star', count: 4, minMm: 9, maxMm: 13 },
      ],
    },
    {
      id: 'snow',
      name: 'Snow',
      border: 'snow-row',
      items: [
        { icon: 'tree', count: 3, minMm: 14, maxMm: 18 },
        { icon: 'star', count: 2, minMm: 9, maxMm: 12 },
      ],
    },
  ],
};
