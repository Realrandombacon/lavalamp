import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Bar icon for the lava lamp: one click opens/closes the control panel via
// the shell's panel toggle (the panel is a separate plugin kind in the same
// plugin, so summon/hide/toggle route through the shell's panel loader).
BarWidget {
  id: root
  moduleName: "io.github.realrandombacon.lavalamp"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // Lit while the control panel is open (the panel routes through the
    // shell's openPanelIds set, not through this widget).
    active: root.bar && root.bar.shell ? root.bar.shell.openPanelIds["io.github.realrandombacon.lavalamp"] === true : false
    text: "\uf06d"   // fa-fire — reads as lamp heat at bar size
    tooltipText: "Lava lamp settings"

    onPressed: function(buttonCode) {
      if (root.bar && root.bar.shell) root.bar.shell.toggle("io.github.realrandombacon.lavalamp")
    }
  }
}