import type { Input } from "electron";
import { expect, it } from "vitest";
import { commandChord, inputChord, suggestedShortcut } from "./extension-commands";

it("selects platform defaults and Chrome's macOS modifier semantics", () => {
  const command = { suggested_key: { default: "Ctrl+Shift+Y", linux: "Ctrl+Shift+U" } };
  expect(suggestedShortcut(command, "win32")).toBe("Ctrl+Shift+Y");
  expect(suggestedShortcut(command, "linux")).toBe("Ctrl+Shift+U");
  expect(suggestedShortcut(command, "darwin")).toBe("Command+Shift+Y");
  expect(suggestedShortcut({ suggested_key: { mac: "MacCtrl+Shift+L" } }, "darwin")).toBe(
    "Ctrl+Shift+L",
  );
  expect(suggestedShortcut({})).toBe("");
});

it("reserves equivalent browser accelerators regardless of modifier ordering or aliases", () => {
  expect(commandChord("Control+Shift+L")).toBe(commandChord("Shift+Ctrl+L"));
  expect(commandChord("CommandOrControl+L", "win32")).toBe(commandChord("Ctrl+L"));
  expect(commandChord("CommandOrControl+L", "darwin")).toBe(commandChord("Command+L"));
  expect(commandChord("Ctrl+Comma")).toBe(commandChord("Ctrl+,"));
  expect(commandChord("Alt+Up")).toBe(commandChord("Alt+ArrowUp"));
  expect(commandChord("Hyper+L")).toBeUndefined();
  expect(commandChord("")).toBeUndefined();
});

it("matches shifted digit commands without dropping extra modifiers", () => {
  const input = {
    key: "(",
    code: "Digit9",
    control: true,
    shift: true,
    alt: false,
    meta: false,
  } as Input;
  expect(inputChord(input)).toBe(commandChord("Ctrl+Shift+9"));
  expect(inputChord({ ...input, alt: true })).not.toBe(commandChord("Ctrl+Shift+9"));
});
