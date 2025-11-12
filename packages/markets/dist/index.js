import { AerodromeConnector } from "./connectors/aerodrome.js";
import { CurveConnector } from "./connectors/curve.js";
import { parseQuoteRequest, sortQuotesDescending, } from "./connectors/base.js";
import { UniswapConnector } from "./connectors/uniswap.js";
export { parseQuoteRequest, sortQuotesDescending };
export { AerodromeConnector, CurveConnector, UniswapConnector };
export function createDefaultConnectors() {
    return [new AerodromeConnector(), new UniswapConnector(), new CurveConnector()];
}
export function createConnectorMap() {
    return createDefaultConnectors().reduce((acc, connector) => {
        acc[connector.venue] = connector;
        return acc;
    }, {});
}
