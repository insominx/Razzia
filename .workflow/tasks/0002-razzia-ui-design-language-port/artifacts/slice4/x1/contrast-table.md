# X1 scrim ladder

Date: 2026-07-31

Scrim color: `rgb(6 9 15)` over four 1920×1080 cover-cropped fixtures. Text samples use the
planned over-photo roles: body `#f4f8fc`, label `#e7edf5`, and answer `#ffffff`.

The measurement computes WCAG 2 relative luminance for every composited pixel and records the minimum
contrast ratio plus the responsible RGB pixel. This is stricter than sampling only beneath the three
text runs: the whole frame is the candidate set, so every possible text placement is covered. Ratios must
be at least 4.5:1.

| fixture | scrim | body ratio / RGB | label ratio / RGB | answer ratio / RGB | result |
|---|---:|---|---|---|---|
| bright white balloon | 0.00 | 1.00 / 243,249,245 | 1.00 / 252,239,134 | 1.00 / 254,255,255 | fail |
| bright white balloon | 0.35 | 2.21 / 167,169,171 | 2.00 / 167,169,171 | 2.36 / 167,169,171 | fail |
| bright white balloon | 0.55 | 4.15 / 118,120,123 | 3.76 / 118,120,123 | 4.43 / 118,120,123 | fail |
| bright white balloon | 0.75 | 8.85 / 68,70,75 | 8.02 / 68,70,75 | 9.44 / 68,70,75 | pass |
| high-contrast target | 0.00 | 1.07 / 255,255,255 | 1.18 / 255,255,255 | 1.00 / 255,255,255 | fail |
| high-contrast target | 0.35 | 2.20 / 168,169,171 | 2.00 / 168,169,171 | 2.35 / 168,169,171 | fail |
| high-contrast target | 0.55 | 4.15 / 118,120,123 | 3.76 / 118,120,123 | 4.43 / 118,120,123 | fail |
| high-contrast target | 0.75 | 8.85 / 68,70,75 | 8.02 / 68,70,75 | 9.44 / 68,70,75 | pass |
| dark retro scene | 0.00 | 1.00 / 216,255,255 | 1.00 / 165,251,254 | 1.04 / 232,255,255 | fail |
| dark retro scene | 0.35 | 2.28 / 153,169,171 | 2.07 / 153,169,171 | 2.44 / 153,169,171 | fail |
| dark retro scene | 0.55 | 4.27 / 108,120,123 | 3.87 / 108,120,123 | 4.56 / 108,120,123 | fail |
| dark retro scene | 0.75 | 9.02 / 62,70,75 | 8.17 / 62,70,75 | 9.62 / 62,70,75 | pass |
| bundled classroom | 0.00 | 2.61 / 192,146,103 | 2.36 / 192,146,103 | 2.78 / 192,146,103 | fail |
| bundled classroom | 0.35 | 5.26 / 127,98,72 | 4.76 / 127,98,72 | 5.61 / 127,98,72 | pass |
| bundled classroom | 0.55 | 8.23 / 90,71,55 | 7.46 / 90,71,55 | 8.78 / 90,71,55 | pass |
| bundled classroom | 0.75 | 12.93 / 52,43,40 | 11.71 / 52,43,40 | 13.80 / 52,43,40 | pass |

Lowest opacity passing every text role on every fixture: **0.75**.

Recognisability at 0.75 is pending the user-owned 2 m / projected-1080p judgement. See
`scrim-ladder.png`; the rightmost column is the candidate.
