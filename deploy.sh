#!/bin/bash
# Deploy the lava lamp plugin sources to the live Omarchy plugin dir.
# Dev-only helper (users install with `omarchy plugin add <git-url>`):
# copies the plugin files (not symlinks, so the shell's inotify watcher
# reliably picks changes up), compiles shaders with qsb, forces a rescan.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.config/omarchy/plugins/io.github.realrandombacon.lavalamp"
QSB=/usr/lib/qt6/bin/qsb

# Exactly the files a plugin install ships; everything else (tests, theme,
# docs, .git) stays in the dev checkout.
FILES=(manifest.json Background.qml Panel.qml Physics.js BarWidget.qml
       defaults.json lavalamp.frag lavalamp.frag.qsb lavalamp-cava.conf
       preview.png)

mkdir -p "$DEST"

# Compile GLSL -> .qsb (Qt6 RHI shader pack) if the source changed
out="$HERE/lavalamp.frag.qsb"
if [[ ! -f $out || $HERE/lavalamp.frag -nt $out ]]; then
  # GLSL variants must stay "100 es,120": a 440 fragment variant fails to
  # link against Qt's built-in default vertex shader (no matching output).
  "$QSB" --glsl "100 es,120" -o "$out" "$HERE/lavalamp.frag"
  echo "compiled: lavalamp.frag"
fi

for f in "${FILES[@]}"; do
  cp -f "$HERE/$f" "$DEST/"
done
rm -f "$DEST/pulse.frag" "$DEST/pulse.frag.qsb"   # removed in 1.1.0
omarchy-shell -q shell rescanPlugins || true
# NOTE: inotify hot-reload is unreliable for shader (.qsb) changes — the shell
# keeps serving the old binary. Pass --restart after editing a .frag file.
if [[ "${1:-}" == "--restart" ]]; then
  omarchy restart shell
  echo "shell restarted"
fi
echo "deployed -> $DEST"