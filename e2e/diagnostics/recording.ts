import { CommandBus } from "../../src/bus/command-bus";
import { EventBus } from "../../src/bus/event-bus";
import { register, setRecordingEnabled } from "../../src/features/debug-server/recorder";

const events = new EventBus<{ tabs: { tabs: object[] } }>();
register(new CommandBus(), events);
const payload = {
  tabs: Array.from({ length: 100 }, (_, i) => ({
    id: `tab-${i}`,
    url: `https://example.com/${i}`,
    title: `Example tab ${i}`,
    favicon: "https://example.com/favicon.ico",
    workspaceId: "work",
    bookmarked: true,
    lastAccessedAt: Date.now(),
    order: i,
    folderId: null,
  })),
};
for (let run = 0; run < 5; run++) {
  for (const enabled of [true, false]) {
    setRecordingEnabled(enabled);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) events.emit("tabs", payload);
    console.log(
      JSON.stringify({ run, enabled, events: 1000, tabs: 100, ms: performance.now() - start }),
    );
  }
}
