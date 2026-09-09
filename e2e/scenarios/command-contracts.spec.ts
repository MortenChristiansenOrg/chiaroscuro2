import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";

test("IPC and HTTP share command validation without allowing invalid mutations", async ({
  appSession: session,
}) => {
  const site = await startSite();
  const http = async (name: unknown, payload?: unknown) => {
    const response = await fetch(`${session.debugUrl}/commands/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, payload }),
    });
    return { status: response.status, body: await response.json() };
  };
  const ipc = (name: string, payload?: unknown) =>
    session.shell.evaluate(
      async ({ name, payload }) => {
        try {
          return { response: await window.chiaroscuro.sendCommand(name, payload) };
        } catch (error) {
          return { error };
        }
      },
      { name, payload },
    );
  try {
    const workspace = await ipc("workspaces:create", {
      name: "Contract workspace",
      color: "blue",
      icon: "W",
    });
    expect(workspace).toHaveProperty("response", expect.any(String));
    const created = await http("tabs:create", { url: `${site.url}/contracts` });
    expect(created.status).toBe(200);
    const tabId = created.body.response;
    const before = await http("tabs:get", { tabId });
    for (const payload of [
      { tabId, url: 42 },
      { tabId, url: "javascript:alert(1)" },
      { tabId, url: `${site.url}/changed`, extra: true },
      { tabId },
    ]) {
      const fromHttp = await http("tabs:navigate", payload);
      expect(fromHttp.status).toBe(400);
      expect(await ipc("tabs:navigate", payload)).toEqual(fromHttp.body);
    }
    expect((await http("tabs:get", { tabId })).body.response.url).toBe(before.body.response.url);
    for (const payload of [null, undefined]) {
      expect(await ipc("settings:get", payload)).toEqual(
        (await http("settings:get", payload)).body,
      );
    }
    expect(await ipc("settings:get", {})).toEqual((await http("settings:get", {})).body);
    expect(await ipc("missing:command", {})).toEqual((await http("missing:command", {})).body);
    const malformed = await fetch(`${session.debugUrl}/commands/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    const noToken = await fetch(`${session.debugUrl}/commands`);
    expect(noToken.status).toBe(401);
    const browserOrigin = await fetch(`${session.debugUrl}/commands`, {
      headers: { Authorization: `Bearer ${session.token}`, Origin: site.url },
    });
    expect(browserOrigin.status).toBe(403);
    const discovery = await session.debug<{
      commands: string[];
      contracts: { name: string; payload: { schema: unknown }; response: { schema: unknown } }[];
    }>("/commands");
    expect(discovery.contracts.map((c) => c.name).sort()).toEqual(discovery.commands.sort());
    expect(
      discovery.contracts.find((c) => c.name === "tabs:navigate")?.payload.schema,
    ).toMatchObject({ required: ["url"], additionalProperties: false });
    const unauthorized = await session.app.evaluate(async ({ BrowserWindow }) => {
      const path = process.getBuiltinModule("path");
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          preload: path.resolve("out/preload/index.js"),
        },
      });
      try {
        await win.loadURL("data:text/html,<h1>Untrusted window</h1>");
        return await win.webContents.executeJavaScript(
          "window.chiaroscuro.sendCommand('tabs:close', {tabId:'missing'}).catch(error => error)",
        );
      } finally {
        win.destroy();
      }
    });
    expect(unauthorized).toMatchObject({ code: "FORBIDDEN" });
    await session.target((t) => t.kind === "tab" && t.tabId === tabId);
    expect((await session.capture("command-contracts")).status).toBe("complete");
  } finally {
    await site.close();
  }
});
