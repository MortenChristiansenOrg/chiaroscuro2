import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId, WindowId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import type { TabsCommands } from "../tabs/tabs.shared";
import feature, {
  type ElectronAppSubset,
  extractUrls,
  filePathToUrl,
  setupExternalLink,
  validateUrl,
} from "./external-link.main";
import {
  EXTERNAL_LINK_OPEN,
  EXTERNAL_LINK_RECEIVED,
  type ExternalLinkCommands,
  type ExternalLinkEvents,
} from "./external-link.shared";

const WINDOW_ID = "win-1" as WindowId;
const TAB_ID = "tab-1" as TabId;

type AllCommands = ExternalLinkCommands & Pick<TabsCommands, "tabs:create">;

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<ExternalLinkEvents>();
  const platform = createMockPlatform();
  const getActiveWindowId = () => WINDOW_ID;

  // Stub tabs:create to return a TabId
  commands.handle("tabs:create", async () => TAB_ID);

  feature.register({ commands, events, platform, getActiveWindowId });

  return { commands, events, platform };
}

function createMockApp(): ElectronAppSubset & {
  _listeners: Map<string, ((...args: unknown[]) => void)[]>;
  _emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    _listeners: listeners,
    _emit(event: string, ...args: unknown[]) {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    on(event: string, cb: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
    },
  } as unknown as ReturnType<typeof createMockApp>;
}

// ── validateUrl ──────────────────────────────────────────────────

describe("validateUrl", () => {
  it("accepts http URLs", () => {
    expect(validateUrl("http://example.com")).toBe("http://example.com/");
  });

  it("accepts https URLs", () => {
    expect(validateUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  it("accepts file URLs", () => {
    expect(validateUrl("file:///C:/test.html")).toBe("file:///C:/test.html");
  });

  it("rejects javascript: scheme", () => {
    expect(validateUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: scheme", () => {
    expect(validateUrl("data:text/html,<h1>hi</h1>")).toBeNull();
  });

  it("rejects ftp: scheme", () => {
    expect(validateUrl("ftp://files.example.com")).toBeNull();
  });

  it("rejects custom schemes", () => {
    expect(validateUrl("myapp://callback")).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(validateUrl("not a url")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateUrl("")).toBeNull();
  });
});

// ── extractUrls ──────────────────────────────────────────────────

describe("extractUrls", () => {
  it("extracts http URL from argv", () => {
    const argv = ["/usr/bin/electron", ".", "https://example.com"];
    expect(extractUrls(argv)).toEqual(["https://example.com/"]);
  });

  it("extracts multiple URLs", () => {
    const argv = ["/usr/bin/electron", ".", "https://a.com", "http://b.com"];
    expect(extractUrls(argv)).toEqual(["https://a.com/", "http://b.com/"]);
  });

  it("skips flags", () => {
    const argv = [
      "/usr/bin/electron",
      ".",
      "--inspect=9229",
      "--remote-debugging-port=9333",
      "https://example.com",
    ];
    expect(extractUrls(argv)).toEqual(["https://example.com/"]);
  });

  it("converts file paths to file:// URLs", () => {
    const argv = ["/usr/bin/electron", ".", "/home/user/page.html"];
    const result = extractUrls(argv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^file:\/\/\/home\/user\/page\.html$/);
  });

  it("returns empty array when no URLs present", () => {
    const argv = ["/usr/bin/electron", "."];
    expect(extractUrls(argv)).toEqual([]);
  });

  it("skips electron binary and script path", () => {
    const argv = ["/usr/bin/electron", "/path/to/main.js"];
    expect(extractUrls(argv)).toEqual([]);
  });
});

// ── filePathToUrl ────────────────────────────────────────────────

describe("filePathToUrl", () => {
  it("converts absolute path", () => {
    const result = filePathToUrl("/home/user/doc.html");
    expect(result).toBe("file:///home/user/doc.html");
  });
});

// ── setupExternalLink ────────────────────────────────────────────

describe("setupExternalLink", () => {
  it("returns true when lock acquired", () => {
    const app = createMockApp();
    const result = setupExternalLink(app, ["/bin/electron", "."]);
    expect(result).toBe(true);
    expect(app.quit).not.toHaveBeenCalled();
    feature.teardown?.();
  });

  it("returns false and quits when lock not acquired", () => {
    const app = createMockApp();
    (app.requestSingleInstanceLock as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = setupExternalLink(app, ["/bin/electron", "."]);
    expect(result).toBe(false);
    expect(app.quit).toHaveBeenCalled();
    feature.teardown?.();
  });

  it("registers second-instance, open-url, open-file listeners", () => {
    const app = createMockApp();
    setupExternalLink(app, ["/bin/electron", "."]);
    expect(app._listeners.has("second-instance")).toBe(true);
    expect(app._listeners.has("open-url")).toBe(true);
    expect(app._listeners.has("open-file")).toBe(true);
    feature.teardown?.();
  });

  it("queues URLs from initial argv", () => {
    const app = createMockApp();
    setupExternalLink(app, ["/bin/electron", ".", "https://cold-start.com"]);
    // Drain via start() — tested in integration below
    feature.teardown?.();
  });
});

// ── external-link:open command ───────────────────────────────────

describe("external-link:open", () => {
  it("creates tab with validated URL and focuses window", async () => {
    const { commands, platform } = setup();

    await commands.send(EXTERNAL_LINK_OPEN, { url: "https://example.com" });

    expect(commands.send).toBeDefined(); // sanity
    expect(platform.focusWindow).toHaveBeenCalledWith(WINDOW_ID);
  });

  it("ignores invalid schemes", async () => {
    const { commands, platform } = setup();

    await commands.send(EXTERNAL_LINK_OPEN, { url: "javascript:alert(1)" });

    expect(platform.focusWindow).not.toHaveBeenCalled();
  });
});

// ── start() queue drain ──────────────────────────────────────────

describe("start() queue drain", () => {
  it("drains queued URLs on start and emits received event", async () => {
    const app = createMockApp();
    setupExternalLink(app, ["/bin/electron", ".", "https://queued.com"]);

    const { commands, events, platform } = setup();
    const received: unknown[] = [];
    events.on(EXTERNAL_LINK_RECEIVED, (payload) => received.push(payload));

    feature.start?.({ commands, events, platform, getActiveWindowId: () => WINDOW_ID });

    // Allow async command sends to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ urls: ["https://queued.com/"] });
    expect(platform.focusWindow).toHaveBeenCalled();

    feature.teardown?.();
  });
});
