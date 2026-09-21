const api = globalThis.chrome;
const tabsAtStartup = api.tabs;
let activeTabId;
api.tabs.onActivated.addListener(({ tabId }) => {
  activeTabId = tabId;
});
api.storage.session.onChanged.addListener((changes) => {
  if (changes.unlock?.newValue) void api.runtime.sendMessage({ stateReady: true });
});
api.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.ready) {
    respond("ready");
    return;
  }
  if (!message.fill) return;
  let stage = "query",
    queriedTab;
  (async () => {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    queriedTab = tab;
    stage = "frames";
    const frames = await api.webNavigation.getAllFrames({ tabId: tab.id });
    stage = "inject";
    await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        document.querySelector("#username").value = location.pathname.slice(1);
        document.querySelector("#password").value = "fixture-only";
      },
    });
    stage = "storage";
    const { fills = 0 } = await api.storage.local.get("fills");
    // Also exercise native writes originating in the worker.
    await api.storage.local.set({ fills: fills + 1 });
    respond({
      tabId: tab.id,
      activeTabId,
      fills: fills + 1,
      frames: frames.length,
      bindingsRetained: api.tabs === tabsAtStartup,
    });
  })().catch((error) => respond({ error: String(error), stage, queriedTab }));
  return true;
});

// Exercise browser command delivery through native scripting, including child frames.
api.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "fill" || !(await api.storage.session.get("unlock")).unlock) return;
  const frames = await api.webNavigation.getAllFrames({ tabId: tab.id });
  for (const frame of frames) {
    if (!frame.url.startsWith("http://127.0.0.1:")) continue;
    await api.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frame.frameId] },
      func: () => {
        const field = document.querySelector("#password");
        if (field) field.value = "command-fixture";
      },
    });
  }
});
