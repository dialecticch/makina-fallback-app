import { describe, expect, it } from "vitest";

import { requestStatus } from "@/lib/derive";

const GRACE = 72n * 3600n;
const base = { id: 5n, lastFinalizedRequestId: 4n, requestTime: 1_000n, finalizationDelay: 100n } as const;

describe("requestStatus", () => {
  it("is claimable once id <= lastFinalizedRequestId", () => {
    expect(requestStatus({ ...base, id: 4n, nowSeconds: 1_001n })).toBe("claimable");
    expect(requestStatus({ ...base, id: 3n, nowSeconds: 1_001n })).toBe("claimable");
  });

  it("waits for the delay, then for the mechanic, then counts as stalled", () => {
    expect(requestStatus({ ...base, nowSeconds: 1_099n })).toBe("waitingForDelay");
    expect(requestStatus({ ...base, nowSeconds: 1_100n })).toBe("awaitingMechanic");
    expect(requestStatus({ ...base, nowSeconds: 1_100n + GRACE })).toBe("awaitingMechanic");
    expect(requestStatus({ ...base, nowSeconds: 1_101n + GRACE })).toBe("stalled");
  });

  it("is plain pending when the request time is unknown", () => {
    expect(requestStatus({ ...base, requestTime: undefined, nowSeconds: 9_999n })).toBe("pending");
  });
});
