import type { Theme } from './types';

export const christmas: Theme = {
  id: 'christmas',
  name: 'Christmas',
  lines: ['MERRY CHRISTMAS', 'LOVE, SAM'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#c8102e' },
  motifs: [
    { icon: 'snowflake', slot: 'back-top-row', minMm: 16, maxMm: 20, count: 4 },
    { icon: 'star', slot: 'base-front-left', minMm: 9, maxMm: 13, count: 2 },
    { icon: 'star', slot: 'base-front-right', minMm: 9, maxMm: 13, count: 2 },
  ],
};
