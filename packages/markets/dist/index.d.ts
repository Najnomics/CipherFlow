import { AerodromeConnector, type AerodromeConnectorOptions } from "./connectors/aerodrome.js";
import { CurveConnector, type CurveConnectorOptions } from "./connectors/curve.js";
import { type ConnectorMap, type QuoteConnector, parseQuoteRequest, sortQuotesDescending } from "./connectors/base.js";
import { UniswapConnector, type UniswapConnectorOptions } from "./connectors/uniswap.js";
export type { QuoteRequest, QuoteResult, QuoteLeg, SwapIntentDefinition, ProfitReport, LiquidityVenue, ChainId, } from "./types.js";
export { parseQuoteRequest, sortQuotesDescending };
export { AerodromeConnector, CurveConnector, UniswapConnector };
export type { QuoteConnector, ConnectorMap } from "./connectors/base.js";
export interface ConnectorFactoryOptions {
    aerodrome?: AerodromeConnectorOptions;
    uniswap?: UniswapConnectorOptions;
    curve?: CurveConnectorOptions;
}
export declare function createDefaultConnectors(options?: ConnectorFactoryOptions): QuoteConnector[];
export declare function createConnectorMap(options?: ConnectorFactoryOptions): ConnectorMap;
