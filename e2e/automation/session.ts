import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";
import type { RecordedEntry } from "../../src/features/debug-server/recorder";
import type { DebugTarget } from "../../src/features/debug-server/targets.shared";
import { waitUntil } from "./wait";

interface Hooks {
  ready: boolean;
  getDebugPort(): number | null;
}

export class AppSession {
  app!: ElectronApplication;
  shell!: Page;
  profile = "";
  debugUrl = "";
  generation = 0;
  readonly token = randomUUID();
  readonly journal: unknown[] = [];
  readonly headless = process.platform === "linux" && process.env.CHIAROSCURO_HEADED !== "1";
  private pages = new Map<string, Page>();
  private running = false;
  private lastTargets: DebugTarget[] = [];

  constructor(readonly artifactDir: string) {}

  record(kind: string, data: unknown): void {
    this.journal.push({ time: new Date().toISOString(), generation: this.generation, kind, data });
    if (this.journal.length > 2_000) this.journal.shift();
  }

  async launch(): Promise<void> {
    await fs.mkdir(this.artifactDir, { recursive: true });
    this.profile ||= await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-verify-"));
    this.generation++;
    this.pages.clear();
    const args = [
      ...(this.headless
        ? [
            "--ozone-platform=headless",
            "--ozone-override-screen-size=1920,1080",
            "--disable-gpu",
            "--no-sandbox",
          ]
        : []),
      path.resolve("out/main/index.js"),
    ];
    this.record("launch", { args, profile: this.profile });
    try {
      await fs.access("out/main/index.js").catch(() => {
        throw new Error("Missing build. Run bun run build and bun run setup:electron first.");
      });
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: "test",
        DATA_DIR: this.profile,
        CHIAROSCURO_AUTOMATION: "1",
        CHIAROSCURO_DEBUG_TOKEN: this.token,
      };
      // A verification run must use the build under test, even from a dev terminal.
      delete env.ELECTRON_RENDERER_URL;
      delete env.ELECTRON_RUN_AS_NODE;
      this.app = await electron.launch({
        args,
        env: Object.fromEntries(
          Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
        timeout: 20_000,
      });
      this.running = true;
      this.app.process().stdout?.on("data", (chunk) => this.record("stdout", String(chunk)));
      this.app.process().stderr?.on("data", (chunk) => this.record("stderr", String(chunk)));
      this.app
        .process()
        .on("exit", (code, signal) => this.record("process-exit", { code, signal }));
      this.app.on("console", (message) => this.record(`main:${message.type()}`, message.text()));
      this.app.context().setDefaultTimeout(5_000);
      const observePage = (page: Page) => {
        page.on("console", (message) =>
          this.record(`console:${message.type()}`, { url: page.url(), text: message.text() }),
        );
        page.on("pageerror", (error) =>
          this.record("pageerror", { url: page.url(), error: String(error) }),
        );
        page.on("requestfailed", (request) =>
          this.record("requestfailed", { url: request.url(), failure: request.failure() }),
        );
        page.on("response", (response) => {
          if (response.status() >= 400)
            this.record("http-error", { url: response.url(), status: response.status() });
        });
        page.on("crash", () => this.record("crash", page.url()));
      };
      this.app.context().pages().forEach(observePage);
      this.app.context().on("page", observePage);
      await this.app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
      const port = await waitUntil(
        "feature startup and debug listener",
        () =>
          this.app.evaluate(() => {
            const hooks = (globalThis as unknown as { __testHooks?: Hooks }).__testHooks;
            return hooks?.ready ? hooks.getDebugPort() : null;
          }),
        (port) => !!port,
        15_000,
      );
      this.debugUrl = `http://127.0.0.1:${port}`;
      const shellTarget = await this.target((target) => target.kind === "shell");
      this.shell = await this.page(shellTarget);
      this.record(
        "setup-window",
        await this.app.evaluate(({ BrowserWindow, screen }, id) => {
          const win = BrowserWindow.fromId(id);
          if (!win) throw new Error("Shell window disappeared");
          const before = win.getBounds();
          const area = screen.getDisplayMatching(before).workArea;
          const width = Math.min(before.width, area.width);
          const height = Math.min(before.height, area.height);
          const bounds = {
            width,
            height,
            x: Math.max(area.x, Math.min(before.x, area.x + area.width - width)),
            y: Math.max(area.y, Math.min(before.y, area.y + area.height - height)),
          };
          if (!win.isMaximized()) win.setBounds(bounds);
          return { before, after: win.getBounds() };
        }, shellTarget.windowId ?? 0),
      );
      await this.shell
        .locator("[data-testid='shell-ready']")
        .waitFor({ state: "attached", timeout: 15_000 });
      this.record("ready", await this.environment());
    } catch (error) {
      await this.writeJson("launch-failure.json", {
        error: error instanceof Error ? error.stack : String(error),
        rerun: "DEBUG=pw:browser bun run verify:app (on Windows, use $env:DEBUG='pw:browser')",
        journal: this.journal,
        runtime: process.versions,
      });
      await this.close().catch(() => {});
      throw error;
    }
  }

  async environment() {
    return this.app.evaluate(({ app, screen }) => ({
      versions: process.versions,
      platform: process.platform,
      pid: process.pid,
      userData: app.getPath("userData"),
      argv: process.argv,
      displays: screen
        .getAllDisplays()
        .map(({ id, bounds, workArea, scaleFactor }) => ({ id, bounds, workArea, scaleFactor })),
    }));
  }

  async connection() {
    const [port] = (
      await fs.readFile(path.join(this.profile, "chromium", "DevToolsActivePort"), "utf8")
    )
      .trim()
      .split("\n");
    return { cdpUrl: `http://127.0.0.1:${port}`, debugUrl: this.debugUrl };
  }

  async debug<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.debugUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${endpoint}: ${response.status} ${JSON.stringify(result)}`);
    return result as T;
  }

  /** Scenario setup/diagnosis only; verify the changed behavior with real page input. */
  async command<T = unknown>(name: string, payload?: unknown): Promise<T> {
    this.record("setup-command", { name, payload });
    const result = await this.debug<{ response: T }>("/commands/send", { name, payload });
    this.record("command-result", { name, result });
    return result.response;
  }

  async targets(): Promise<DebugTarget[]> {
    this.lastTargets = await this.debug("/state/targets");
    return this.lastTargets;
  }

  async target(predicate: (target: DebugTarget) => boolean): Promise<DebugTarget> {
    const targets = await waitUntil(
      "matching target",
      () => this.targets(),
      (targets) => targets.some(predicate),
    );
    const target = targets.find(predicate);
    if (!target) throw new Error("Target disappeared");
    return target;
  }

  async page(target: DebugTarget): Promise<Page> {
    const cached = this.pages.get(target.cdpTargetId);
    if (cached && !cached.isClosed()) return cached;
    const page = await waitUntil(
      `CDP page for ${target.id}`,
      async () => {
        for (const page of this.app.context().pages()) {
          if (page.isClosed()) continue;
          const cdp = await this.app.context().newCDPSession(page);
          try {
            const { targetInfo } = await cdp.send("Target.getTargetInfo");
            this.pages.set(targetInfo.targetId, page);
          } finally {
            await cdp.detach();
          }
        }
        return this.pages.get(target.cdpTargetId);
      },
      (page) => !!page,
    );
    if (!page) throw new Error(`No page for ${target.id}`);
    return page;
  }

  async eventCursor(): Promise<number> {
    const history = await this.debug<{ entries: RecordedEntry[] }>("/history?limit=1000");
    return Math.max(0, ...history.entries.map((entry) => entry.id));
  }

  async waitForEvent(name: string, after: number): Promise<RecordedEntry> {
    const result = await waitUntil(
      `event ${name} after ${after}`,
      () =>
        this.debug<{ entries: RecordedEntry[] }>(
          `/history?type=event&payload=true&limit=1000&name=${encodeURIComponent(name)}`,
        ),
      (history) => history.entries.some((entry) => entry.id > after),
    );
    const entry = result.entries.find((entry) => entry.id > after);
    if (!entry) throw new Error("Event no longer retained");
    return entry;
  }

  async inspect(target: DebugTarget) {
    const page = await this.page(target);
    return {
      target,
      accessibility: await page.locator("body").ariaSnapshot(),
      dom: await page.evaluate(
        (parentId) => ({
          focus: document.activeElement?.outerHTML.slice(0, 1_000),
          surfaces: [
            ...document.querySelectorAll(
              '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]',
            ),
          ].map((element) => {
            // Inspection IDs last as long as the DOM node; they never rename application IDs.
            const id = element.getAttribute("data-verification-surface") ?? crypto.randomUUID();
            element.setAttribute("data-verification-surface", id);
            return {
              role: element.getAttribute("role"),
              label: element.getAttribute("aria-label"),
              id: `surface:${id}`,
              parentId,
              selector: `[data-verification-surface="${id}"]`,
              bounds: element.getBoundingClientRect().toJSON(),
            };
          }),
          animations: document.getAnimations().map((animation) => ({
            playState: animation.playState,
            currentTime: animation.currentTime,
          })),
        }),
        target.id,
      ),
    };
  }

  async writeJson(name: string, data: unknown): Promise<void> {
    await fs.writeFile(path.join(this.artifactDir, name), JSON.stringify(data, null, 2));
  }

  /** Renderer filmstrip with compositor timestamps; not a whole-desktop video. */
  async recordFrames(
    target: DebugTarget,
    label: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const cdp = await this.app.context().newCDPSession(await this.page(target));
    const frames: { data: string; timestamp?: number }[] = [];
    cdp.on("Page.screencastFrame", (frame) => {
      if (frames.length < 90)
        frames.push({ data: frame.data, timestamp: frame.metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    });
    try {
      await cdp.send("Page.startScreencast", {
        format: "png",
        everyNthFrame: 1,
        maxWidth: 1200,
        maxHeight: 800,
      });
      await action();
    } finally {
      await cdp.send("Page.stopScreencast");
      await cdp.detach();
      const manifest = [];
      for (const [index, frame] of frames.entries()) {
        const file = `${label}.frame-${String(index).padStart(3, "0")}.png`;
        await fs.writeFile(path.join(this.artifactDir, file), Buffer.from(frame.data, "base64"));
        manifest.push({ file, timestamp: frame.timestamp });
      }
      await this.writeJson(`${label}.frames.json`, { target, composed: false, frames: manifest });
    }
  }

  /** OS-composed display crop. Headless has no desktop compositor and must not claim this evidence. */
  async composedCapture(name: string): Promise<string> {
    if (this.headless)
      throw new Error(
        "UNSUPPORTED: composed desktop capture on Ozone headless; use native Windows or CHIAROSCURO_HEADED=1 with X11.",
      );
    const data = await this.app.evaluate(async ({ BrowserWindow, desktopCapturer, screen }) => {
      const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
      if (!win) throw new Error("No application window");
      const visibleWindows = BrowserWindow.getAllWindows().filter(
        (candidate) => candidate.isVisible() && !candidate.isMinimized(),
      );
      const rectangles = visibleWindows.map((candidate) => candidate.getBounds());
      if (!rectangles.length) throw new Error("No visible application windows");
      const left = Math.min(...rectangles.map((rect) => rect.x));
      const top = Math.min(...rectangles.map((rect) => rect.y));
      const bounds = {
        x: left,
        y: top,
        width: Math.max(...rectangles.map((rect) => rect.x + rect.width)) - left,
        height: Math.max(...rectangles.map((rect) => rect.y + rect.height)) - top,
      };
      const display = screen.getDisplayMatching(bounds);
      const intersectingDisplays = screen
        .getAllDisplays()
        .filter(
          ({ bounds: other }) =>
            bounds.x < other.x + other.width &&
            bounds.x + bounds.width > other.x &&
            bounds.y < other.y + other.height &&
            bounds.y + bounds.height > other.y,
        );
      if (intersectingDisplays.length > 1)
        throw new Error("Window spans displays; move it onto one display before capture");
      // Maximized Windows windows include invisible borders outside the monitor.
      const crop = {
        x: Math.max(bounds.x, display.bounds.x),
        y: Math.max(bounds.y, display.bounds.y),
        right: Math.min(bounds.x + bounds.width, display.bounds.x + display.bounds.width),
        bottom: Math.min(bounds.y + bounds.height, display.bounds.y + display.bounds.height),
      };
      if (crop.right <= crop.x || crop.bottom <= crop.y)
        throw new Error("Application is outside the captured display");
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
        },
      });
      const source = sources.find((source) => source.display_id === String(display.id));
      if (!source || source.thumbnail.isEmpty())
        throw new Error("Desktop capture unavailable on this runtime");
      const size = source.thumbnail.getSize();
      const scaleX = size.width / display.size.width;
      const scaleY = size.height / display.size.height;
      const png = source.thumbnail
        .crop({
          x: Math.round((crop.x - display.bounds.x) * scaleX),
          y: Math.round((crop.y - display.bounds.y) * scaleY),
          width: Math.round((crop.right - crop.x) * scaleX),
          height: Math.round((crop.bottom - crop.y) * scaleY),
        })
        .toPNG()
        .toString("base64");
      return { png, requestedBounds: bounds, crop, display: display.bounds };
    });
    const file = path.join(this.artifactDir, `${name}.composed.png`);
    await fs.writeFile(file, Buffer.from(data.png, "base64"));
    const { png: _png, ...geometry } = data;
    await this.writeJson(`${name}.composed.json`, geometry);
    return file;
  }

  async capture(label: string) {
    const errors: string[] = [];
    const bestEffort = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        errors.push(String(error));
      }
    };
    await this.writeJson(`${label}.last-targets.json`, this.lastTargets);
    await bestEffort(async () =>
      this.writeJson(`${label}.state.json`, {
        state: await this.debug("/state"),
        history: await this.debug("/history?limit=1000&payload=true"),
        log: await this.debug("/log?limit=1000&data=true"),
        environment: await this.environment(),
      }),
    );
    await bestEffort(async () => {
      const targets = await this.targets();
      await this.writeJson(`${label}.targets.json`, targets);
      const seen = new Set<string>();
      for (const target of targets) {
        if (!target.visible || seen.has(target.cdpTargetId)) continue;
        seen.add(target.cdpTargetId);
        await bestEffort(async () => {
          const stem = `${label}.${target.id.replaceAll(":", "-")}`;
          await this.writeJson(`${stem}.inspection.json`, await this.inspect(target));
          await (await this.page(target)).screenshot({
            path: path.join(this.artifactDir, `${stem}.renderer.png`),
            timeout: 3_000,
          });
        });
      }
    });
    let composed: string | null = null;
    await bestEffort(async () => {
      composed = await this.composedCapture(label);
    });
    const summary = {
      status: errors.length ? ("partial" as const) : ("complete" as const),
      errors,
      composedCapture: composed ?? (this.headless ? "unsupported" : "unavailable"),
    };
    await this.writeJson(`${label}.evidence.json`, {
      ...summary,
      journal: this.journal,
      rendererScreenshotsIncludeNativeLayers: false,
    });
    return summary;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.record("stop", { pid: this.app.process().pid });
    try {
      await this.app
        .context()
        .tracing.stop({ path: path.join(this.artifactDir, `trace-${this.generation}.zip`) });
    } catch (error) {
      this.record("trace-error", String(error));
    } finally {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.app.close(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              this.app.process().kill("SIGKILL");
              reject(
                new Error("Graceful shutdown timed out; terminated this verification process"),
              );
            }, 5_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        this.running = false;
      }
    }
  }

  async restart(): Promise<void> {
    await this.capture(`before-restart-${this.generation}`);
    await this.stop();
    await this.launch();
  }

  async close(): Promise<void> {
    try {
      await this.stop();
    } finally {
      await this.writeJson("journal.json", this.journal);
      if (this.profile)
        await fs.rm(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}
