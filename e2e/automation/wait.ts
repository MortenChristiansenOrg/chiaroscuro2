import type { Page } from "playwright";

/** Poll observations only. Never retry a click/command that may already have taken effect. */
export async function waitUntil<T>(
  description: string,
  observe: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  let lastError: string | undefined;
  while (Date.now() < deadline) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        observe(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Observation timed out")),
            deadline - Date.now(),
          );
        }),
      ]);
      last = value;
      if (accept(value)) return value;
    } catch (error) {
      lastError = String(error);
    } finally {
      clearTimeout(timer);
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)));
  }
  throw new Error(
    `Timed out waiting for ${description}. Last observation: ${JSON.stringify(last)}. Last error: ${lastError ?? "none"}`,
  );
}

/**
 * Run an action that replaces the page's document, such as clicking Reload, and wait until
 * the new document has loaded. Load states and locators alone can still observe the old one.
 */
export async function waitForNewDocument(
  page: Page,
  replace: () => Promise<unknown>,
  timeoutMs = 5_000,
): Promise<void> {
  const committed = page.waitForEvent("framenavigated", {
    predicate: (frame) => frame === page.mainFrame(),
    timeout: timeoutMs,
  });
  await Promise.all([committed, replace()]);
  await page.waitForLoadState("load", { timeout: timeoutMs });
}
