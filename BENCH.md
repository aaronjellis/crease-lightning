# Bench tests

Only real cuts settle the numbers below. Run these before the Atomm zip goes
in. Record what you find in the tables, then change the constants in
`src/core/constants.ts` and rerun `npm test`.

## Who runs what

- **Aaron:** the xTool tests (laser and C1).
- **Aaron's sister:** the Cricut test. Follow only the steps the **Export**
  window shows. Don't read this file's Cricut notes first, and write down every
  place you get stuck or guess.

## Tests

1. Cut and fold the default Birthday card on each machine. Crease every fold
   over a credit card. Confirm the pop-up stands at 90° when the card is open
   and closes flat inside the jacket.
2. **Cricut:** upload `<name>-both.svg` to Design Space using only the
   on-screen steps. Check:
   - The 100 mm ruler on the sheet measures 100 mm.
   - The inner sheet and the jacket go on separate mats.
   - The score layers switch to **Score**.
   - **Attach** keeps each piece's cut and score lines together.
3. **xTool C1:** the same, in xTool's software.
4. Perforation and scoring on 65 to 80 lb card (laser and C1).
5. The smallest letter height that still reads clearly and stands up without
   folding over.

## Results

### Machine runs

| Date | Machine | Card stock | Pops at 90° | Closes flat | Notes |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Cricut import (sister)

| Step | Worked as written? | Where she got stuck |
| --- | --- | --- |
| Upload | | |
| Change score layers to Score | | |
| Attach each piece | | |
| Make it (two mats) | | |
| Size check (100 mm) | | |

### Perforation and scoring

Perforated folds alternate a cut and a gap. Today the cut is 2 mm and the gap
is 1 mm.

| Date | Machine | Stock | Cut (mm) | Gap (mm) | Score power or depth | Folds cleanly? | Tears? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | 2 | 1 | | | |

### Letter size and stroke

| Date | Machine | Font | Letter height (mm) | Reads clearly? | Stands up? | Thin strokes tore? |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Constants these tests tune

| Constant | Today | Set by |
| --- | --- | --- |
| `PERF_CUT_MM` | 2 | Perforation and scoring |
| `PERF_BRIDGE_MM` | 1 | Perforation and scoring |
| `WARN_CAP_MM` | 9 | Letter size: below this, the app warns |
| `STRONG_CAP_MM` | 7 | Letter size: below this, the warning is strong |
| `MIN_STROKE_BLADE_MM` | 1.5 | Thin strokes on a blade cutter |
| `MIN_STROKE_LASER_MM` | 1.0 | Thin strokes on a laser |
| `CARD_THICKNESS_MM` | 0.3 | Machine runs: whether the card closes flat |

After the Cricut test, fix any step copy she tripped on in
`src/ui/strings.ts`.
