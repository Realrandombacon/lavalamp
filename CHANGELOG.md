# Changelog

## 1.3.1 — 2026-09-09

- Blob dance: every blob is assigned its own frequency band at spawn and
  sways, jitters and pulses its glow to the energy of that band — bass
  blobs rumble low, high blobs dance to the highs. Splits inherit the
  parent's band (with one child hopping to a neighbor band), merges take
  the quieter band. "Blob dance" slider in the Music section controls
  the amplitude; 0 restores the old calm blobs.

## 1.3.0 — 2026-09-09

- Music reactivity: the lamp dances to whatever plays on the system.
  cava (optional dependency, `pacman -S cava`) taps the PipeWire monitor
  of the default sink and streams 8 smoothed frequency bands; bass is the
  burner's flame (kicks pump heat into the pooled wax and launch blobs on
  transients), loudness pulses the glow halo. Music section in the panel:
  toggle, reactivity slider and a mode dropdown (Full / Glow only /
  Wax only). Without cava the section grays out and the lamp stays
  fully functional.
- "Heart Lava Lamp on the Omarchy marketplace" link at the bottom of the
  panel: opens the plugin's page in the browser so installed users can
  add a heart (the engagement API only accepts the site's origins, so
  the like has to happen on the page itself).

## 1.2.0 — 2026-09-06

- Live/Theme toggle in the panel header: turn the lamp off to fall back to
  whatever background the last real `omarchy theme set` left active,
  without disabling the plugin. Persists like every other setting.

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