type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
}

const MAX_ENTRIES = 2000;
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let nextId = 1;
const buffer: LogEntry[] = [];

function add(level: LogLevel, source: string, message: string, data?: unknown): void {
  const entry: LogEntry = { id: nextId++, timestamp: Date.now(), level, source, message };
  if (data !== undefined) entry.data = data;
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export const debugLog = {
  debug(source: string, message: string, data?: unknown) {
    add("debug", source, message, data);
  },
  info(source: string, message: string, data?: unknown) {
    add("info", source, message, data);
  },
  warn(source: string, message: string, data?: unknown) {
    add("warn", source, message, data);
  },
  error(source: string, message: string, data?: unknown) {
    add("error", source, message, data);
  },

  query(opts?: {
    level?: LogLevel;
    source?: string;
    since?: number;
    until?: number;
    limit?: number;
  }): LogEntry[] {
    let results = buffer.slice();

    if (opts?.level) {
      const minOrder = LEVEL_ORDER[opts.level];
      results = results.filter((e) => LEVEL_ORDER[e.level] >= minOrder);
    }
    if (opts?.source) {
      if (opts.source.endsWith("*")) {
        const prefix = opts.source.slice(0, -1);
        results = results.filter((e) => e.source.startsWith(prefix));
      } else {
        results = results.filter((e) => e.source === opts.source);
      }
    }
    if (opts?.since != null) {
      const since = opts.since;
      results = results.filter((e) => e.timestamp >= since);
    }
    if (opts?.until != null) {
      const until = opts.until;
      results = results.filter((e) => e.timestamp <= until);
    }
    if (opts?.limit) results = results.slice(-opts.limit);

    return results;
  },

  clear() {
    buffer.length = 0;
  },
};
