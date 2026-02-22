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
    async (_electron, { name, payload }) => {
      const hooks = (globalThis as unknown as { __testHooks?: TestHooks }).__testHooks;
      if (!hooks) throw new Error("Test hooks not available — is NODE_ENV=test?");
      return hooks.commandBus.send(name, payload);
    },
    { name, payload },
  );
}
