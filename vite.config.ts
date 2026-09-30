/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { HOST_HEADERS, LOCAL_RPC_HOSTS } from "./src/config/app.ts";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/**
 * What the footer shows: `git describe --tags --always --dirty --abbrev=40` (a tag if any, the full commit, and
 * `-dirty` for uncommitted changes), so a build can be traced to its exact source. `APP_COMMIT` overrides it for
 * builds from a source archive without git.
 */
function commitHash() {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT;
  try {
    return execSync("git describe --tags --always --dirty --abbrev=40", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown (no git)";
  }
}

const localSources = LOCAL_RPC_HOSTS.map((host) => `http://${host}:*`).join(" ");

/**
 * The production Content-Security-Policy. `connect-src` allows any https host because users can add their own RPCs;
 * the app itself only contacts the RPCs in src/config/chains.ts and the ones the user added (CCIP-Read is off).
 * `frame-ancestors` only works as an HTTP header, so it is in HOST_HEADERS (and main.tsx refuses to run framed).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src https: ${localSources}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Adds the CSP to the built index.html only: the dev server needs inline scripts and ws:// for HMR. */
function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

/** `dist/_headers` with HOST_HEADERS: Cloudflare Pages and Netlify apply it as is. Other hosts: see README, Hosting. */
function hostHeadersFile(): Plugin {
  return {
    name: "host-headers-file",
    apply: "build",
    generateBundle() {
      const lines = Object.entries(HOST_HEADERS).map(([name, value]) => `  ${name}: ${value}`);
      this.emitFile({ type: "asset", fileName: "_headers", source: `/*\n${lines.join("\n")}\n` });
    },
  };
}

/**
 * `RELEASE=1 pnpm build` (the release workflow) refuses to build when any `VITE_*` variable is set, so a published
 * bundle never carries someone's RPC keys and is reproducible from the tagged source alone.
 */
function releaseGuard(mode: string): Plugin {
  return {
    name: "release-guard",
    apply: "build",
    configResolved() {
      if (process.env.RELEASE !== "1") return;
      const set = Object.keys(loadEnv(mode, process.cwd(), "VITE_"));
      if (set.length > 0) throw new Error(`Release builds must not set ${set.join(", ")} (.env files or environment).`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [tailwindcss(), react(), contentSecurityPolicy(), hostHeadersFile(), releaseGuard(mode)],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
  server: { headers: HOST_HEADERS },
  preview: { headers: HOST_HEADERS },
  build: {
    // One bundle on purpose (local-first app, no route worth splitting): only warn if it grows a lot.
    chunkSizeWarningLimit: 1_500,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "fork",
          include: ["test/fork/**/*.test.ts"],
          environment: "node",
          globalSetup: ["test/fork/global-setup.ts"],
          // Forks fetch remote state lazily; the redemption flow alone makes hundreds of RPC calls.
          testTimeout: 600_000,
          hookTimeout: 600_000,
          // Files share the two anvil instances and isolate themselves with snapshots, so run them one by one.
          fileParallelism: false,
        },
      },
    ],
  },
}));
