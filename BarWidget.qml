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
    // Lit while the control panel is open. Third-party bar widgets get a
    // scoped shell (PluginShellApi) without openPanelIds, so ask through
    // isPluginOpen() instead — available on both the root shell and the
    // scoped plugin shell.
    active: root.bar && root.bar.shell && typeof root.bar.shell.isPluginOpen === "function"
      ? root.bar.shell.isPluginOpen(root.moduleName) === true : false
    text: "\uf06d"   // fa-fire — reads as lamp heat at bar size
    tooltipText: "Lava lamp settings"

    onPressed: function(buttonCode) {
      if (root.bar && root.bar.shell) root.bar.shell.toggle(root.moduleName)
    }
  }
}