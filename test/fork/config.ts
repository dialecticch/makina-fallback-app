import type { Address } from "viem";

/**
 * Fork test fixtures. Blocks are pinned so results are reproducible; the RPCs in FORK_RPC_URL_1 / FORK_RPC_URL_8453
 * must serve historical state at these blocks. Tests fund their own accounts and liquidity.
 *
 * Machine addresses come from https://docs.makina.finance/strategies/deployments and are fixtures only: the app
 * itself never lists Machines in config, it finds them from the factory nonces (src/data/machines.ts).
 */
export const FORK = {
  1: { block: 26_089_500n, port: 18_545, env: "FORK_RPC_URL_1" },
  8453: { block: 51_987_000n, port: 18_546, env: "FORK_RPC_URL_8453" },
} as const;

export type ForkChainId = keyof typeof FORK;

export const ETHEREUM = {
  /** Circle EOA; the test asserts its USDC balance at the fork block before using it. */
  usdcWhale: "0x55FE002aefF02F77364de339a1292923A15844B8" as Address,
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  /** Holds DMG shares at the fork block (view-only test). */
  holder: "0x8e87Caf1FC5a0d4aebe0E0c976b24a3A9e3672C4" as Address,
  machines: {
    DBIT: "0xFCbE132452B6CAA32AdDd4768Db8fA02aF73d841",
    DETH: "0x0447D0aD7FD6a3409B48Ecbb9DDB075C1e11D735",
    DUSD: "0x6b006870C83b1Cd49E766Ac9209f8d68763Df721",
    propSHFmk: "0x2acC8aA53EC354634d0206Aa86F6fe1150b6c46B",
    usdSHFmk: "0x733aBb32544f4D3053a58eD747538c060f559108",
    turboSHFmk: "0x7a3A49042aE1A2020c69552d49BF5E11B666BfBF",
    intMkroywstETH: "0x0FDF9F1920e160ea8Ae267BdE13e725DeF81E5Ee",
    intMksroywstETH: "0x6BE5ea969E18BF4c9DE0A00EC4F226055f46aA7D",
    intMkSrRoyUSDC: "0xFa097420f0e2C72456B361a1eD85172B9ccd8c38",
    DMG: "0xC4fFab8540AC27E40D4e2930517aA711e9C00c5b",
    DQAeETH: "0x165afd0b156355D9D51e9E6Ab317a96787Fb6271",
    DMW: "0x2FEEf245d510A31B242705ff627447Aa9db661E3",
    DCM: "0xd2f644d0418126fFCc8F16840ed5D52aa62fd4EB",
  } satisfies Record<string, Address>,
  /** Strategies with live deposits: these must show non-zero TVL. */
  funded: ["DBIT", "DETH", "DUSD", "DMG"] as const,
};

export const BASE = {
  machines: {
    ySPCXc: "0x47b574313Bf529098e1e55F397bC9D160ba3089c",
    bFeederDCM: "0x91582e8f7684cB41261BB136C691D82b4EcEDe8A",
  } satisfies Record<string, Address>,
};

/** A fresh EOA for flows that should not touch real holders' state. */
export const TEST_ACCOUNT = "0x00000000000000000000000000000000000fa11b" as Address;
