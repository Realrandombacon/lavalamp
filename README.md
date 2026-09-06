# Lava Lamp for Omarchy

A complete Omarchy theme built around a live lava lamp. The wallpaper is
not a video loop — it is a **real convection simulation**: wax blobs are
simulated on the CPU (buoyancy, viscosity, heat exchange, surface
tension) and rendered as fluid GPU metaballs. The wax rises, sinks,
merges and tears like actual lamp wax; your cursor is a warm finger that
stirs it; a floating control panel tunes everything live; and the whole
desktop — terminal, editor, window borders, bar — is re-tinted to match
the lamp's molten palette.

![preview](preview.png)

## What's included

| Piece | What it does |
| --- | --- |
| **Live wallpaper** (`Background.qml` + `Physics.js` + GLSL shader) | Full-screen convection simulation rendered as metaballs, on every monitor |
| **Control panel** (`Panel.qml`) | Every knob on a floating card; changes apply live and persist |
| **Bar widget** (`BarWidget.qml`) | Flame icon in the bar's right section — click to open the panel |
| **Omarchy theme** (`colors.toml`, `neovim.lua`, `icons.theme`, `backgrounds/`) | Warm near-black background (`#140802`), molten-orange accent (`#FF7733`), red-orange gradient window borders, matching Neovim colorscheme and icon theme (see the install note) |
| **Physics test suite** (`tests/`) | Headless regression test: minutes of simulated lamp time with invariants |

Install both halves and the desktop reads as one object: the lamp glows
orange, and everything around it agrees.

## The physics

- **Convection** — each blob carries a temperature. The base of the lamp
  heats blobs, the top cools them; hot blobs rise, cool blobs sink.
  Terminal velocity emerges from buoyancy vs. viscous drag, so the lamp
  has an honest pace instead of an animation curve.
- **Liquid dynamics** — slow-moving blobs in contact lose their
  repulsion and **coalesce**: volume (r³), momentum and heat are
  conserved, so the metaball field barely jumps and the eye sees the wax
  flow together. Large fast blobs **pinch off** into two asymmetric
  pieces. The blob count breathes around your target instead of sitting
  frozen.
- **Surface tension** — the merge threshold, merge speed and split speed
  are separate knobs, so the same engine runs from lazy syrup to
  agitated mercury (see *Liquid moods* below).
- **Pointer play** — the cursor is a warm finger: it gently displaces
  the wax and heats what it touches, and warmed blobs rise on their own
  afterwards. A click taps the glass and sends a radial pulse through
  the wax.
- **Determinism** — spawning is seeded; the same settings always
  reproduce the same lamp, which makes the physics testable headless.

## The control panel

Open it from the bar's flame icon (or `SUPER + ALT + L` after binding
it). Everything applies while you drag and is saved on release to
`~/.config/lavalamp/config.json`.

- **Wax shape** — blob count, base size, size spread.
- **Motion** — simulation speed, heater strength (*Physics*), touch
  strength, and an **eco mode** toggle.
- **Liquid** — merge depth, merge speed, split speed, plus five
  **liquid moods**: *Classic lava* (defaults), *Syrup* (lazy, gooey),
  *Mercury* (quick, skittish), *Zero-G* (slow drift), *Eruption* (violent).
  A **Shuffle** button rolls tasteful random physics if you want a
  surprise without losing your colors.
- **Color** — wax hue shift and glow, plus 13 palettes derived from
  stock Omarchy themes (Hackerman, Tokyo Night, Catppuccin, Nord,
  Kanagawa, Everforest, Osaka Jade, Lumon, Retro-82…) and three house
  blends (Toxic, Ocean, Ultraviolet).
- **Background** — independent hue rotation for the top and bottom of
  the gradient behind the wax.
- **Omarchy theme** — live accent re-tint: shifts your accent color and
  Hyprland window borders to match the lamp, without a full theme
  switch.
- Hover any slider for a second to see a short description of what it
  changes.

Headless control (partial patches merge onto the current config):

```
omarchy-shell lavalamp set '{"hue":0.45}'
omarchy-shell lavalamp reset
```

## Eco mode

The simulation is built for battery life: it pauses entirely when a
fullscreen window covers **every** monitor, and drops to 10 Hz when
you're on battery. Watching a movie or playing a game costs you nothing.

## Install

### The plugin (wallpaper, panel, bar widget)

```
omarchy plugin add https://github.com/Realrandombacon/lavalamp --enable
```

The flame icon appears in the bar's right section. Optionally add a
keybinding in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + ALT + L", "Lava lamp panel",
       "omarchy-shell shell toggle io.github.realrandombacon.lavalamp")
```

### The color theme (borders, bar, icons, Neovim)

```
omarchy theme install https://github.com/Realrandombacon/lavalamp
omarchy theme set lavalamp
```

Note: Omarchy ignores `neovim.lua` in themes installed from a git repo
(a deliberate restriction), so the Neovim colorscheme only applies if
you install the theme manually — clone or symlink this repo into
`~/.config/omarchy/themes/lavalamp` instead of using `omarchy theme
install`. Everything else (colors, window borders, icons, background)
works either way.

Back to a stock look any time with `omarchy theme set hackerman` (or
any other theme) — the lamp keeps running.

### Uninstall

```
omarchy plugin remove io.github.realrandombacon.lavalamp
omarchy theme remove lavalamp
```

then re-enable the stock background (`omarchy.background`) in
`~/.config/omarchy/shell.json` and restart the shell.

## How it works

Hybrid CPU/GPU, sized for a wallpaper that may run for days:

- `Physics.js` — pure ES5 simulation (runs in QML and headless under
  node). Normalized [0,1]² domain, y down, aspect-corrected to the real
  screen. Convection, surface tension, coalescence with r³ volume
  conservation, asymmetric pinching, anti-oscillation cooldowns,
  deterministic seeded spawn.
- `lavalamp.frag` — GLSL metaball shader (Σ rᵢ²/dᵢ² field), compiled to
  `.qsb` with `qsb --glsl "100 es,120"` — a 440 fragment variant fails
  to link against Qt's built-in vertex shader.
- `Background.qml` — layer-shell service; one shared simulation stepped
  by a 33 ms timer per root (not per screen), 32 individual vec4
  uniforms (std140 vec4 arrays do not bind through ShaderEffect). Fullscreen
  detection polls `hyprctl` every 5 s; battery state comes from
  Quickshell's UPower module.
- `Panel.qml` — the floating control card, scrollable on small screens.
- `BarWidget.qml` — bar flame icon, toggles the panel.

## Development

```
./deploy.sh              # compile shaders + copy to the live plugin dir + rescan
./deploy.sh --restart    # + omarchy restart shell (needed after .frag edits)
```

Headless physics test (5 minutes of lamp time per liquid mood, asserting
no-NaN, bounds, volume conservation, breathing, pointer behavior):

```
node tests/test-physics.js
```

## License

[MIT](LICENSE)