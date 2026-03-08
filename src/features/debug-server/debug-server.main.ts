import http from "node:http";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { CommandRegistry, EventRegistry } from "../../bus/types";
import { debugLog } from "../../shared/debug-log";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import type { SettingsChangedEvent, SettingsEvents } from "../settings/settings.shared";
import { SETTINGS_CHANGED } from "../settings/settings.shared";
import type { DebugServerCommands } from "./debug-server.shared";
import { DEBUG_SERVER_START, DEBUG_SERVER_STOP } from "./debug-server.shared";
import { clearHistory, getHistory, register as registerRecorder } from "./recorder";
import { getDebugState, getDebugStateNames } from "./state-providers";

const startTime = Date.now();
let server: http.Server | null = null;
let actualPort: number | null = null;

type AllCommands = DebugServerCommands;
type AllEvents = Pick<SettingsEvents, typeof SETTINGS_CHANGED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  commandBus: CommandBus<CommandRegistry>;
  eventBus: EventBus<EventRegistry>;
  isDev: boolean;
}

function parseTimestamp(value: string): number {
  const asNum = Number(value);
  if (!Number.isNaN(asNum)) return asNum;
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return asDate;
  return 0;
}

function matchesGlob(name: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return name === pattern;
}

function pluckFields(obj: unknown, fields: string[]): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const parts = field.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    result[field] = current;
  }
  return result;
}

function safeStringify(value: unknown, pretty: boolean): string {
  try {
    return JSON.stringify(value, null, pretty ? 2 : undefined);
  } catch {
    return JSON.stringify({ error: "Failed to serialize response" });
  }
}

function respond(res: http.ServerResponse, status: number, data: unknown, pretty: boolean): void {
  const body = safeStringify(data, pretty);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  commandBus: CommandBus<CommandRegistry>,
  eventBus: EventBus<EventRegistry>,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pretty = url.searchParams.has("pretty");

  // CORS preflight
  if (req.method === "OPTIONS") {
    respond(res, 204, "", false);
    return;
  }

  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/") {
    respond(
      res,
      200,
      {
        uptime: Math.round((Date.now() - startTime) / 1000),
        port: actualPort,
        historyCount: getHistory().length,
        stateProviders: getDebugStateNames(),
        endpoints: {
          "GET /": "Overview",
          "GET /state": "All feature state",
          "GET /state/{feature}": "Single feature state",
          "GET /history": "Command/event/registration history",
          "GET /log": "Debug log",
          "GET /commands": "Registered command handlers",
          "POST /commands/send": "Send a command",
          "DELETE /history": "Clear history",
          "DELETE /log": "Clear log",
        },
      },
      pretty,
    );
    return;
  }

  if (req.method === "GET" && pathname === "/state") {
    const featuresParam = url.searchParams.get("features");
    const fieldsParam = url.searchParams.get("fields");
    const fields = fieldsParam ? fieldsParam.split(",").map((f) => f.trim()) : undefined;

    (async () => {
      let state: Record<string, unknown>;
      if (featuresParam) {
        const names = featuresParam.split(",").map((f) => f.trim());
        const parts = await Promise.all(names.map((name) => getDebugState(name)));
        state = {};
        for (const s of parts) Object.assign(state, s);
      } else {
        state = await getDebugState();
      }

      if (fields) {
        for (const key of Object.keys(state)) {
          state[key] = pluckFields(state[key], fields);
        }
      }
      respond(res, 200, state, pretty);
    })().catch((err) => respond(res, 500, { error: String(err) }, pretty));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/state/")) {
    const feature = pathname.slice("/state/".length);
    const fieldsParam = url.searchParams.get("fields");

    getDebugState(feature)
      .then((state) => {
        const featureState = state[feature];
        if (featureState === undefined) {
          respond(res, 404, { error: `Unknown feature: ${feature}` }, pretty);
          return;
        }
        if (fieldsParam) {
          const fields = fieldsParam.split(",").map((f) => f.trim());
          respond(res, 200, pluckFields(featureState, fields), pretty);
        } else {
          respond(res, 200, featureState, pretty);
        }
      })
      .catch((err) => respond(res, 500, { error: String(err) }, pretty));
    return;
  }

  if (req.method === "GET" && pathname === "/history") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const order = url.searchParams.get("order") ?? "desc";
    const typeParam = url.searchParams.get("type");
    const nameParam = url.searchParams.get("name");
    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");
    const errorsOnly = url.searchParams.get("errors") === "true";
    const includePayload = url.searchParams.get("payload") === "true";

    const types = typeParam ? typeParam.split(",").map((t) => t.trim()) : undefined;

    let entries = [...getHistory()];
    if (types) entries = entries.filter((e) => types.includes(e.type));
    if (nameParam) entries = entries.filter((e) => matchesGlob(e.name, nameParam));
    if (sinceParam) {
      const since = parseTimestamp(sinceParam);
      entries = entries.filter((e) => e.timestamp >= since);
    }
    if (untilParam) {
      const until = parseTimestamp(untilParam);
      entries = entries.filter((e) => e.timestamp <= until);
    }
    if (errorsOnly) entries = entries.filter((e) => e.type === "command" && e.error);

    if (order === "desc") entries.reverse();
    entries = entries.slice(0, limit);

    if (!includePayload) {
      entries = entries.map((e) => {
        const { payload: _p, response: _r, ...rest } = e;
        return rest;
      });
    }

    respond(res, 200, { count: entries.length, entries }, pretty);
    return;
  }

  if (req.method === "GET" && pathname === "/log") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const order = url.searchParams.get("order") ?? "desc";
    const levelParam = url.searchParams.get("level") as "debug" | "info" | "warn" | "error" | null;
    const sourceParam = url.searchParams.get("source");
    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");
    const includeData = url.searchParams.get("data") === "true";

    let entries = debugLog.query({
      level: levelParam ?? undefined,
      source: sourceParam ?? undefined,
      since: sinceParam ? parseTimestamp(sinceParam) : undefined,
      until: untilParam ? parseTimestamp(untilParam) : undefined,
    });

    if (order === "desc") entries = entries.reverse();
    entries = entries.slice(0, limit);

    if (!includeData) {
      entries = entries.map((e) => {
        const { data: _d, ...rest } = e;
        return rest;
      });
    }

    respond(res, 200, { count: entries.length, entries }, pretty);
    return;
  }

  if (req.method === "GET" && pathname === "/commands") {
    respond(res, 200, { commands: commandBus.getHandlerNames() }, pretty);
    return;
  }

  if (req.method === "POST" && pathname === "/commands/send") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { name, payload } = JSON.parse(body) as { name: string; payload: unknown };
        if (!name) {
          respond(res, 400, { error: "Missing 'name' field" }, pretty);
          return;
        }
        if (!commandBus.hasHandler(name)) {
          respond(res, 404, { error: `No handler for command: ${name}` }, pretty);
          return;
        }
        const response = await commandBus.send(
          name as string & keyof CommandRegistry,
          payload as CommandRegistry[string & keyof CommandRegistry]["payload"],
        );
        respond(res, 200, { response }, pretty);
      } catch (err) {
        respond(res, 500, { error: err instanceof Error ? err.message : String(err) }, pretty);
      }
    });
    return;
  }

  if (req.method === "DELETE" && pathname === "/history") {
    clearHistory();
    respond(res, 200, { cleared: true }, pretty);
    return;
  }

  if (req.method === "DELETE" && pathname === "/log") {
    debugLog.clear();
    respond(res, 200, { cleared: true }, pretty);
    return;
  }

  respond(res, 404, { error: "Not found" }, pretty);
}

function startServer(
  port: number,
  commandBus: CommandBus<CommandRegistry>,
  eventBus: EventBus<EventRegistry>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const maxAttempts = 10;
    let attempt = 0;

    function tryListen(tryPort: number): void {
      const srv = http.createServer((req, res) => handleRequest(req, res, commandBus, eventBus));
      srv.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempt < maxAttempts) {
          attempt++;
          tryListen(port + attempt);
        } else {
          reject(err);
        }
      });
      srv.listen(tryPort, "127.0.0.1", () => {
        server = srv;
        actualPort = tryPort;
        debugLog.info("debug-server", `Listening on 127.0.0.1:${tryPort}`);
        resolve(tryPort);
      });
    }
    tryListen(port);
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        actualPort = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export default defineFeature<Deps>({
  register({ commands, events, commandBus, eventBus, isDev }) {
    // Register recorder early to capture all subsequent registrations
    registerRecorder(commandBus, eventBus);

    let configuredPort = 19400;
    let enabled = false;

    commands.handle(DEBUG_SERVER_START, async () => {
      if (server) return;
      await startServer(configuredPort, commandBus, eventBus);
    });

    commands.handle(DEBUG_SERVER_STOP, async () => {
      await stopServer();
    });

    events.on(SETTINGS_CHANGED, (payload) => {
      const { settings } = payload as SettingsChangedEvent;
      const newEnabled = isDev || settings.debugServer.enabled;
      const newPort = settings.debugServer.port;

      const needsRestart = newEnabled !== enabled || (newEnabled && newPort !== configuredPort);
      enabled = newEnabled;
      configuredPort = newPort;

      if (needsRestart) {
        if (enabled) {
          stopServer()
            .then(() => startServer(configuredPort, commandBus, eventBus))
            .catch(logError("debug-server", "restart server"));
        } else {
          stopServer().catch(logError("debug-server", "stop server"));
        }
      }
    });
  },

  teardown() {
    if (server) {
      server.close();
      server = null;
      actualPort = null;
    }
  },
});

export function getActualPort(): number | null {
  return actualPort;
}
