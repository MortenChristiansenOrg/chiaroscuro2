import { afterEach, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { CommandRegistry, EventRegistry } from "../../bus/types";
import type { SettingsEvents } from "../settings/settings.shared";
import type { DebugServerCommands } from "./debug-server.shared";

// Exercise feature policy without opening a fixed TCP port.
vi.mock("node:http", () => ({
  default: {
    createServer: () => ({
      once: vi.fn(),
      listen: (_port: number, _host: string, ready: () => void) => ready(),
      address: () => ({ port: 12345 }),
      close: (closed?: () => void) => closed?.(),
    }),
  },
}));

afterEach(() => vi.resetModules());

it.each([false, true])(
  "manual stop restores the configured recording baseline (%s)",
  async (initiallyEnabled) => {
    const { default: feature, getActualPort } = await import("./debug-server.main");
    const { getHistory, clearHistory } = await import("./recorder");
    const commands = new CommandBus<DebugServerCommands>();
    const events = new EventBus<SettingsEvents & { probe: { value: number } }>();
    feature.register({
      commands,
      events,
      isDev: false,
      recordingEnabled: initiallyEnabled,
      commandBus: commands as unknown as CommandBus<CommandRegistry>,
      eventBus: events as unknown as EventBus<EventRegistry>,
    });
    try {
      await commands.send("debug-server:start", undefined);
      await commands.send("debug-server:stop", undefined);
      clearHistory();
      events.emit("probe", { value: 1 });
      expect(getHistory().some((entry) => entry.name === "probe")).toBe(initiallyEnabled);

      // Subsequent settings changes replace the baseline restored by manual stop.
      events.emit("settings:changed", {
        settings: {
          searchProviders: [],
          defaultSearchProviderId: "!g",
          debugServer: { enabled: !initiallyEnabled, port: 12345 },
        },
      });
      await vi.waitFor(() => expect(getActualPort()).toBe(initiallyEnabled ? null : 12345));
      await commands.send("debug-server:stop", undefined);
      clearHistory();
      events.emit("probe", { value: 2 });
      expect(getHistory().some((entry) => entry.name === "probe")).toBe(!initiallyEnabled);
    } finally {
      feature.teardown();
    }
  },
);
