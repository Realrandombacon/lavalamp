import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui

// Lava lamp control panel: a floating card over the desktop with every lamp
// knob on it. Writes go straight into the background service (injected as
// `service` by the shell, since this plugin pairs a panel with a service
// entry) so the lamp changes on the drag itself, and persist on release.
Item {
  id: root

  // Injected by the shell's panel loader.
  property var shell: null
  property var manifest: null
  property var service: null

  property bool opened: false

  function open(payloadJson) {
    opened = true
    refreshPresetDropdown()
    refreshLiquidDropdown()
  }

  function close() {
    opened = false
  }

  function dismiss() {
    // User-initiated closes route through shell.hide so the host's
    // open-panel state stays consistent; close() is the fallback.
    if (shell && typeof shell.hide === "function")
      shell.hide((manifest && manifest.id) || "baco.background")
    else
      close()
  }

  // ---- Config plumbing. lampConfig is the single source of truth; the
  //      panel never keeps its own copy of a value, it only ever patches
  //      the service's object and lets applyLampConfig redistribute.
  function apply(patch) {
    if (!service || !service.lampConfig) return
    var next = {}
    for (var k in service.lampConfig) next[k] = service.lampConfig[k]
    for (k in patch) next[k] = patch[k]
    service.applyLampConfig(next)
    refreshPresetDropdown()
    refreshLiquidDropdown()
  }

  // The dropdown's read-out is driven imperatively rather than by a
  // binding: Dropdown overwrites its own `value` on selection, which would
  // permanently break a binding, and a call-binding on a var property
  // chain is fragile. Refresh it on open and after every patch instead.
  // Hand-tuned values match no preset: show "Custom" rather than an
  // empty trigger ("Custom" is display-only, it's not in the popup list —
  // Dropdown echoes an unmatched value verbatim).
  function refreshPresetDropdown() {
    if (!presetDropdown) return
    var p = currentPreset()
    presetDropdown.value = p !== "" ? p : "Custom"
  }

  // Liquid mood presets: a bundle of physics-character keys (the wax's
  // personality). Deliberately leaves speed, blobCount/blobSize and every
  // color knob alone — the user's pace and palette stay untouched. Classic
  // matches Physics.DEFAULTS exactly.
  readonly property var liquidPresets: ({
    classic: { mergeThreshold: 0.45, mergeSpeed: 0.35, splitSpeed: 0.16, heatPower: 1.0, buoyancy: 0.55, drag: 1.6, repulsion: 4.5 },
    syrup: { mergeThreshold: 0.62, mergeSpeed: 0.55, splitSpeed: 0.045, heatPower: 0.85, buoyancy: 0.42, drag: 2.6, repulsion: 3.4 },
    mercury: { mergeThreshold: 0.22, mergeSpeed: 0.12, splitSpeed: 0.24, heatPower: 1.15, buoyancy: 0.72, drag: 0.9, repulsion: 8.0 },
    zerog: { mergeThreshold: 0.45, mergeSpeed: 0.35, splitSpeed: 0.04, heatPower: 0.7, buoyancy: 0.15, drag: 0.6, repulsion: 3.0 },
    eruption: { mergeThreshold: 0.5, mergeSpeed: 0.55, splitSpeed: 0.34, heatPower: 1.7, buoyancy: 0.85, drag: 1.2, repulsion: 5.0 }
  })

  readonly property var liquidOptions: [
    { label: "Classic lava", value: "classic" },
    { label: "Syrup", value: "syrup" },
    { label: "Mercury", value: "mercury" },
    { label: "Zero-G", value: "zerog" },
    { label: "Eruption", value: "eruption" }
  ]

  function currentLiquidPreset() {
    for (var i = 0; i < liquidOptions.length; i++) {
      var p = liquidPresets[liquidOptions[i].value]
      var match = true
      for (var k in p) {
        if (Math.abs(p[k] - current(k, -1)) > 0.005) { match = false; break }
      }
      if (match) return liquidOptions[i].value
    }
    return ""
  }

  function refreshLiquidDropdown() {
    if (!liquidDropdown) return
    var p = currentLiquidPreset()
    liquidDropdown.value = p !== "" ? p : "Custom"
  }

  function save() {
    if (service) service.saveLampConfig()
  }

  function current(key, fallback) {
    return service && service.lampConfig && service.lampConfig[key] !== undefined
      ? service.lampConfig[key] : fallback
  }

  // Hue-shift presets. The wax palette is orange (hue ~0.07) and the
  // background sits near hue ~0.03; each shift is (target - reference)
  // wrapped to +/-0.5. The slider range caps at +/-0.5, so a shift beyond
  // that is expressed as its equivalent negative.
  //
  // The theme-inspired presets are computed from each stock Omarchy
  // theme's colors.toml (accent -> wax shift, background -> bg shift), so
  // the lamp evokes the native palette. Note the bg shifts for blue/indigo
  // themes are negative — the wax/base are already red-orange, so reaching
  // blue goes the short way around. Neutral-background themes (gruvbox,
  // matte-black...) and light themes (white can't be reached by hue
  // rotation) are excluded. Toxic / Ocean / Ultraviolet are house blends.
  readonly property var presets: ({
    classic: { hue: 0.0, glow: 1.0, bgHueTop: 0.0, bgHueBottom: 0.0 },
    hackerman: { hue: 0.30, glow: 1.0, bgHueTop: -0.38, bgHueBottom: -0.38 },
    "tokyo-night": { hue: -0.46, glow: 1.0, bgHueTop: -0.38, bgHueBottom: -0.38 },
    catppuccin: { hue: -0.47, glow: 1.0, bgHueTop: -0.36, bgHueBottom: -0.36 },
    nord: { hue: -0.49, glow: 1.0, bgHueTop: -0.42, bgHueBottom: -0.42 },
    kanagawa: { hue: 0.07, glow: 1.0, bgHueTop: -0.36, bgHueBottom: -0.36 },
    everforest: { hue: 0.41, glow: 1.0, bgHueTop: -0.46, bgHueBottom: -0.46 },
    "osaka-jade": { hue: 0.35, glow: 1.0, bgHueTop: 0.41, bgHueBottom: 0.41 },
    lumon: { hue: 0.49, glow: 1.0, bgHueTop: -0.46, bgHueBottom: -0.46 },
    "retro-82": { hue: 0.0, glow: 1.0, bgHueTop: -0.44, bgHueBottom: -0.44 },
    toxic: { hue: 0.30, glow: 1.2, bgHueTop: 0.30, bgHueBottom: 0.30 },
    ocean: { hue: 0.45, glow: 1.0, bgHueTop: -0.42, bgHueBottom: -0.42 },
    ultraviolet: { hue: -0.35, glow: 1.4, bgHueTop: -0.28, bgHueBottom: -0.28 }
  })

  readonly property var presetOptions: [
    { label: "Classic Lava", value: "classic" },
    { label: "Hackerman", value: "hackerman" },
    { label: "Tokyo Night", value: "tokyo-night" },
    { label: "Catppuccin", value: "catppuccin" },
    { label: "Nord", value: "nord" },
    { label: "Kanagawa", value: "kanagawa" },
    { label: "Everforest", value: "everforest" },
    { label: "Osaka Jade", value: "osaka-jade" },
    { label: "Lumon", value: "lumon" },
    { label: "Retro-82", value: "retro-82" },
    { label: "Toxic", value: "toxic" },
    { label: "Ocean", value: "ocean" },
    { label: "Ultraviolet", value: "ultraviolet" }
  ]

  // Closest preset name for the dropdown read-out, or "" when no preset
  // matches every one of its values (any custom slider drag).
  function currentPreset() {
    for (var i = 0; i < presetOptions.length; i++) {
      var p = presets[presetOptions[i].value]
      var match = true
      for (var k in p) {
        if (Math.abs(p[k] - current(k, 0)) > 0.005) { match = false; break }
      }
      if (match) return presetOptions[i].value
    }
    return ""
  }

  // One labeled slider row: fixed-width label on the left, live detail
  // read-out on the right, the slider filling the middle.
  component PanelRow: Item {
    id: row

    property string label: ""
    property string detail: ""
    property real minimum: 0
    property real maximum: 1
    property real step: 0.05
    property bool integer: false
    property real value: 0

    signal moved(real v)
    signal released()

    implicitHeight: Math.max(labelText.implicitHeight, slider.implicitHeight)

    Text {
      id: labelText
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(92)
      text: row.label
      color: Color.popups.text
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
      font.letterSpacing: 0.5
      elide: Text.ElideRight
    }

    PanelSlider {
      id: slider
      anchors.left: labelText.right
      anchors.leftMargin: Style.space(12)
      anchors.right: detailText.left
      anchors.rightMargin: Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      minimum: row.minimum
      maximum: row.maximum
      step: row.step
      integer: row.integer
      value: row.value
      onMoved: function(v) { row.moved(v) }
      onReleased: function(v) { row.released() }
    }

    Text {
      id: detailText
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(44)
      horizontalAlignment: Text.AlignRight
      text: row.detail
      color: Qt.darker(Color.popups.text, 1.35)
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
  }

  PanelWindow {
    id: win
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "lavalamp-panel"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
    exclusionMode: ExclusionMode.Ignore

    // Click anywhere outside the card to dismiss.
    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.ArrowCursor
      onClicked: root.dismiss()
    }

    Shortcut {
      sequence: "Escape"
      onActivated: root.dismiss()
    }

    Rectangle {
      id: card
      anchors.top: parent.top
      anchors.right: parent.right
      anchors.topMargin: Style.space(52)   // clear of the bar
      anchors.rightMargin: Style.space(12)
      width: Style.space(360)
      // Never taller than the screen: taller content scrolls inside.
      height: Math.min(contentCol.implicitHeight + Style.space(44),
                       parent.height - Style.space(72))
      radius: Style.cornerRadius
      color: Color.popups.background
      border.width: Style.normalBorderWidth
      border.color: Color.popups.border

      // Swallow clicks on the card itself so they don't reach the scrim.
      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        clip: true
        contentWidth: width
        contentHeight: contentCol.implicitHeight + Style.space(44)
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: contentCol
          x: Style.space(22)
          y: Style.space(22)
          width: card.width - Style.space(44)
          spacing: Style.space(14)

        Item {
          width: parent.width
          height: titleText.implicitHeight

          Text {
            id: titleText
            text: "Lava Lamp"
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.subtitle
            font.bold: true
          }

          Text {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: "✕"
            color: closeMouse.containsMouse ? Color.accent : Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.body

            MouseArea {
              id: closeMouse
              anchors.fill: parent
              anchors.margins: -Style.space(8)
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.dismiss()
            }
          }
        }

        // ---- Wax shape
        Column {
          width: parent.width
          spacing: Style.space(10)

          PanelRow {
            width: parent.width
            label: "Blobs"
            detail: Math.round(root.current("blobCount", 14)) + ""
            minimum: 4; maximum: 32; step: 1; integer: true
            value: root.current("blobCount", 14)
            onMoved: function(v) { root.apply({ blobCount: Math.round(v) }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Blob size"
            detail: Math.round(root.current("blobSize", 0.085) * 1000) / 10 + " %"
            minimum: 0.03; maximum: 0.20; step: 0.005
            value: root.current("blobSize", 0.085)
            onMoved: function(v) { root.apply({ blobSize: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Size spread"
            detail: Math.round(root.current("sizeSpread", 0.55) * 100) + " %"
            minimum: 0; maximum: 1; step: 0.05
            value: root.current("sizeSpread", 0.55)
            onMoved: function(v) { root.apply({ sizeSpread: v }) }
            onReleased: root.save()
          }
        }

        PanelSeparator {}

        // ---- Motion
        Column {
          width: parent.width
          spacing: Style.space(10)

          PanelRow {
            width: parent.width
            label: "Speed"
            detail: Math.round(root.current("speed", 1.0) * 10) / 10 + "x"
            minimum: 0.1; maximum: 3; step: 0.1
            value: root.current("speed", 1.0)
            onMoved: function(v) { root.apply({ speed: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Physics"
            detail: Math.round(root.current("heatPower", 1.0) * 10) / 10 + "x"
            minimum: 0.1; maximum: 2; step: 0.1
            value: root.current("heatPower", 1.0)
            onMoved: function(v) { root.apply({ heatPower: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Touch"
            detail: Math.round(root.current("touch", 1.0) * 100) / 100 + ""
            minimum: 0; maximum: 2; step: 0.05
            value: root.current("touch", 1.0)
            onMoved: function(v) { root.apply({ touch: v }) }
            onReleased: root.save()
          }

          // Eco: pauses under fullscreen windows everywhere and slows to
          // 10 Hz on battery. Toggle row, not a slider.
          Item {
            width: parent.width
            height: ecoText.implicitHeight

            Text {
              id: ecoText
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              text: "Eco mode"
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
              font.letterSpacing: 0.5
            }

            Text {
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              text: root.current("ecoPause", true) ? "on" : "off"
              color: root.current("ecoPause", true) ? Color.accent : Qt.darker(Color.popups.text, 1.35)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: {
                root.apply({ ecoPause: !root.current("ecoPause", true) })
                root.save()
              }
            }
          }
        }

        PanelSeparator {}

        // ---- Liquid (surface tension: merging and pinching)
        Column {
          width: parent.width
          spacing: Style.space(10)

          PanelRow {
            width: parent.width
            label: "Merge depth"
            detail: Math.round(root.current("mergeThreshold", 0.45) * 100) + " %"
            minimum: 0.1; maximum: 0.9; step: 0.01
            value: root.current("mergeThreshold", 0.45)
            onMoved: function(v) { root.apply({ mergeThreshold: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Merge speed"
            detail: Math.round(root.current("mergeSpeed", 0.35) * 100) / 100 + ""
            minimum: 0.02; maximum: 1.0; step: 0.01
            value: root.current("mergeSpeed", 0.35)
            onMoved: function(v) { root.apply({ mergeSpeed: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Split speed"
            detail: Math.round(root.current("splitSpeed", 0.16) * 100) / 100 + ""
            minimum: 0.02; maximum: 0.8; step: 0.01
            value: root.current("splitSpeed", 0.16)
            onMoved: function(v) { root.apply({ splitSpeed: v }) }
            onReleased: root.save()
          }

          Dropdown {
            id: liquidDropdown
            width: parent.width
            label: "Liquid mood"
            value: root.currentLiquidPreset()
            options: root.liquidOptions
            onChanged: function(v) {
              var p = root.liquidPresets[v]
              if (!p) return
              root.apply(p)
              root.save()
            }
          }

          Item {
            width: parent.width
            height: shuffleText.implicitHeight + Style.space(10)

            Rectangle {
              anchors.fill: parent
              radius: Style.cornerRadius
              color: shuffleMouse.containsMouse ? Style.hoverFillFor(Color.popups.text, Color.accent) : "transparent"
            }

            Text {
              id: shuffleText
              anchors.centerIn: parent
              text: "Shuffle liquid"
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }

            MouseArea {
              id: shuffleMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: {
                // Tasteful randomization: always near the defaults, so any
                // roll stays a plausible lava lamp.
                function rand(lo, hi) { return lo + Math.random() * (hi - lo) }
                root.apply({ mergeThreshold: rand(0.3, 0.65), mergeSpeed: rand(0.15, 0.55),
                             splitSpeed: rand(0.08, 0.3), heatPower: rand(0.8, 1.5),
                             buoyancy: rand(0.35, 0.8), drag: rand(1.0, 2.4),
                             repulsion: rand(3.5, 6.5) })
                root.save()
              }
            }
          }
        }

        PanelSeparator {}

        // ---- Color
        Column {
          width: parent.width
          spacing: Style.space(10)

          PanelRow {
            width: parent.width
            label: "Hue shift"
            detail: Math.round(root.current("hue", 0.0) * 100) / 100 + ""
            minimum: -0.5; maximum: 0.5; step: 0.01
            value: root.current("hue", 0.0)
            onMoved: function(v) { root.apply({ hue: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Glow"
            detail: Math.round(root.current("glow", 1.0) * 100) / 100 + ""
            minimum: 0; maximum: 2; step: 0.05
            value: root.current("glow", 1.0)
            onMoved: function(v) { root.apply({ glow: v }) }
            onReleased: root.save()
          }

          Dropdown {
            id: presetDropdown
            width: parent.width
            label: "Preset"
            value: root.currentPreset()
            options: root.presetOptions
            onChanged: function(v) {
              var p = root.presets[v]
              if (!p) return
              root.apply(p)
              root.save()
            }
          }
        }

        PanelSeparator {}

        // ---- Background (independent of the wax)
        Column {
          width: parent.width
          spacing: Style.space(10)

          PanelRow {
            width: parent.width
            label: "Bg hue top"
            detail: Math.round(root.current("bgHueTop", 0.0) * 360) + "°"
            minimum: -0.5; maximum: 0.5; step: 0.01
            value: root.current("bgHueTop", 0.0)
            onMoved: function(v) { root.apply({ bgHueTop: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Bg hue bottom"
            detail: Math.round(root.current("bgHueBottom", 0.0) * 360) + "°"
            minimum: -0.5; maximum: 0.5; step: 0.01
            value: root.current("bgHueBottom", 0.0)
            onMoved: function(v) { root.apply({ bgHueBottom: v }) }
            onReleased: root.save()
          }
        }

        PanelSeparator {}

        // ---- Omarchy theme (live accent re-tint)
        Column {
          width: parent.width
          spacing: Style.space(10)

          Text {
            text: "OMARCHY THEME"
            color: Qt.darker(Color.popups.text, 1.6)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.letterSpacing: 1
            font.bold: true
          }

          PanelRow {
            width: parent.width
            label: "Accent hue"
            detail: Math.round(root.current("accentHue", 0.0) * 360) + "°"
            minimum: -0.5; maximum: 0.5; step: 0.01
            value: root.current("accentHue", 0.0)
            onMoved: function(v) { root.apply({ accentHue: v }) }
            onReleased: root.save()
          }

          PanelRow {
            width: parent.width
            label: "Accent sat"
            detail: Math.round(root.current("accentSat", 1.0) * 100) + " %"
            minimum: 0; maximum: 2; step: 0.05
            value: root.current("accentSat", 1.0)
            onMoved: function(v) { root.apply({ accentSat: v }) }
            onReleased: root.save()
          }
        }

        PanelSeparator {}

        // ---- Defaults
        Item {
          width: parent.width
          height: resetText.implicitHeight + Style.space(12)

          Rectangle {
            anchors.fill: parent
            radius: Style.cornerRadius
            color: resetMouse.containsMouse ? Style.hoverFillFor(Color.popups.text, Color.accent) : "transparent"
          }

          Text {
            id: resetText
            anchors.centerIn: parent
            text: "Reset to defaults"
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          MouseArea {
            id: resetMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
              root.apply({ blobCount: 14, blobSize: 0.085, sizeSpread: 0.55,
                           speed: 1.0, heatPower: 1.0, touch: 1.0,
                           mergeThreshold: 0.45, mergeSpeed: 0.35,
                           splitSpeed: 0.16, buoyancy: 0.55, drag: 1.6,
                           repulsion: 4.5, ecoPause: true,
                           hue: 0.0, glow: 1.0,
                           bgHueTop: 0.0, bgHueBottom: 0.0,
                           accentHue: 0.0, accentSat: 1.0 })
              root.save()
            }
          }
        }
      }
    }
  }
}
}