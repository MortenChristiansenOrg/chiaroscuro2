import { describe, expect, it, vi } from "vitest";
import type { TabId } from "../shared/types";
import { checkPermission, matchesGrantedDevice } from "./permission-check";

describe("Electron permission checks", () => {
  it("forwards tab-less checks so origin/global policy can allow or deny them", () => {
    const resolve = vi.fn();
    const policy = vi.fn(() => true);
    expect(checkPermission(null, "notifications", "https://example.com", {}, resolve, policy)).toBe(
      true,
    );
    expect(policy).toHaveBeenCalledWith(null, "notifications", "https://example.com", {});
    expect(resolve).not.toHaveBeenCalled();
    policy.mockReturnValue(false);
    expect(checkPermission(null, "notifications", "https://example.com", {}, resolve, policy)).toBe(
      false,
    );
  });

  it("denies an unrecognized WebContents without consulting policy", () => {
    const policy = vi.fn(() => true);
    expect(
      checkPermission({ id: 1 }, "fullscreen", "https://example.com", {}, () => undefined, policy),
    ).toBe(false);
    expect(policy).not.toHaveBeenCalled();
  });

  it("preserves recognized tabs and media details", () => {
    const policy = vi.fn(() => true);
    expect(
      checkPermission(
        { id: 1 },
        "media",
        "https://example.com",
        { mediaType: "audio" },
        () => "tab-1" as TabId,
        policy,
      ),
    ).toBe(true);
    expect(policy).toHaveBeenCalledWith("tab-1", "media", "https://example.com", {
      mediaType: "audio",
    });
  });
});

describe("selected device identity", () => {
  it.each(["usb", "hid"])("does not grant a different %s device of the same model", (type) => {
    const selected = { deviceId: "selected", vendorId: 1, productId: 2 };
    expect(matchesGrantedDevice(type, selected, { ...selected })).toBe(true);
    expect(matchesGrantedDevice(type, selected, { ...selected, deviceId: "other" })).toBe(false);
    expect(
      matchesGrantedDevice(type, { vendorId: 1, productId: 2 }, { vendorId: 1, productId: 2 }),
    ).toBe(false);
  });

  it("matches serial ports by unique port ID", () => {
    expect(matchesGrantedDevice("serial", { portId: "one" }, { portId: "one" })).toBe(true);
    expect(matchesGrantedDevice("serial", { portId: "one" }, { portId: "two" })).toBe(false);
  });

  it("keeps HID interfaces separate and rejects missing identities", () => {
    expect(
      matchesGrantedDevice("hid", { deviceId: "one", guid: "a" }, { deviceId: "one", guid: "b" }),
    ).toBe(false);
    expect(
      matchesGrantedDevice("hid", { deviceId: "one", guid: "a" }, { deviceId: "one", guid: "a" }),
    ).toBe(true);
    expect(matchesGrantedDevice("usb", undefined, { deviceId: "one" })).toBe(false);
    expect(matchesGrantedDevice("usb", {}, {})).toBe(false);
  });
});
