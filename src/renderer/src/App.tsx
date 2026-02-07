import { useEffect } from "react";
import { TitleBar } from "../../features/window-chrome/window-chrome.renderer";
import { subscribeToEvents } from "../../features/window-chrome/window-chrome.store";

export default function App() {
  useEffect(() => {
    return subscribeToEvents(window.chiaroscuro.onEvent);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center">
        <h1 className="text-4xl font-bold">Chiaroscuro</h1>
      </div>
    </div>
  );
}
