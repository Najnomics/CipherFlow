import { AerodromeConnector } from "./connectors/aerodrome.js";
import { CurveConnector } from "./connectors/curve.js";
import { parseQuoteRequest, sortQuotesDescending, } from "./connectors/base.js";
import { UniswapConnector } from "./connectors/uniswap.js";
export { parseQuoteRequest, sortQuotesDescending };
export { AerodromeConnector, CurveConnector, UniswapConnector };
export function createDefaultConnectors(options = {}) {
    return [
        new AerodromeConnector(options.aerodrome),
        new UniswapConnector(options.uniswap),
        new CurveConnector(options.curve),
    ];
}
export function createConnectorMap(options) {
    return createDefaultConnectors(options).reduce((acc, connector) => {
        acc[connector.venue] = connector;
        return acc;
    }, {});
}
