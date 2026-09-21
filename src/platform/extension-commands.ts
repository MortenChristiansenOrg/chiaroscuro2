import type { Input } from "electron";

export interface ExtensionCommand {
  description?: string;
  suggested_key?: { default?: string; windows?: string; linux?: string; mac?: string };
  global?: boolean;
}

/** A canonical chord also lets browser accelerators reserve equivalent Chrome shortcuts. */
export function commandChord(shortcut: string, platform = process.platform): string | undefined {
  const parts = shortcut.toLowerCase().split("+");
  let key = parts.pop();
  const aliases: Record<string, string> = {
    comma: ",",
    period: ".",
    space: " ",
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
  };
  if (key) key = aliases[key] ?? key;
  if (!key) return;
  const modifiers = new Set<string>();
  for (const part of parts) {
    if (["ctrl", "control", "macctrl"].includes(part)) modifiers.add("control");
    else if (["command", "cmd", "meta", "super"].includes(part)) modifiers.add("meta");
    else if (["commandorcontrol", "cmdorctrl"].includes(part))
      modifiers.add(platform === "darwin" ? "meta" : "control");
    else if (part === "alt" || part === "shift") modifiers.add(part);
    else return;
  }
  return [...modifiers].sort().concat(key).join("+");
}

/** Resolve the platform override, preserving Chrome's special Ctrl/MacCtrl semantics. */
export function suggestedShortcut(command: ExtensionCommand, platform = process.platform): string {
  const keys = command.suggested_key;
  const shortcut =
    keys?.[platform === "win32" ? "windows" : platform === "darwin" ? "mac" : "linux"] ??
    keys?.default ??
    "";
  // Chrome treats Ctrl in suggested keys as Command on macOS; MacCtrl is literal Control.
  return platform === "darwin"
    ? shortcut.replace(/\bCtrl\b/g, "Command").replace(/\bMacCtrl\b/g, "Ctrl")
    : shortcut;
}

/** Normalize native key input without losing shifted digits or extra modifiers. */
export function inputChord(input: Input): string | undefined {
  // Shift+9 is reported as '(' on many layouts. Chrome commands use the digit key.
  const key = /^Digit[0-9]$/.test(input.code) ? input.code.slice(5) : input.key;
  return commandChord(
    [
      ...(input.control ? ["Control"] : []),
      ...(input.alt ? ["Alt"] : []),
      ...(input.shift ? ["Shift"] : []),
      ...(input.meta ? ["Meta"] : []),
      key,
    ].join("+"),
  );
}
