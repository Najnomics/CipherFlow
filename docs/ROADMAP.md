# CipherFlow Roadmap

## Current Progress

### On-Chain (solidity)
- ✅ Core contracts scaffolded with Foundry: `IntentHub`, `SettlementEscrow`, adapter, and shared types.
- ✅ Deposits support native and ERC20 flows, including EIP-2612 permits and collateral tracking.
- ✅ Commitment flow integrated with BlockLock harness for sealed bids and reveal callbacks.
- ✅ Treasury slot / admin-configurable collateral slashing, plus native & ERC20 settlement distribution.
- ✅ BlockLock subscription initialization + gating so commitments require funded subscription.
- ✅ Foundry tests cover commit→reveal, slashing, settlement, and escrow permit logic.

### Tooling
- ✅ Foundry + pnpm scaffolding, remappings, package scripts.
- ✅ Unit tests run via `forge test` (CI integration pending).
- ✅ Project README updated with architecture plan.
- ✅ All solidity dependencies pulled via pnpm (`node_modules`) instead of git submodules.
- ✅ Token snapshot script (`pnpm --filter @cipherflow/solver fetch:onlyswaps`) forks a live RPC, captures
      `TokenMappingAdded` events, and writes harness data under `libs/testing/harness/` while enforcing 1:1 token mappings.

### Off-Chain
- ✅ `@cipherflow/markets` workspace published with Aerodrome/Uniswap/Curve connector stubs.
- ✅ Solver route planner scaffolding (profit report, gas-aware scoring) + Vitest smoke test.
- ✅ Executor service bootstrap reusing connector map with logging + Vitest smoke test.
- Placeholders for listener/explorer services (TypeScript) – integration still pending.

## Remaining Scope

### 1. On-Chain Enhancements
- **IntentHub**
  - Subscription setup & management for BlockLock (create/fund/add consumer).
  - Enhanced risk controls (price threshold checks via oracle feeds, optional).
  - Admin ops to pause or reconfigure solver collateral profiles.
  - Outcome metrics emitter for off-chain analytics.
- **SettlementEscrow**
  - Additional token distribution features (pull-based solver claims, optional streaming).
  - Collateral slashing events tied to performance metrics.

### 2. Testing & QA
- Benchmark native vs ERC20 flows across success/failure scenarios.
- Add invariant/fuzz tests for collateral accounting and deadline enforcement.
- Construct integration harness (possibly using CoFheTest) for multi-commit staging.
- Coverage report + lint integration (Foundry profile + scripts).

### 3. Shared Libraries
- ✅ Implemented `libs/encoding` for canonical payload hash/decoding + Foundry tests.
- ✅ Published `libs/intent-registry.json` with initial network & asset configuration template.
- ✅ Added `libs/testing/fixtures` for reusable ciphertext + key samples.
- ✅ Added `packages/markets` connector toolkit (stubs today, production integrations pending).

### 4. Off-Chain Services
- ✅ Scaffolding for `cipherflow-listener` package (viem-based block polling).
- ✅ Scaffolding for `cipherflow-solver` package with mock planner + tests.
- ✅ Scaffolding for `cipherflow-executor` package with mock execution path + tests.
- **cipherflow-listener**: implement intent ingestion (CoW/1inch/API), queue management.
- **cipherflow-solver**: replace stub connectors with live Aerodrome/Uniswap/Curve + bridge fees; wire BlockLock encryption + commitment submission.
- **cipherflow-executor**: hook into on-chain reveals, broadcast settlement transactions via configured relays.
- **cipherflow-explorer**: Next.js UI + backend aggregator with reveal playback.
- **ops/guardian**: subscription balance monitoring, top-up automation, fallback to direct funding.

### 5. DevOps
- CI pipeline for `forge fmt/lint/test`, pnpm packages, coverage thresholds.
- Deployment scripts & environment templates for testnet launches.
- Potential bundler for releasing contract artifacts & addresses.

### 6. Documentation & Demo
- Expand README/Docs with deployment instructions, config guides.
- Prepare demo script or live environment for submission.
- Integrate Metamask Snap (post-MVP) to surface reveals in-wallet.

## Next Steps
1. Extend BlockLock subscription flows (auto top-ups, add consumer list) & add remaining admin controls.
2. Replace off-chain stub connectors with real pricing/bridge integrations and connect solver↔listener↔executor flows.
3. Add CI automation & coverage gates (Forge, pnpm workspace tests, lint).
4. Produce final docs/video/demo.

