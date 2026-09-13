import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { Platform } from "../../platform/types";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { TabsClosedEvent, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import feature from "./extensions.main";
import {
  EXTENSIONS_OPEN,
  type ExtensionsCommands,
  type ExtensionsEvents,
} from "./extensions.shared";

type AllCommands = ExtensionsCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = ExtensionsEvents & Pick<TabsEvents, "tabs:closed">;

function setup(platformOverrides?: Partial<Platform>) {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const platform = createMockPlatform(platformOverrides);

  const deps = { commands, events, dataStore, platform };

  commands.handle("tabs:create", async (payload) => {
    return `mock-tab-${payload.url}` as TabId;
  });
  commands.handle("tabs:activate", async () => {});

  feature.register(deps);
  return { commands, events, dataStore, platform, deps };
}

describe("extensions commands", () => {
  describe("EXTENSIONS_OPEN", () => {
    it("creates a built-in tab via tabs:create", async () => {
      const { commands } = setup();
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "ext-tab-1" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(EXTENSIONS_OPEN, undefined);

      expect(createSpy).toHaveBeenCalledWith({ url: "/extensions" });
    });

    it("reactivates existing extensions tab (singleton)", async () => {
      const { commands } = setup();
      await commands.send(EXTENSIONS_OPEN, undefined);

      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "ext-tab-2" as TabId);
      commands.handle("tabs:create", createSpy);
      commands.unhandle("tabs:activate");
      const activateSpy = vi.fn(async () => {});
      commands.handle("tabs:activate", activateSpy);

      await commands.send(EXTENSIONS_OPEN, undefined);
      expect(activateSpy).toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("creates new tab if singleton tab was closed", async () => {
      const { commands, events } = setup();
      await commands.send(EXTENSIONS_OPEN, undefined);

      events.emit("tabs:closed", {
        tabId: "mock-tab-/extensions" as TabId,
        activatedTabId: null,
      } as TabsClosedEvent);

      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "ext-tab-3" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(EXTENSIONS_OPEN, undefined);
      expect(createSpy).toHaveBeenCalled();
    });
  });
});
