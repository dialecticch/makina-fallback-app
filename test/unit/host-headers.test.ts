import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HOST_HEADERS } from "@/config/app";

describe("host headers", () => {
  it("vercel.json sends exactly HOST_HEADERS on every path", () => {
    const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    expect(vercel.headers).toHaveLength(1);
    expect(vercel.headers[0]!.source).toBe("/(.*)");
    expect(Object.fromEntries(vercel.headers[0]!.headers.map((h) => [h.key, h.value]))).toEqual(HOST_HEADERS);
  });
});
