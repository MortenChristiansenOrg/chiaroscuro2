import { debugLog } from "./debug-log";

export { debugLog as log };

function errorData(error: unknown): { error: string; stack?: string } {
  if (error instanceof Error) {
    return { error: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  }
  return { error: String(error) };
}

/** Error handler for promise .catch() chains. Logs at error level. */
export function logError(source: string, message: string): (error: unknown) => void {
  return (error: unknown) => {
    debugLog.error(source, message, errorData(error));
  };
}

/** Warning handler for expected-failure .catch() chains (e.g. removing non-existent records). */
export function logWarn(source: string, message: string): (error: unknown) => void {
  return (error: unknown) => {
    debugLog.warn(source, message, errorData(error));
  };
}
