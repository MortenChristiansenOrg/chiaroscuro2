#!/usr/bin/env node
// Two-hop CDP proxy for WSL2 NAT mode.
//
// Problem: Electron on Windows binds CDP to 127.0.0.1:9222.
//          WSL2's 127.0.0.1 is a different machine — can't reach it.
//
// Solution:
//   Hop 1 (Windows): node relay on 0.0.0.0:9223 → 127.0.0.1:9222
//   Hop 2 (WSL):     node relay on 127.0.0.1:9222 → <windows-ip>:9223
//
// Result: WSL's 127.0.0.1:9222 reaches Electron's CDP.
//
// Usage: node cdp-proxy.mjs
//   Starts both hops. Ctrl-C to stop.

import { execSync, spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";

const CDP_PORT = Number.parseInt(process.env.CHIAROSCURO_DEBUG_PORT || "9222", 10);
const RELAY_PORT = CDP_PORT + 1;

// Detect Windows host IP from WSL default gateway
function getWindowsIP() {
  const route = execSync("ip route show default", { encoding: "utf8" });
  const match = route.match(/via\s+([\d.]+)/);
  return match?.[1] ?? "172.30.192.1";
}

const winIP = getWindowsIP();

// --- Hop 1: Windows-side relay (0.0.0.0:9223 → 127.0.0.1:9222) ---
const winRelayCode = [
  `const s=require('net').createServer(c=>{`,
  `const t=require('net').createConnection(${CDP_PORT},'127.0.0.1',()=>{c.pipe(t);t.pipe(c)});`,
  `t.on('error',()=>c.destroy());c.on('error',()=>t.destroy())});`,
  `s.listen(${RELAY_PORT},'0.0.0.0',()=>console.log('win-relay:${RELAY_PORT}->127.0.0.1:${CDP_PORT}'))`,
].join("");

const winRelay = spawn("powershell.exe", ["-NoProfile", "-Command", `node -e "${winRelayCode}"`], {
  stdio: ["ignore", "pipe", "pipe"],
});

winRelay.stdout.on("data", (d) => process.stdout.write(`[win] ${d}`));
winRelay.stderr.on("data", (d) => process.stderr.write(`[win-err] ${d}`));

// --- Hop 2: WSL-side relay (127.0.0.1:9222 → <winIP>:9223) ---
await new Promise((resolve) => setTimeout(resolve, 1500));

const wslRelay = createServer((client) => {
  const target = createConnection(RELAY_PORT, winIP, () => {
    client.pipe(target);
    target.pipe(client);
  });
  target.on("error", () => client.destroy());
  client.on("error", () => target.destroy());
});

wslRelay.listen(CDP_PORT, "127.0.0.1", () => {
  console.log(`[wsl] relay: 127.0.0.1:${CDP_PORT} -> ${winIP}:${RELAY_PORT}`);
  console.log(`[ok]  CDP reachable at http://127.0.0.1:${CDP_PORT}`);
});

wslRelay.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[wsl] Port ${CDP_PORT} already in use — proxy may already be running`);
  } else {
    console.error(`[wsl] ${err.message}`);
  }
  winRelay.kill();
  process.exit(1);
});

process.on("SIGINT", () => {
  winRelay.kill();
  wslRelay.close();
  process.exit();
});
