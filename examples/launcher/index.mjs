#!/usr/bin/env node
/**
 * MGG — reference launcher client.
 *
 * Demonstrates exactly how a custom Minecraft launcher integrates:
 *   1. authenticate a user (device-code flow, or an API key)
 *   2. list the servers they can access
 *   3. fetch live connection info (ip:port + status)
 *   4. (optionally) start a sleeping server and wait until it's joinable
 *   5. print the command a launcher would use to auto-join
 *
 * Zero dependencies — uses Node's built-in fetch (Node 18+).
 *
 * Usage:
 *   MGG_URL=http://localhost:3000 node index.mjs            # device-code login
 *   MGG_URL=... MGG_TOKEN=aeth_... node index.mjs --start
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const BASE = (process.env.MGG_URL || "http://localhost:3000").replace(/\/$/, "");
const ARG_START = process.argv.includes("--start");

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Device-code login: show a code, poll until the user approves it in the panel. */
async function deviceLogin() {
  const { data: start } = await api("/api/v1/auth/device/start", { method: "POST" });
  console.log("\n────────────────────────────────────────────");
  console.log("  Sign in to MGG");
  console.log(`  1. open:  ${start.verification_uri}`);
  console.log(`  2. enter: ${start.user_code}`);
  console.log("────────────────────────────────────────────\n");
  console.log("Waiting for approval…");

  const deadline = Date.now() + start.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep((start.interval || 5) * 1000);
    const { status, data } = await api("/api/v1/auth/device/poll", {
      method: "POST",
      body: { device_code: start.device_code },
    });
    if (status === 200) {
      console.log(`✓ Signed in as ${data.profile?.name}\n`);
      return data.access_token;
    }
    if (status !== 202) throw new Error(data?.error || "authorization failed");
    process.stdout.write(".");
  }
  throw new Error("login timed out");
}

async function main() {
  const token = process.env.MGG_TOKEN || (await deviceLogin());

  const me = await api("/api/v1/auth/me", { token });
  if (me.status !== 200) throw new Error(me.data?.error || "auth failed");
  console.log(`Hello, ${me.data.name} — ${me.data.servers_count} server(s) available.\n`);

  const { data: list } = await api("/api/v1/client", { token });
  if (!list.servers?.length) {
    console.log("No servers on this account. Create one in the panel first.");
    return;
  }
  list.servers.forEach((s, i) => {
    console.log(`  [${i}] ${s.name}  (${s.game})  ${s.state.toUpperCase().padEnd(9)} ${s.address ?? ""}`);
  });

  const rl = readline.createInterface({ input, output });
  const pick = Number((await rl.question("\nPick a server # to join (default 0): ")) || "0");
  rl.close();
  const server = list.servers[pick] ?? list.servers[0];

  let conn = (await api(`/api/v1/client/servers/${server.id}/connection`, { token })).data;
  console.log(`\n${server.name} → ${conn.state}`);

  if (conn.state !== "running" && ARG_START) {
    console.log("Starting the server…");
    await api(`/api/v1/client/servers/${server.id}/power`, { method: "POST", token, body: { signal: "start" } });
    const until = Date.now() + 120000;
    while (Date.now() < until && conn.state !== "running") {
      await sleep(4000);
      conn = (await api(`/api/v1/client/servers/${server.id}/connection`, { token })).data;
      process.stdout.write(`  …${conn.state}\r`);
    }
    console.log("");
  }

  if (conn.state === "running") {
    console.log(`\n✓ Ready to join: ${conn.address}`);
    if (conn.players) console.log(`  players: ${conn.players.online}/${conn.players.max}`);
    console.log("\nA launcher would now spawn Minecraft, e.g.:");
    console.log(`  minecraft --server ${conn.host} --port ${conn.port}\n`);
  } else {
    console.log(`\nServer is "${conn.state}". Re-run with --start to wake it, or start it from the panel.\n`);
  }
}

main().catch((e) => {
  console.error("\n✗", e.message);
  process.exit(1);
});
