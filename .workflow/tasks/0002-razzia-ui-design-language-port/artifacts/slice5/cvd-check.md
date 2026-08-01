# Slice 5 answer-identity simulation

Source: `answers-dark.png`, captured from the live stage after the answer-role conversion.

The source image was transformed with fixed 3×3 RGB matrices for protanopia, deuteranopia, and
tritanopia simulation. The resulting images are `answers-protanopia.png`,
`answers-deuteranopia.png`, and `answers-tritanopia.png`; `answers-cvd-sheet.png` places the source
and all three simulations in one comparison.

Result: pass. Some accent hues converge under the simulations, but every answer remains identifiable
through the visible monospace A/B/C/D badge independently of hue. Border and tint remain secondary
channels; correctness icons are state feedback and are not relied on for answer identity.
