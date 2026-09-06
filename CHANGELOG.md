# Changelog

## 1.1.0 — 2026-09-06

- Liquid dynamics: blobs merge (volume/momentum/heat conserved) and pinch
  off into two below the target count; the blob count breathes around the
  slider.
- Liquid section in the panel: merge depth, merge speed, split speed
  sliders, plus 5 liquid-mood presets (Classic lava, Syrup, Mercury,
  Zero-G, Eruption) and a Shuffle button.
- Pointer play: the cursor is a warm finger that stirs and heats the wax;
  a click taps the glass. Touch slider (0 disables it).
- Eco mode: simulation pauses when every screen is covered by a fullscreen
  window, and ticks at 10 Hz on battery.
- Correct physics aspect on non-16:9 screens; the panel scrolls instead of
  overflowing on small screens.
- Hover a slider for one second to see a short description of what it
  changes.
- Theme presets now match muted accents: each preset carries a wax
  saturation derived from its theme's accent color (Nord, Kanagawa,
  Everforest and Osaka Jade lamps are calm instead of garish), and a
  "Wax sat" slider controls it manually.
- 13 color presets from stock Omarchy themes + 3 house blends, with a
  "Custom" read-out; independent background hue (top/bottom) and live
  Omarchy accent re-tint (from 1.0.0).

## 1.0.0 — 2026-09-06

- Initial release: real convection physics (CPU) rendered as GPU metaballs,
  live control panel with persistence, bar icon, IPC (`omarchy-shell
  lavalamp set/reset`), matching Omarchy theme.