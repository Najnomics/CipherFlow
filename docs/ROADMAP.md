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

### Off-Chain (pending)
- Placeholders for listener/solver/executor/explorer services (TypeScript) – not yet implemented.
- Libraries (`libs/encoding`, `intent-registry`, fixtures) still to come.

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

### 4. Off-Chain Services
- ✅ Scaffolding for `cipherflow-listener` package (viem-based block polling).
- ✅ Scaffolding for `cipherflow-solver` package (bootstrap script).
- **cipherflow-listener**: implement intent ingestion (CoW/1inch/API), queue management.
- **cipherflow-solver**: route planner spanning DEX/bridges/CEX, BlockLock encryption submission.
- **cipherflow-executor**: follow reveals, replay swaps, verify outputs, emit metrics.
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
2. Build out the solver/off-chain stack per architecture plan.
3. Add CI automation & coverage gates.
4. Produce final docs/video/demo.

