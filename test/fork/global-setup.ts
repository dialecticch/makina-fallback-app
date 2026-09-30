import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { TestProject } from "vitest/node";

import { FORK } from "./config";

declare module "vitest" {
  export interface ProvidedContext {
    forkUrls: Record<string, string>;
    forkSkip: string;
  }
}

function findAnvil(): string | undefined {
  const fromEnv = process.env.ANVIL_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    return execFileSync("which", ["anvil"], { encoding: "utf8" }).trim() || undefined;
  } catch {
    // foundryup's default install location, for shells that do not have it on PATH.
    const fallback = path.join(homedir(), ".foundry", "bin", "anvil");
    return existsSync(fallback) ? fallback : undefined;
  }
}

async function waitForRpc(url: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`anvil at ${url} did not start within ${timeoutMs / 1000}s`);
}

/**
 * Spawns one anvil fork per chain at the pinned blocks, so fork tests are reproducible. If the RPC variables or the
 * anvil binary are missing, the whole suite is skipped with one message instead of failing.
 */
export default async function setup(project: TestProject) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the environment (CI secrets).
  }

  const anvil = findAnvil();
  const missing = Object.values(FORK)
    .map((f) => f.env)
    .filter((name) => !process.env[name]);
  const skip = !anvil
    ? "anvil not found (install Foundry or set ANVIL_PATH)"
    : missing.length > 0
      ? `${missing.join(" and ")} not set`
      : "";

  if (skip) {
    console.warn(`\n[fork tests] Skipping the fork suite: ${skip}.\n`);
    project.provide("forkSkip", skip);
    project.provide("forkUrls", {});
    return;
  }

  const processes: ChildProcess[] = [];
  const urls: Record<string, string> = {};
  for (const [chainId, fork] of Object.entries(FORK)) {
    const child = spawn(
      anvil!,
      [
        "--fork-url",
        process.env[fork.env]!,
        "--fork-block-number",
        fork.block.toString(),
        "--port",
        String(fork.port),
        "--auto-impersonate",
        "--silent",
      ],
      { stdio: "ignore" },
    );
    processes.push(child);
    urls[chainId] = `http://127.0.0.1:${fork.port}`;
  }
  try {
    await Promise.all(Object.values(urls).map((url) => waitForRpc(url)));
  } catch (error) {
    for (const p of processes) p.kill();
    throw error;
  }

  project.provide("forkSkip", "");
  project.provide("forkUrls", urls);
  return () => {
    for (const p of processes) p.kill();
  };
}
