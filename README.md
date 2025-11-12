# CipherFlow Solver Network

## Problem We’re Solving
- Open solver marketplaces leak alpha; copied routes crush profitability.
- Cross-chain treasury moves and service payments still rely on manual operators.
- Bidders in existing auctions see each other’s quotes, encouraging copy trading and frontrunning.
- Treasury managers lack a single pane of glass to audit solver performance or price improvement.

## Our Solution
CipherFlow is an agentic solver network that keeps trading while you sleep.  
We ingest user intents, encrypt solver routes with dcipher’s BlockLock, and reveal them only after the auction closes. Collateral and escrow guarantees keep funds safe, while automation handles cross-chain bridges and settlement.

### Mission & Track Alignment
- **Hackathon track**: Super Solvers (Track B) — sealed-bid auctions, encrypted intents, solver competition visualisation.
- **Core idea**: AI-assisted solver submits BlockLock-encrypted swap routes into a deterministic on-chain auction. Decryption happens after bidding closes, guaranteeing fairness while enabling sophisticated, cross-domain execution.
- **Success criteria**:
  1. Showcase sealed bids using `blocklock-solidity`.
  2. Deliver measurable price improvement over public swap routes.
  3. Present real-time explorer & replayable devnet for judges.

## User Flow (from a trader’s perspective)
```mermaid
graph TD
  subgraph User Journey
    A[Trader submits intent\n(via API/UI)] --> B(IntentHub\ndeploys auction)
    B --> C(Commitment Open\nwindow)
    C --> D{Solver Agents}
    D -->|Encrypt route + collateral| E[BlockLock Network]
    E -->|Reveal key block.number + 1| B
    B --> F[SettlementEscrow\nholds trader funds]
    D --> G[Executor Bot\nruns settlement]
    G --> H[Reveal Explorer\nshows price improvement]
  end
```

## Latest Deployments (Base Sepolia)
| Component            | Address                                      | Tx Hash                                                            |
|---------------------|----------------------------------------------|--------------------------------------------------------------------|
| SettlementEscrow    | `0x519e5a60Ef57F6EDB57b73fcB3ea1f0AC954829B` | `0x76b6125c538f1ead13bcab7bf465b7c41e0950342ead6c49c99e37af720c946b` |
| IntentHub           | `0x67E757507436A64988E4ab772BD6ceB2084a335E` | `0x079d5f05410e8d62f5cd896252273e6f89ee8b9c0dd6422913170603b982b542` |
| BlockLock Sender\*  | `0x82FeD730CbdeC5A2D8724F2e3b316A70A565E27e` | — (pre-existing network deployment)                                |
| Deployer/Admin      | `0xfE04736190e62cB338d89B5906d298C9240D0391` | —                                                                  |

\*Official dcipher BlockLock sender proxy for Base Sepolia.

Full troubleshooting steps are documented in `docs/DEPLOYMENTfix.md`.

## Quick Start
```bash
pnpm install
forge test
```

Generate the onlyswaps harness (optional, requires a fork-capable RPC):
```bash
pnpm --filter @cipherflow/solver fetch:onlyswaps
```

Example Base Sepolia deployment flow (update addresses as needed):
```bash
export BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/<key>
export PRIVATE_KEY=0x<64_hex_key>

# 1. SettlementEscrow
forge create --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --legacy --broadcast \
  src/SettlementEscrow.sol:SettlementEscrow \
  --constructor-args 0xfE04736190e62cB338d89B5906d298C9240D0391

# 2. IntentHub (pass the escrow address from step 1)
forge create --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --legacy --broadcast \
  src/IntentHub.sol:IntentHub \
  --constructor-args \
    0xfE04736190e62cB338d89B5906d298C9240D0391 \
    0x82FeD730CbdeC5A2D8724F2e3b316A70A565E27e \
    0x519e5a60Ef57F6EDB57b73fcB3ea1f0AC954829B

# 3. Grant the IntentHub access to the escrow
cast send 0x519e5a60Ef57F6EDB57b73fcB3ea1f0AC954829B \
  "grantIntentHubRole(address)" 0x67E757507436A64988E4ab772BD6ceB2084a335E \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

## System Architecture
```
┌────────────────────┐      ┌───────────────────────┐
│  Intent Sources     │─RPC─▶│  CipherFlow Listener  │
└────────────────────┘      └───────────────────────┘
          │                           │
          ▼                           ▼
   ┌────────────┐    sealed quote     ┌──────────────────┐
   │  Trader    │────────────────────▶│   IntentHub.sol   │
   └────────────┘    commitment       └──────────────────┘
                                        │        ▲
                                        │        │ decrypt key
                                        ▼        │ (BlockLockSender)
                                ┌────────────────────────┐
                                │  BlockLock Network     │
                                └────────────────────────┘
                                        │
                                        ▼
                          ┌─────────────────────────┐
                          │ CipherFlow Executor Bot │
                          └─────────────────────────┘
                                        │
                                        ▼
                               ┌────────────────┐
                               │ Settlement TX  │
                               └────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │ Reveal Explorer  │
                              └──────────────────┘
```

## Component Breakdown

### On-Chain Contracts (Foundry tests)
1. **`IntentHub` (UUPS-style but standalone in Phase 1)**
   - Accepts solver commitments: `(intentId, solver, ciphertext, condition, collateral)`.
   - Tracks auction state (`Open`, `Revealed`, `Settled`, `Expired`).
   - Enforces decrypt block immediately (`block.number + 1`) for near-instant reveals.
   - Validates decrypted payload hash against commitment when BlockLock callback fires.
   - Releases solver collateral (native) post execution/cancellation.

2. **`SettlementEscrow`**
   - Holds trader funds (native or ERC20) until winning solver executes swap bundle.
   - Allows IntentHub-only disbursements to trader/solver.
   - Pulls ERC20 via `safeTransferFrom`, native via payable entrypoints.

3. **`BlockLockAdapter`**
   - Immutable link to deployed `BlocklockSender` proxy per network.
  - Helper for encoding conditions (`blockHeight`, `deadline`, optional `oracleRoundId`).
  - Emits `BlocklockRequestLinked` for off-chain monitoring.

4. **`IntentTypes` library**
   - Canonical structs/enums for intents, commitments, reveals, and execution receipts.

5. **`VerifierMocks` (future)**
   - Deterministic harness using CoFheTest to simulate ciphertext + decryption key delivery for tests.

### Off-Chain Services (TypeScript / Node)
1. **`cipherflow-listener`**
   - Watches intent sources (CoW intents, 1inch Fusion RFQs, user REST submissions).
   - Normalizes orders into internal `IntentModel` queue.

2. **`cipherflow-solver`**
   - RL-enhanced route planner restricted to swap primitives (DEX, cross-chain AMM, on-chain aggregators).
   - Hackathon deployment executes a real cross-chain path (e.g., Optimism → Base bridge + swap) on testnet; a deterministic mock adapter with the same interface is feature-flagged for unit/invariant tests.
   - Evaluates gas-adjusted payoff, risk (bridge finality), and compliance constraints.
   - Produces deterministic payload (`executionSteps`, `settlementCalldata`, `expectedOut`, `deadline`).
   - Uses `blocklock-js` to encrypt payload + signature → submits to `IntentHub`.

3. **`cipherflow-executor`**
   - Wakes when reveal event fires.
   - Verifies decrypted payload matches stored plan (hash, nonce).
   - Executes the swap bundle atomically (via flashbots/private tx when available).
   - Reports execution proof (tx hash, realized amount) back to on-chain contract & explorer.

4. **`cipherflow-explorer`** (Next.js + ECharts)
   - Streams on-chain events via RPC/WebSocket.
   - Displays per-auction leaderboard, price improvement vs public router, solver reliability score.
   - Surfaces decrypted quote details only after the BlockLock callback for that request ID; unopened bids remain as ciphertext in the UI.
   - Playback mode for demo video.

5. **`ops/guardian`**
   - Monitors BlockLock network health (subscription balance, request status).
   - Auto-refills subscription or falls back to direct funding.

### Shared Libraries
- **`libs/encoding`**: canonical serialization of solver payloads plus Foundry tests that enforce hashing compatibility.
- **`libs/intent-registry.json`**: network-specific config template (BlockLock sender, supported assets, timing defaults).
- **`libs/testing/fixtures`**: reusable ciphertext + key samples, including the onlyswaps token harness captured via the solver script.

## Data Flow
1. **Intent ingestion**: trader signs an `Intent` with execution bounds; posted to `IntentHub` via API or direct tx.
2. **Commitment phase**: solver encrypts route payload (step plan + expectedOut + expiry). Calls `IntentHub.commitToIntent()` sending ciphertext + condition bytes, optionally staking collateral.
3. **Waiting window**: auction remains open until `commitDeadline`. Additional solvers can commit (multi-commit allowed; escrow stores best hash per solver).
4. **Reveal trigger**: decrypt condition is `abi.encode("B", block.number + 1)` so the BlockLock network returns the matching key in the very next block via `IntentHub.receiveBlocklock` (inherits `AbstractBlocklockReceiver`). Each commitment maps to its own BlockLock request ID and receives an isolated key.
5. **Validation**: contract decodes plaintext, checks payload hash matches initial commitment (proof of quote integrity).
6. **Winner selection**: off-chain logic compares decrypted payloads; IntentHub records the winning execution receipt and updates settlement state.
7. **Execution**: off-chain executor receives `CommitmentRevealed` and `ExecutionRecorded` events, replicates payload execution on-chain (DEX swaps, bridging). Settlement proven by posting tx hash and measured output.
8. **Finalization**: if execution succeeds within SLA, escrow releases reward to solver and sends output to trader. Fail/timeout paths mark commitment as expired and keep collateral slashable.
9. **Observability**: explorer reads `IntentCreated`, `CommitmentSubmitted`, `CommitmentRevealed`, `ExecutionRecorded`, `CollateralWithdrawn` logs, updating dashboards.

## Planned Implementations

### Smart Contracts
- `src/IntentHub.sol`
  - Storage layout for intents, commitments, reveals and execution receipts.
  - Integrates `blocklock-solidity` via `BlockLockAdapter`.
  - Permissioned admin for config (auction windows, collateral floor, callback gas limits).
  - Tests: Foundry unit + invariant (ensure no double-withdraw) + fuzz (random reveal delays).

- `src/SettlementEscrow.sol`
  - Supports native + ERC20 settlement.
  - Pull-based payout using permit/EIP-2612 for ERC20 (future).
  - Reentrancy-safe; uses pull pattern for solvers.

- `src/adapters/BlockLockAdapter.sol`
  - Thin wrapper storing BlockLock sender address and subscription ID.
  - Abstracts `_requestBlocklockWithSubscription` vs `_requestBlocklockPayInNative`.

- `src/libraries/IntentTypes.sol`
  - Structs/enums for intents, commitments, reveals, execution receipts.
  - Hashing utilities (EIP-712 domain separators) planned.

- `src/mocks/MockBlockLockReceiver.sol` (planned)
  - Extended from project mock; used to simulate callback in tests.

### Off-Chain Packages
- `apps/solver` (TypeScript)
  - Express API for manual intent submission (demo UI), websockets for explorer.
  - Strategy engine plugging into DEX SDKs (Uniswap, Aerodrome, Curve).
  - Bridge connectors (Across, Synapse or equivalent) for real testnet settlements, plus toggleable mock adapters for deterministic CI.

- `apps/explorer`
  - Next.js, server-side data aggregator, persisting history in SQLite or Supabase.
  - Replay script for demo video.

- `packages/crypto`
  - Wrapper around `blocklock-js` to enforce canonical condition encoding.
  - Fixtures for automated tests (encrypt/decrypt golden vectors).

### DevOps & Tooling
- Foundry profile for contracts (`forge test`, `forge script` deploys).
- pnpm pipeline for TypeScript packages (`pnpm install` vendors BlockLock + future SDKs).
- GitHub Actions for lint/test (optional but improves judging rigour).
- Coverage scripts via `utils/coverage.sh`.

## Security & Assumptions
- BlockLock network assumed honest majority; fallback path if decryption delayed (commitment expires, collateral slashable).
- Each encrypted commitment is isolated—BlockLock returns a unique key per request, so revealing one quote never unlocks competitors.
- Solver execution uses private tx routes to avoid MEV copying; if not available, we sign calldata and prove authenticity via reveal.
- Collateral prevents griefing (e.g., submitting garbage ciphertext to block reveals).
- Permissioned admin limited to pausing auctions & updating subscription; upgradeable contracts audited via automated Foundry differential tests.

## Testing Strategy
- **Unit**: storage layout, commitment validation, escrow accounting, permission checks.
- **Integration**: simulate full auction with `CoFheTest` harness providing test decrypt keys.
- **E2E**: Foundry fork script orchestrating trader → solver → reveal → execution on testnet.
- **Chaos**: random failure injection (missing decrypt key, executor down) to verify fallback logic.

## Milestones & Deliverables
1. **Day 1-2**: Contract scaffolding, subscription wiring, basic commit/reveal pass.
2. **Day 3-4**: Off-chain solver MVP (single DEX route), CLI demo, explorer skeleton.
3. **Day 5**: Integration tests, automated demo script, documentation polish.
4. **Submission**: GitHub repo, README (this file), deployment scripts, demo video, deployed testnet addresses, judge wallet.

## Next Steps
- Extend BlockLock subscription automation (add/remove consumers, auto top-ups) and emit richer analytics events.
- Wire listener/solver/executor packages to real DEX & bridge connectors and integrate BlockLock encryption into the commitment flow.
- Stand up CI automation (forge fmt/test, pnpm lint/test) and publish nightly artifacts.
- Build the explorer UI plus guardian/ops service for subscription health and reveal monitoring.
