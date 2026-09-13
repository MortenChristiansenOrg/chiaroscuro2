const api = globalThis.chrome;
let renderedUnlock;
api.storage.session.onChanged.addListener(async (changes) => {
  if (changes.unlock) renderedUnlock = (await api.storage.session.get("unlock")).unlock;
});
document.querySelector("#fill").addEventListener("click", async () => {
  try {
    // The worker must observe a write originating in a different context.
    const stateReady = new Promise((resolve) => {
      const listener = (message) => {
        if (message.stateReady) {
          api.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };
      api.runtime.onMessage.addListener(listener);
    });
    const unlock = crypto.randomUUID();
    await api.storage.session.set({ unlock });
    // Deliberately assert at write completion: awaiting the listener here would
    // hide the stale navigation-guard regression this adapter must prevent.
    if (renderedUnlock !== unlock) throw new Error("Navigation would see stale lock state");
    await stateReady;
    const result = await api.runtime.sendMessage({ fill: true });
    document.querySelector("#result").textContent = JSON.stringify(result);
  } catch (error) {
    document.querySelector("#result").textContent = String(error);
  }
});
