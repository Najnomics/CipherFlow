import type { OnInstallHandler, OnRpcRequestHandler, OnUpdateHandler } from '@metamask/snaps-types';
import { panel, heading, text, divider } from '@metamask/snaps-ui';

type SnapConfig = {
  baseRpcUrl: string;
  intentHubAddress: string;
  settlementEscrowAddress: string;
  blocklockSender: string;
  collateralWei: string;
};

const DEFAULT_CONFIG: SnapConfig = {
  baseRpcUrl: 'https://base-sepolia.g.alchemy.com/v2/',
  intentHubAddress: '0x67E757507436A64988E4ab772BD6ceB2084a335E',
  settlementEscrowAddress: '0x519e5a60Ef57F6EDB57b73fcB3ea1f0AC954829B',
  blocklockSender: '0x82FeD730CbdeC5A2D8724F2e3b316a70A565E27e',
  collateralWei: '10000000000000000'
};

type PreviewParams = {
  intentId?: string;
  amountInWei?: string;
  minAmountOutWei: string;
  maxAmountOutWei?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  gasEstimateWei?: string;
  expectedBlocks?: number;
  bridgeFinalityMinutes?: number;
  slippageBps?: number;
  venue?: string;
};

async function readConfig(): Promise<SnapConfig> {
  const state = (await wallet.request({
    method: 'snap_manageState',
    params: { operation: 'get' }
  })) as SnapConfig | null;

  return {
    ...DEFAULT_CONFIG,
    ...(state ?? {})
  };
}

async function writeConfig(config: SnapConfig): Promise<void> {
  await wallet.request({
    method: 'snap_manageState',
    params: {
      operation: 'update',
      newState: config
    }
  });
}

function renderConfig(config: SnapConfig) {
  return panel([
    heading('CipherFlow Deployments'),
    text(`**IntentHub**: ${config.intentHubAddress}`),
    text(`**SettlementEscrow**: ${config.settlementEscrowAddress}`),
    text(`**BlockLock Sender**: ${config.blocklockSender}`),
    divider(),
    heading('Execution Parameters'),
    text(`RPC URL: ${config.baseRpcUrl}`),
    text(`Solver Collateral (wei): ${config.collateralWei}`)
  ]);
}

function weiToToken(wei: string, decimals = 18): string {
  if (!wei) {
    return '0';
  }
  try {
    const value = BigInt(wei);
    const scale = 10n ** BigInt(decimals);
    const whole = value / scale;
    const fraction = value % scale;
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
    return `${whole.toString()}.${fractionStr}`;
  } catch {
    return wei;
  }
}

function formatEth(wei?: string): string {
  if (!wei) {
    return '0.0000';
  }
  try {
    const value = Number(BigInt(wei)) / 1e18;
    return value.toFixed(4);
  } catch {
    return wei;
  }
}

function estimateSettlementMinutes(params: Pick<PreviewParams, 'expectedBlocks' | 'bridgeFinalityMinutes'>): number {
  const blockTimeSeconds = 2; // Base average block time
  const { expectedBlocks = 0, bridgeFinalityMinutes = 0 } = params;
  const blockMinutes = (expectedBlocks * blockTimeSeconds) / 60;
  return Math.round(blockMinutes + bridgeFinalityMinutes);
}

function buildRiskLines(params: PreviewParams): string[] {
  const risks: string[] = [];

  if (params.bridgeFinalityMinutes && params.bridgeFinalityMinutes > 15) {
    risks.push('Bridge finality may exceed 15 minutes – monitor destination chain availability.');
  } else if (params.bridgeFinalityMinutes && params.bridgeFinalityMinutes > 5) {
    risks.push('Bridge finality medium – expect 5-15 minute confirmation window.');
  }

  if (params.slippageBps && params.slippageBps > 100) {
    risks.push(`High slippage tolerance (${(params.slippageBps / 100).toFixed(2)}%). Consider tightening spread.`);
  }

  if (params.expectedBlocks && params.expectedBlocks > 900) {
    risks.push('Long execution window (>30 min) – intent may be exposed to market drift.');
  }

  if (!risks.length) {
    risks.push('No major risk flags detected for this preview.');
  }

  return risks;
}

function renderPreview(params: PreviewParams) {
  const decimals = params.tokenDecimals ?? 18;
  const symbol = params.tokenSymbol ?? 'TOKEN';

  const minOut = weiToToken(params.minAmountOutWei, decimals);
  const maxOut = params.maxAmountOutWei
    ? weiToToken(params.maxAmountOutWei, decimals)
    : params.slippageBps
    ? (Number(minOut) * (1 + params.slippageBps / 10000)).toFixed(4)
    : minOut;

  const amountIn = params.amountInWei ? weiToToken(params.amountInWei, decimals) : undefined;
  const settlementMinutes = estimateSettlementMinutes(params);
  const gasEth = formatEth(params.gasEstimateWei);
  const riskLines = buildRiskLines(params);

  return panel([
    heading(`Intent Preview ${params.intentId ? `(#${params.intentId})` : ''}`.trim()),
    divider(),
    text(`**Venue**: ${params.venue ?? 'Unknown'}`),
    amountIn ? text(`**Input**: ${amountIn} ${symbol}`) : text(`**Input**: n/a`),
    text(`**Expected Output**: ${minOut} – ${maxOut} ${symbol}`),
    text(`**Gas Estimate**: ~${gasEth} ETH`),
    text(`**Estimated Settlement**: ~${settlementMinutes} minutes`),
    divider(),
    heading('Risk Indicators'),
    ...riskLines.map((line) => text(`• ${line}`))
  ]);
}

export const onInstall: OnInstallHandler = async () => {
  await writeConfig(DEFAULT_CONFIG);
};

export const onUpdate: OnUpdateHandler = async () => {
  const current = await readConfig();
  await writeConfig({
    ...DEFAULT_CONFIG,
    ...current
  });
};

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'cipherflow_getConfig': {
      const config = await readConfig();
      return renderConfig(config);
    }

    case 'cipherflow_setConfig': {
      const params = (request.params ?? {}) as Partial<SnapConfig>;
      const current = await readConfig();
      const next: SnapConfig = {
        ...current,
        ...params
      };
      await writeConfig(next);
      return renderConfig(next);
    }

    case 'cipherflow_getHelp': {
      return panel([
        heading('CipherFlow Snap'),
        text(
          'This snap surfaces deployed CipherFlow contracts and solver configuration directly inside MetaMask.'
        ),
        divider(),
        text(
          'Use `cipherflow_getConfig` to review addresses, or call `cipherflow_setConfig` with `{ intentHubAddress, settlementEscrowAddress, baseRpcUrl, collateralWei }` to update them.'
        ),
        text('You can now safely review reveals and settlements from the CipherFlow dashboard with MetaMask Flask.'),
        text('Preview commitment payloads via `cipherflow_previewCommitment` to display price bands, settlement time and risk notes before signing.')
      ]);
    }

    case 'cipherflow_previewCommitment': {
      const params = (request.params ?? {}) as PreviewParams;
      if (!params.minAmountOutWei) {
        throw new Error('minAmountOutWei is required for previews.');
      }
      return renderPreview(params);
    }

    default:
      throw new Error(`Method ${request.method as string} not found.`);
  }
};

