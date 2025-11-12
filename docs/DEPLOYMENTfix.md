# Deployment Fix Notes

## What Broke

- **Config format drift** – the repo still used the legacy `[broadcast]` table. Foundry 1.4+ expects profile-scoped keys (for example `[profile.default]` with `broadcast = "broadcast"`). Mixing the old section with the new key triggered first “unknown section” warnings and eventually a “duplicate key” parse error.
- **Lingering environment overrides** – previous attempts exported `FOUNDRY_BROADCAST`, `FOUNDRY_AUTO_BROADCAST`, and `FOUNDRY_FORCE_BROADCAST`. Even after dropping the CLI flags, those env vars forced Foundry into dry-run mode.

Together, these caused `forge create` to either simulate forever or refuse to parse the config.

## How We Fixed It

1. Ran `forge config --fix` so Foundry rewrote the TOML using the new schema and removed the stray `[profile.default.broadcast]` table.
2. Confirmed `[profile.default]` now contains `broadcast = "broadcast"` (no duplicate sections).
3. Cleared the environment overrides in the shell:
   ```bash
   unset FOUNDRY_BROADCAST
   unset FOUNDRY_AUTO_BROADCAST
   unset FOUNDRY_FORCE_BROADCAST
   ```
4. Exported the deployer key locally:
   ```bash
   export PRIVATE_KEY=0x<your_64_hex_key>
   ```

## Command That Finally Worked

```bash
forge create --rpc-url https://base-sepolia.g.alchemy.com/v2/j0O7jiy5YQ700J97aerquWdUVZ6dihW5 \
  --private-key $PRIVATE_KEY \
  --legacy --broadcast \
  src/SettlementEscrow.sol:SettlementEscrow \
  --constructor-args 0xfe04736190e62cb338d89b5906d298c9240d0391
```

Deployment result:

- **Deployer**: `0xfE04736190e62cB338d89B5906d298C9240D0391`
- **Contract**: `0x519e5a60Ef57F6EDB57b73fcB3ea1f0AC954829B`
- **Tx hash**: `0x76b6125c538f1ead13bcab7bf465b7c41e0950342ead6c49c99e37af720c946b`

With the config cleaned up and the env vars cleared, subsequent deployments can reuse the same command without dropping back into dry-run mode.

