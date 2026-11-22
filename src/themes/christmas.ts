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
        { icon: 'holly', count: 3, minMm: 18, maxMm: 22 },
        { icon: 'gift', count: 2, minMm: 18, maxMm: 22 },
      ],
    },
    {
      id: 'snow',
      name: 'Snow',
      border: 'snow-row',
      items: [
        { icon: 'tree', count: 3, minMm: 12, maxMm: 16 },
        { icon: 'snowflake', count: 2, minMm: 14, maxMm: 18 },
      ],
    },
  ],
};
