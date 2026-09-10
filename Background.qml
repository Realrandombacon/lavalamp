import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import QtQuick.Effects
import QtQuick.Shapes
import qs.Commons
import qs.Ui
import "Physics.js" as Physics

Item {
  id: root

  // LAVA LAMP: one shared physics sim for all screens, stepped once per
  // frame at the root so a two-monitor setup doesn't double the speed.
  property var simState: Physics.createState({})
  property var blobData: []
  property real lastFrameTime: 0
  property real simTimeScale: 1.0
  // Lamp appearance knobs (control panel writes these; defaults for now).
  property real lampHue: 0.0
  property real lampGlow: 1.0
  property real lampSat: 1.0
  // Background-only hue rotation, top and bottom edges independent.
  property real lampBgHueTop: 0.0
  property real lampBgHueBottom: 0.0
  // Omarchy theme accent overrides (hue as a -0.5..0.5 fraction of the
  // wheel, saturation multiplier). Applied to the running shell via the
  // same IPC the theme switcher uses, plus a live Hyprland border keyword.
  property real lampAccentHue: 0.0
  property real lampAccentSat: 1.0
  // Master toggle: false shows the real current Omarchy theme background
  // (currentBackground, tracked below) instead of the live simulation.
  property bool lampEnabled: true
  // Music reactivity. cava (tapped on the PipeWire monitor of the default
  // sink) streams one line of space-separated band values per frame; bass
  // drives the heater + beat kicks, level pulses the shader glow. The
  // lamp degrades gracefully when cava is not installed: the toggle in
  // the panel grays out and the lamp stays fully functional.
  property bool musicEnabled: false
  property string musicMode: "full"   // glow | wax | full
  property bool cavaAvailable: false
  property real audioBass: 0          // smoothed low-band energy, 0..1
  property real audioLevel: 0         // smoothed overall loudness, 0..1
  property var audioBands: []         // smoothed per-band energies, 0..1
  property real bassEma: 0            // slow low-band baseline (kick detection)
  property real highEma: 0            // slow mid/high baseline (snare detection)
  property real beatLast: 0           // transient cooldown, seconds
  // Pointer play: last cursor position in shader space + whether the cursor
  // is over a background window. Fed into the sim each tick; the strength
  // easing lives in Physics.substep.
  property real pointerNX: 0.5
  property real pointerNY: 0.5
  property bool pointerActive: false

  // ---- Eco mode. The lamp is slow, so it doesn't need to simulate while
  //      nobody can see it: fully paused when a fullscreen window covers
  //      every screen, and ticked at 10 Hz instead of 30 Hz on battery.
  //      ecoPause (config) gates the whole thing.
  property bool ecoPause: true
  property bool allScreensFullscreen: false
  property bool onBattery: false
  readonly property bool ecoIdle: ecoPause && allScreensFullscreen
  // Music response is sampled by this timer, so a battery slow-down turns
  // every beat into visible lag: when the audio engine is running, keep
  // the full tick rate even on battery.
  readonly property bool ecoSlow: ecoPause && onBattery && !(musicEnabled && cavaAvailable)
  // Physics domain aspect: radii are fractions of screen height and
  // horizontal distances are corrected by w/h, so use the real primary
  // screen shape instead of assuming 16:9 (ultrawide, portrait...).
  readonly property real simAspect: {
    var s = Quickshell.screens && Quickshell.screens.length > 0 ? Quickshell.screens[0] : null
    return s && s.height > 0 ? s.width / s.height : 16 / 9
  }

  // ---- Lamp settings. defaults.json (shipped) < config.json (user). The
  //      control panel patches the object through applyLampConfig, which
  //      clamps and redistributes to the sim and the shader, then persists
  //      on release via saveLampConfig.
  readonly property string configPath: home + "/.config/lavalamp/config.json"
  property var lampConfig: ({ blobCount: 14, blobSize: 0.085, sizeSpread: 0.55,
                              speed: 1.0, heatPower: 1.0, touch: 1.0, hue: 0.0, glow: 1.0,
                              bgHueTop: 0.0, bgHueBottom: 0.0,
                              accentHue: 0.0, accentSat: 1.0,
                              buoyancy: 0.55, drag: 1.6, repulsion: 4.5,
                              musicEnabled: true, musicReactivity: 0.5,
                              musicDance: 0.5, musicMode: "full",
                              lampEnabled: true })

  function applyLampConfig(cfg) {
    var c = cfg || {}
    var next = {
      blobCount: Math.round(Physics.clamp(Number(c.blobCount) || 14, 4, 32)),
      blobSize: Physics.clamp(Number(c.blobSize) || 0.085, 0.03, 0.20),
      sizeSpread: Physics.clamp(Number(c.sizeSpread) || 0.55, 0, 1),
      speed: Physics.clamp(Number(c.speed) || 1.0, 0.1, 3),
      heatPower: Physics.clamp(Number(c.heatPower) || 1.0, 0.1, 2),
      touch: Physics.clamp(c.touch === 0 ? 0 : (Number(c.touch) || 1.0), 0, 2),
      mergeThreshold: Physics.clamp(Number(c.mergeThreshold) || 0.45, 0.1, 0.9),
      mergeSpeed: Physics.clamp(Number(c.mergeSpeed) || 0.35, 0.02, 1.0),
      splitSpeed: Physics.clamp(Number(c.splitSpeed) || 0.16, 0.02, 0.8),
      hue: Physics.clamp(Number(c.hue) || 0.0, -0.5, 0.5),
      glow: Physics.clamp(c.glow === 0 ? 0 : (Number(c.glow) || 1.0), 0, 2),
      sat: Physics.clamp(c.sat === 0 ? 0 : (Number(c.sat) || 1.0), 0, 1.5),
      bgHueTop: Physics.clamp(Number(c.bgHueTop) || 0.0, -0.5, 0.5),
      bgHueBottom: Physics.clamp(Number(c.bgHueBottom) || 0.0, -0.5, 0.5),
      accentHue: Physics.clamp(Number(c.accentHue) || 0.0, -0.5, 0.5),
      accentSat: Physics.clamp(c.accentSat === 0 ? 0 : (Number(c.accentSat) || 1.0), 0, 2),
      // Deep physics knobs: no sliders of their own (the liquid-mood presets
      // and Shuffle set them), but persisted so a shuffled lamp survives a
      // shell restart.
      buoyancy: Physics.clamp(Number(c.buoyancy) || 0.55, 0.05, 1.2),
      drag: Physics.clamp(Number(c.drag) || 1.6, 0.3, 4),
      repulsion: Physics.clamp(Number(c.repulsion) || 4.5, 1, 10),
      ecoPause: c.ecoPause !== false && c.ecoPause !== 0,
      musicEnabled: c.musicEnabled !== false && c.musicEnabled !== 0,
      musicReactivity: Physics.clamp(c.musicReactivity === 0 ? 0 : (Number(c.musicReactivity) || 0.5), 0, 1),
      musicDance: Physics.clamp(c.musicDance === 0 ? 0 : (Number(c.musicDance) || 0.5), 0, 1),
      musicMode: ["glow", "wax", "full"].indexOf(c.musicMode) >= 0 ? c.musicMode : "full",
      lampEnabled: c.lampEnabled !== false && c.lampEnabled !== 0
    }
    var accentChanged = next.accentHue !== lampConfig.accentHue || next.accentSat !== lampConfig.accentSat
    lampConfig = next
    // The band count follows the blob count: one band per blob.
    next.audioBands = next.blobCount
    Physics.applyConfig(simState, next)
    simTimeScale = next.speed
    lampHue = next.hue
    lampGlow = next.glow
    lampSat = next.sat
    lampBgHueTop = next.bgHueTop
    lampBgHueBottom = next.bgHueBottom
    lampEnabled = next.lampEnabled
    musicEnabled = next.musicEnabled
    musicMode = next.musicMode
    syncCavaEngine()
    if (accentChanged) {
      lampAccentHue = next.accentHue
      lampAccentSat = next.accentSat
      applyThemeAccent()
    }
  }

  function saveLampConfig() {
    configFile.setText(JSON.stringify(lampConfig, null, 2) + "\n")
  }

  FileView {
    id: configFile
    path: root.configPath
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: {
      try {
        var cfg = JSON.parse(text())
        if (cfg && typeof cfg === "object") root.applyLampConfig(cfg)
      } catch (e) {
        console.warn("lavalamp config parse failed, using defaults:", e)
      }
    }
  }

  // ---- Omarchy theme accent overrides. The current theme's colors.toml is
  //      the base; accentHue/accentSat re-tint the `accent` key and the
  //      Hyprland border gradient on top of it. The result is pushed into
  //      the running shell via `shell applyTheme` (the same IPC the theme
  //      switcher uses) so every qs.Ui surface re-tints live; the border
  //      needs a separate hyprctl keyword. Only live colors change — the
  //      terminal/vscode template configs are regenerated by a real
  //      `omarchy theme set`, not here.
  readonly property string themeColorsPath: stateHome + "/omarchy/current/theme/colors.toml"
  property string baseThemeColors: ""

  FileView {
    id: themeColorsFile
    path: root.themeColorsPath
    watchChanges: false
    printErrors: false
    onLoaded: {
      root.baseThemeColors = text()
      root.applyThemeAccent()
    }
  }

  // rgb(0..1) -> "#rrggbb". Shared tail of shiftHex.
  function packHex(r, g, b) {
    function c(x) {
      var s = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16)
      return s.length < 2 ? "0" + s : s
    }
    return c(r) + c(g) + c(b)
  }

  // "#rrggbb" -> "#rrggbb" with the hue rotated by hueShift (wheel fraction)
  // and the saturation scaled by satScale.
  function shiftHex(hex, hueShift, satScale) {
    var r = parseInt(hex.substr(0, 2), 16) / 255
    var g = parseInt(hex.substr(2, 2), 16) / 255
    var b = parseInt(hex.substr(4, 2), 16) / 255
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    var h = 0, s = 0, v = max
    if (d > 0) {
      s = d / max
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (max === g) h = ((b - r) / d + 2) / 6
      else h = ((r - g) / d + 4) / 6
    }
    h = (h + hueShift + 1) % 1
    s = Math.max(0, Math.min(1, s * satScale))
    var i = Math.floor(h * 6), f = h * 6 - i
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
    switch (i % 6) {
      case 0: return packHex(v, t, p)
      case 1: return packHex(q, v, p)
      case 2: return packHex(p, v, t)
      case 3: return packHex(p, q, v)
      case 4: return packHex(t, p, v)
      default: return packHex(v, p, q)
    }
  }

  Process {
    id: themeApplyProc
    command: ["true"]
  }

  function applyThemeAccent() {
    if (!root.baseThemeColors) return
    var hue = root.lampAccentHue, sat = root.lampAccentSat
    var lines = root.baseThemeColors.split("\n")
    var out = []
    var borderGrad = ""
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      var m = line.match(/^(\s*accent\s*=\s*")#([0-9A-Fa-f]{6})(")/)
      if (m) {
        out.push(m[1] + "#" + shiftHex(m[2], hue, sat) + m[3])
        continue
      }
      var b = line.match(/^(\s*hyprland_active_border\s*=\s*")(.*)(")/)
      if (b) {
        borderGrad = b[2].replace(/rgba\(([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})\)/g,
          function(all, col, alpha) { return "rgba(" + shiftHex(col, hue, sat) + alpha + ")" })
        out.push(b[1] + borderGrad + b[3])
        continue
      }
      out.push(line)
    }
    var colorsB64 = Qt.btoa(out.join("\n"))
    // This Hyprland fork (Lua config) rejects `hyprctl keyword`; the live
    // equivalent is `hyprctl eval` with hl.config, same shape as the theme's
    // generated hyprland.lua.
    var borderLua = ""
    if (borderGrad) {
      var rgbaParts = borderGrad.match(/rgba\([0-9A-Fa-f]{8}\)/g) || []
      var angleMatch = borderGrad.match(/(-?\d+(?:\.\d+)?)\s*deg/)
      var luaColors = []
      for (var p = 0; p < rgbaParts.length; p++) luaColors.push('"' + rgbaParts[p] + '"')
      var gradTable = '{ colors = { ' + luaColors.join(", ") + ' }, angle = ' + (angleMatch ? angleMatch[1] : "45") + ' }'
      borderLua = "; hyprctl eval 'hl.config({ general = { col = { active_border = " + gradTable +
                  " } }, group = { col = { border_active = " + gradTable + " } } })' >/dev/null 2>&1"
    }
    themeApplyProc.command = ["bash", "-c",
      "omarchy-shell shell applyTheme '" + colorsB64 + "' '' >/dev/null 2>&1" + borderLua]
    themeApplyProc.running = true
  }

  // The config dir may not exist on first run; FileView would then refuse
  // to write. Create it before anything tries to save.
  Process {
    id: configDirProc
    command: ["mkdir", "-p", Quickshell.env("HOME") + "/.config/lavalamp"]
  }

  IpcHandler {
    target: "lavalamp"

    // Headless/test path for live config changes:
    //   omarchy-shell lavalamp set '{"hue":0.45}'
    // Partial patches merge onto the current config, so untouched keys keep
    // their values.
    function set(json: string): void {
      var patch = JSON.parse(json)
      var merged = {}
      for (var k in root.lampConfig) merged[k] = root.lampConfig[k]
      for (k in patch) merged[k] = patch[k]
      root.applyLampConfig(merged)
      root.saveLampConfig()
    }

    function reset(): void {
      root.applyLampConfig({})
      root.saveLampConfig()
    }
  }

  function pointerMove(nx, ny) {
    pointerNX = nx
    pointerNY = ny
    pointerActive = true
  }

  function pointerLeave() {
    pointerActive = false
  }

  function pokeAt(nx, ny, aspect) {
    Physics.poke(simState, nx, ny, aspect)
  }

  // Eco polling: hyprctl tells us which workspaces are fullscreen; the lamp
  // only idles when EVERY real monitor's active workspace is fullscreen
  // (a fullscreen window on one screen alone leaves the others animating).
  // Parse failures (hyprctl missing, headless) just mean "keep animating".
  function updateEco(raw) {
    try {
      var parts = String(raw).split("\n---\n")
      if (parts.length < 2) return
      var monitors = JSON.parse(parts[0])
      var workspaces = JSON.parse(parts[1])
      if (!monitors.length) return
      var fullscreenByMonitor = {}
      for (var i = 0; i < workspaces.length; i++)
        if (workspaces[i].hasfullscreen) fullscreenByMonitor[workspaces[i].monitor] = true
      var all = true
      for (i = 0; i < monitors.length; i++)
        if (!fullscreenByMonitor[monitors[i].name]) { all = false; break }
      allScreensFullscreen = all
    } catch (e) {
      allScreensFullscreen = false
    }
  }

  function blobVec(i) {
    var d = blobData
    return Qt.vector4d(d[i*4], d[i*4+1], d[i*4+2], d[i*4+3])
  }

  function refreshBlobUniforms() {
    blobData = Physics.packUniforms(simState)
  }

  // A Timer, not a FrameAnimation: the service root lives outside any
  // window, so it has no render loop to drive a FrameAnimation. The GPU
  // re-renders whenever blobUniforms changes. Eco: paused under fullscreen
  // everywhere, 10 Hz on battery.
  Timer {
    interval: root.ecoSlow ? 99 : 33
    running: !root.ecoIdle
    repeat: true
    onTriggered: {
      var now = Date.now() / 1000
      var dt = root.lastFrameTime > 0 ? Math.min(now - root.lastFrameTime, 1 / 10) : 1 / 30
      root.lastFrameTime = now
      Physics.setAudio(root.simState,
                       root.musicMode !== "glow" ? root.audioBass : 0,
                       root.audioLevel,
                       root.musicMode !== "glow" ? root.audioBands : [])
      Physics.setPointer(root.simState, root.pointerNX, root.pointerNY, root.pointerActive)
      Physics.step(root.simState, dt * root.simTimeScale, root.simAspect)
      root.refreshBlobUniforms()
    }
  }

  Timer {
    id: ecoPoll
    interval: 5000
    running: root.ecoPause
    repeat: true
    onTriggered: ecoProc.running = true
  }

  Process {
    id: ecoProc
    command: ["bash", "-c", "hyprctl -j monitors 2>/dev/null; echo; echo ---; hyprctl -j workspaces 2>/dev/null"]
    stdout: StdioCollector {
      onStreamFinished: root.updateEco(text)
    }
  }
  // ---- Music reactivity engine. One cava process, started lazily and
  //      only when the feature is on and the binary exists; its stdout is
  //      parsed per line (raw + ascii output mode). The conf is generated
  //      at runtime so the band count follows the blob count; it lives in
  //      the state dir, NOT the plugin dir (a write there would trigger
  //      the plugin hot-reload storm).
  readonly property string cavaConfPath: home + "/.config/lavalamp/cava.conf"
  property int cavaBarsCurrent: -1      // bars value currently in the conf file

  function cavaConfTemplate(bars) {
    return "[general]\nbars = " + bars + "\nframerate = 30\nautosens = 0\n"
         + "[input]\nmethod = pipewire\n"
         + "[smoothing]\nnoise_reduction = 50\nmonstercat = 1.5\n"
         + "[output]\nmethod = raw\ndata_format = ascii\nascii_max_range = 100\n"
         + "bar_delimiter = 32\nframe_delimiter = 10\n"
  }

  // Write the conf for the current blob count, then (re)start cava once
  // the async write has landed.
  function syncCavaEngine() {
    var bars = lampConfig.blobCount
    if (cavaBarsCurrent !== bars) {
      cavaBarsCurrent = bars
      cavaConfFile.setText(cavaConfTemplate(bars))
      if (cavaProc.running) cavaProc.running = false
      cavaReconfTimer.restart()
      return
    }
    updateAudioEngine()
  }

  Timer {
    id: cavaReconfTimer
    interval: 400
    onTriggered: root.updateAudioEngine()
  }

  FileView {
    id: cavaConfFile
    path: root.cavaConfPath
    watchChanges: false
    atomicWrites: true
    printErrors: false
  }

  function updateAudioEngine() {
    var want = musicEnabled && cavaAvailable && lampEnabled
    if (want && !cavaProc.running) {
      resetAudio()
      cavaProc.running = true
    } else if (!want && cavaProc.running) {
      // Turning music off must leave zero audio state behind, or the
      // physics keeps running on the last heard frame forever.
      cavaProc.running = false
      resetAudio()
    }
  }

  function resetAudio() {
    audioBass = 0
    audioLevel = 0
    bassEma = 0
    highEma = 0
    audioBands = []
  }

  // One cava frame: "<v0> <v1> ... <v7>" with values 0..100, low bands
  // first. Smoothed fast-attack / slow-release so hits read while silence
  // decays gently; a bass jump above its own slow average is a beat.
  function parseAudio(line) {
    var parts = String(line).trim().split(/\s+/)
    if (parts.length < 3) return
    var bass = 0, level = 0, n = parts.length
    var raw = []
    for (var i = 0; i < n; i++) {
      var v = Number(parts[i])
      if (!isFinite(v)) v = 0
      raw.push(v / 100)
      if (i < 3) bass += v
      level += v
    }
    bass = bass / 300
    level = level / (n * 100)
    audioLevel = level > audioLevel ? level : audioLevel * 0.90 + level * 0.10
    var bands = []
    for (i = 0; i < raw.length; i++) {
      var prev = audioBands[i] !== undefined ? audioBands[i] : 0
      bands.push(raw[i] > prev ? raw[i] : prev * 0.85 + raw[i] * 0.15)
    }
    audioBands = bands
    // Transient routing: the kick detector listens to the lowest band only
    // (a snare's body bleeds into band 1-2, its noise into the highs), the
    // snare detector to the mid/high energy. Each fires its own beatKick
    // band range, so the bass blobs glow on kicks, the small ones on snares.
    // Fast EMAs + a modest threshold: with a slow baseline every second
    // snare gets absorbed into it and skipped.
    var low = raw[0] || 0
    var high = 0
    for (i = 2; i < raw.length; i++) high += raw[i]
    high = raw.length > 2 ? high / (raw.length - 2) : 0
    audioBass = low > audioBass ? low : audioBass * 0.82 + low * 0.18
    bassEma = bassEma * 0.98 + low * 0.02
    highEma = highEma * 0.97 + high * 0.03
    var now = Date.now() / 1000
    if (low > bassEma + 0.12 && low > 0.15 && now - beatLast > 0.05) {
      beatLast = now
      if (musicMode !== "glow")
        Physics.beatKick(simState, 0.22 * (0.5 + low), 0, 1)
    } else if (high > highEma + 0.09 && high > 0.2 && now - beatLast > 0.05) {
      beatLast = now
      if (musicMode !== "glow")
        Physics.beatKick(simState, 0.18 * (0.5 + high), 2, 7)
    }
  }

  Process {
    id: cavaDetectProc
    command: ["which", "cava"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.cavaAvailable = String(text).trim() !== ""
        root.syncCavaEngine()
      }
    }
  }

  Process {
    id: cavaProc
    command: ["cava", "-p", root.cavaConfPath]
    stdout: SplitParser {
      onRead: function(line) { root.parseAudio(line) }
    }
    // A dead cava must not silently freeze the feature: restart it once
    // after a pause. updateAudioEngine is a no-op when it exited because
    // the user turned the feature off.
    onExited: {
      if (root.musicEnabled && root.cavaAvailable && root.lampEnabled)
        cavaRestartTimer.restart()
    }
  }

  Timer {
    id: cavaRestartTimer
    interval: 2000
    repeat: false
    onTriggered: root.updateAudioEngine()
  }

  Component.onCompleted: {
    configDirProc.running = true
    root.refreshBlobUniforms()
    refreshBackground()
    cavaDetectProc.running = true
  }

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateHome: home + "/.local/state"
  readonly property string currentBackgroundLink: stateHome + "/omarchy/current/background"

  property string currentBackground: ""
  property string displayedBackground: ""
  property string incomingBackground: ""
  property string oldBackground: ""
  property bool finishingTransition: false
  property int backgroundVersion: 0
  property int revealStartedVersion: -1
  property int pendingThemeVersion: -1
  property string pendingColorsRaw: ""
  property string pendingShellRaw: ""
  property real revealProgress: 1

  function imageUrl(path) {
    return Util.fileUrl(path)
  }

  function refreshBackground() {
    if (!readlinkProc.running) readlinkProc.running = true
  }

  function setBackground(path, instant) {
    transitionBackground("", path, path, instant, false)
  }

  function transitionBackground(fromPath, path, finalPath, instant, force) {
    path = String(path || "").trim()
    finalPath = String(finalPath || path).trim()
    fromPath = String(fromPath || "").trim()
    if (!path || (!force && finalPath === currentBackground)) return
    currentBackground = finalPath
    backgroundVersion += 1
    revealStartedVersion = -1

    revealAnimation.stop()
    finishingTransition = false

    if (instant || !displayedBackground) {
      oldBackground = ""
      incomingBackground = ""
      displayedBackground = path
      revealProgress = 1
      return
    }

    oldBackground = fromPath || displayedBackground
    incomingBackground = path
    revealProgress = 0
  }

  function setPendingTheme(colorsB64, shellB64) {
    pendingColorsRaw = Util.decodeBase64(colorsB64)
    pendingShellRaw = Util.decodeBase64(shellB64)
    pendingThemeVersion = backgroundVersion
    pendingThemeFallbackTimer.restart()
  }

  function applyPendingTheme() {
    // Background polling can advance backgroundVersion while a theme switch is
    // pending; the latest theme payload should still apply.
    if (pendingThemeVersion < 0) return
    pendingThemeFallbackTimer.stop()
    Color.loadColors(pendingColorsRaw)
    // Color.loadShell also refreshes Style so the type scale flips with the
    // background reveal instead of waiting for a separate reload path.
    Color.loadShell(pendingShellRaw)
    Style.scheduleRefresh()
    pendingThemeVersion = -1
    pendingColorsRaw = ""
    pendingShellRaw = ""
  }

  function transitionBackgroundWithTheme(fromPath, path, finalPath, colorsB64, shellB64) {
    transitionBackground(fromPath, path, finalPath, false, true)
    setPendingTheme(colorsB64, shellB64)
    if (!incomingBackground || revealProgress >= 1) applyPendingTheme()
  }

  function startReveal(panel) {
    if (!incomingBackground) return
    panel.maskReady = true
    if (revealStartedVersion === backgroundVersion) return
    revealStartedVersion = backgroundVersion
    applyPendingTheme()
    revealAnimation.restart()
  }

  function openSelector() {
    if (!bgSwitchProc.running) bgSwitchProc.running = true
  }

  function openThemeSwitcher() {
    if (!themeSwitchProc.running) themeSwitchProc.running = true
  }

  Process {
    id: bgSwitchProc
    command: ["bash", "-c", "background=$(omarchy-theme-bg-switcher); [[ -n $background ]] && omarchy-theme-bg-set \"$background\""]
    onExited: root.refreshBackground()
  }

  Process {
    id: themeSwitchProc
    command: ["bash", "-c", "theme=$(omarchy-theme-switcher); [[ -n $theme ]] && omarchy-theme-set \"$theme\" >/dev/null 2>&1 &"]
    onExited: root.refreshBackground()
  }

  Process {
    id: readlinkProc
    command: ["readlink", "-f", root.currentBackgroundLink]
    stdout: StdioCollector {
      onStreamFinished: root.setBackground(String(text || "").trim(), false)
    }
  }

  IpcHandler {
    target: "background"

    function refresh(): void {
      root.refreshBackground()
    }

    function set(path: string): void {
      root.setBackground(path, false)
    }

    function setInstant(path: string): void {
      root.setBackground(path, true)
    }

    function transition(fromPath: string, path: string): void {
      root.transitionBackground(fromPath, path, path, false, false)
    }

    function themeTransition(fromPath: string, path: string, finalPath: string, colorsB64: string, shellB64: string): void {
      root.transitionBackgroundWithTheme(fromPath, path, finalPath, colorsB64, shellB64)
    }
  }

  Timer {
    id: pendingThemeFallbackTimer
    interval: 300
    repeat: false
    onTriggered: root.applyPendingTheme()
  }

  NumberAnimation {
    id: revealAnimation
    target: root
    property: "revealProgress"
    from: 0
    to: 1
    duration: 420
    easing.type: Easing.InOutCubic
    onFinished: {
      // No base Image anymore (ShaderEffect renders the live background):
      // clear transition state directly instead of waiting for image status.
      if (root.incomingBackground) {
        root.displayedBackground = root.currentBackground || root.incomingBackground
        root.incomingBackground = ""
        root.oldBackground = ""
        root.finishingTransition = false
      }
      root.revealProgress = 1
    }
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: panel
      required property var modelData

      screen: modelData
      visible: !remapGuard.remapping
      anchors { top: true; bottom: true; left: true; right: true }

      ScreenMoveRemap {
        id: remapGuard
        window: panel
      }
      color: "transparent"
      // Keep render updates enabled. The background layer has been observed to
      // lose its committed buffer while parked with updatesEnabled=false,
      // leaving a black desktop until omarchy-shell is restarted. The wallpaper
      // itself is static, so this favors correctness over a small render-loop
      // optimization.
      updatesEnabled: true

      property bool maskReady: false

      function maybeStartReveal() {
        if (!root.incomingBackground || root.revealProgress !== 0 || maskReady) return
        if (incomingFrame.status !== Image.Ready) return
        Qt.callLater(function() {
          if (!root.incomingBackground || root.revealProgress !== 0 || maskReady) return
          if (incomingFrame.status !== Image.Ready) return
          root.startReveal(panel)
        })
      }

      WlrLayershell.namespace: "omarchy-background"
      WlrLayershell.layer: WlrLayer.Background
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      exclusionMode: ExclusionMode.Ignore

      // Real Omarchy theme background, shown when the lamp is toggled off
      // (enabledToggle in Panel.qml). Sits under the shader; currentBackground
      // is the same path the stock omarchy.background service tracks, kept
      // fresh by refreshBackground()/the IPC handlers above, so this always
      // matches whatever the last real `omarchy theme set` left active.
      Image {
        id: themeBase
        anchors.fill: parent
        source: root.imageUrl(root.currentBackground)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: false
        smooth: true
        mipmap: true
        visible: !root.lampEnabled
      }

      // LAVA LAMP: live metaball rendering fed by the shared Physics.js sim.
      // Property names match the uniform block members in lavalamp.frag.
      // Transition/selector machinery below stays intact but is inert while
      // incomingBackground stays empty.
      ShaderEffect {
        id: lavaBase
        anchors.fill: parent
        visible: root.lampEnabled
        property real uAspect: width / Math.max(height, 1)
        property real uHue: root.lampHue
        property real uGlow: root.lampGlow
        property real uSat: root.lampSat
        property real uBgHueTop: root.lampBgHueTop
        property real uBgHueBottom: root.lampBgHueBottom
        property real uPulse: root.musicMode !== "wax"
                              ? root.audioLevel * root.lampConfig.musicReactivity : 0
        property vector4d blob0: root.blobVec(0)
        property vector4d blob1: root.blobVec(1)
        property vector4d blob2: root.blobVec(2)
        property vector4d blob3: root.blobVec(3)
        property vector4d blob4: root.blobVec(4)
        property vector4d blob5: root.blobVec(5)
        property vector4d blob6: root.blobVec(6)
        property vector4d blob7: root.blobVec(7)
        property vector4d blob8: root.blobVec(8)
        property vector4d blob9: root.blobVec(9)
        property vector4d blob10: root.blobVec(10)
        property vector4d blob11: root.blobVec(11)
        property vector4d blob12: root.blobVec(12)
        property vector4d blob13: root.blobVec(13)
        property vector4d blob14: root.blobVec(14)
        property vector4d blob15: root.blobVec(15)
        property vector4d blob16: root.blobVec(16)
        property vector4d blob17: root.blobVec(17)
        property vector4d blob18: root.blobVec(18)
        property vector4d blob19: root.blobVec(19)
        property vector4d blob20: root.blobVec(20)
        property vector4d blob21: root.blobVec(21)
        property vector4d blob22: root.blobVec(22)
        property vector4d blob23: root.blobVec(23)
        property vector4d blob24: root.blobVec(24)
        property vector4d blob25: root.blobVec(25)
        property vector4d blob26: root.blobVec(26)
        property vector4d blob27: root.blobVec(27)
        property vector4d blob28: root.blobVec(28)
        property vector4d blob29: root.blobVec(29)
        property vector4d blob30: root.blobVec(30)
        property vector4d blob31: root.blobVec(31)
        fragmentShader: "lavalamp.frag.qsb"
      }

      Image {
        id: oldFrame
        anchors.fill: parent
        source: root.imageUrl(root.oldBackground)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: false
        smooth: true
        mipmap: true
        visible: root.oldBackground !== "" && root.revealProgress < 1
        onStatusChanged: panel.maybeStartReveal()
      }

      Item {
        id: incomingLayer
        anchors.fill: parent
        visible: root.incomingBackground !== "" && incomingFrame.status === Image.Ready && (root.revealProgress >= 1 || panel.maskReady)
        layer.enabled: root.incomingBackground !== "" && root.revealProgress < 1
        layer.smooth: true
        layer.effect: MultiEffect {
          maskEnabled: true
          maskSource: revealMask
          maskThresholdMin: 0.5
          maskSpreadAtMin: 0.02
        }

        Image {
          id: incomingFrame
          anchors.fill: parent
          source: root.imageUrl(root.incomingBackground)
          fillMode: Image.PreserveAspectCrop
          asynchronous: true
          cache: false
          smooth: true
          mipmap: true
          onStatusChanged: panel.maybeStartReveal()
        }
      }

      Item {
        id: revealMask
        anchors.fill: parent
        visible: false
        layer.enabled: true

        readonly property real slant: -0.18
        readonly property real centerTop: width / 2 - slant * height / 2
        readonly property real centerBottom: width / 2 + slant * height / 2
        readonly property real reach: width / 2 + Math.abs(slant) * height / 2 + 4
        readonly property real spread: reach * root.revealProgress

        Shape {
          anchors.fill: parent
          antialiasing: true
          preferredRendererType: Shape.CurveRenderer
          ShapePath {
            fillColor: "white"
            strokeColor: "transparent"
            startX: revealMask.centerTop - revealMask.spread; startY: 0
            PathLine { x: revealMask.centerTop + revealMask.spread; y: 0 }
            PathLine { x: revealMask.centerBottom + revealMask.spread; y: revealMask.height }
            PathLine { x: revealMask.centerBottom - revealMask.spread; y: revealMask.height }
            PathLine { x: revealMask.centerTop - revealMask.spread; y: 0 }
          }
        }
      }

      Connections {
        target: root
        function onIncomingBackgroundChanged() {
          panel.maskReady = false
          panel.maybeStartReveal()
        }
      }

      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        hoverEnabled: true
        onPositionChanged: function(mouse) {
          root.pointerMove(mouse.x / width, mouse.y / height)
        }
        onContainsMouseChanged: if (!containsMouse) root.pointerLeave()
        // A click taps the glass; a double click still opens the selector.
        onPressed: function(mouse) { root.pokeAt(mouse.x / width, mouse.y / height, width / Math.max(height, 1)) }
        onDoubleClicked: function(mouse) {
          if (mouse.button === Qt.RightButton) root.openThemeSwitcher()
          else root.openSelector()
          mouse.accepted = true
        }
      }
    }
  }
}
