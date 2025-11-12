import { AerodromeConnector, type AerodromeConnectorOptions } from "./connectors/aerodrome.js";
import { CurveConnector, type CurveConnectorOptions } from "./connectors/curve.js";
import {
  type ConnectorMap,
  type QuoteConnector,
  parseQuoteRequest,
  sortQuotesDescending,
} from "./connectors/base.js";
import { UniswapConnector, type UniswapConnectorOptions } from "./connectors/uniswap.js";

export type {
  QuoteRequest,
  QuoteResult,
  QuoteLeg,
  SwapIntentDefinition,
  ProfitReport,
  LiquidityVenue,
  ChainId,
} from "./types.js";

export { parseQuoteRequest, sortQuotesDescending };

export { AerodromeConnector, CurveConnector, UniswapConnector };

export type { QuoteConnector, ConnectorMap } from "./connectors/base.js";

export interface ConnectorFactoryOptions {
  aerodrome?: AerodromeConnectorOptions;
  uniswap?: UniswapConnectorOptions;
  curve?: CurveConnectorOptions;
}

export function createDefaultConnectors(options: ConnectorFactoryOptions = {}): QuoteConnector[] {
  return [
    new AerodromeConnector(options.aerodrome),
    new UniswapConnector(options.uniswap),
    new CurveConnector(options.curve),
  ];
}

export function createConnectorMap(options?: ConnectorFactoryOptions): ConnectorMap {
  return createDefaultConnectors(options).reduce<ConnectorMap>((acc, connector) => {
    acc[connector.venue] = connector;
    return acc;
  }, {} as ConnectorMap);
}

