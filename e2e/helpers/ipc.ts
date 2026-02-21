import type { ElectronApplication } from "playwright";

interface TestHooks {
  commandBus: { send: (n: string, p: unknown) => Promise<unknown> };
}

/**
 * Send a command to the main process via test hooks.
 * Requires NODE_ENV=test so __testHooks is exposed.
 */
export async function sendCommand(
  app: ElectronApplication,
  name: string,
  payload: unknown,
): Promise<unknown> {
  return app.evaluate(
    async ({ __testHooks }: { __testHooks?: TestHooks }, { name, payload }) => {
      if (!__testHooks) throw new Error("Test hooks not available — is NODE_ENV=test?");
      return __testHooks.commandBus.send(name, payload);
    },
    { name, payload },
  );
}
