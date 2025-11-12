import { AerodromeConnector } from "./connectors/aerodrome.js";
import { CurveConnector } from "./connectors/curve.js";
import {
  type ConnectorMap,
  type QuoteConnector,
  parseQuoteRequest,
  sortQuotesDescending,
} from "./connectors/base.js";
import { UniswapConnector } from "./connectors/uniswap.js";

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

export function createDefaultConnectors(): QuoteConnector[] {
  return [new AerodromeConnector(), new UniswapConnector(), new CurveConnector()];
}

export function createConnectorMap(): ConnectorMap {
  return createDefaultConnectors().reduce<ConnectorMap>((acc, connector) => {
    acc[connector.venue] = connector;
    return acc;
  }, {} as ConnectorMap);
}

