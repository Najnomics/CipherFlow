import { AerodromeConnector } from "./connectors/aerodrome.js";
import { CurveConnector } from "./connectors/curve.js";
import { parseQuoteRequest, sortQuotesDescending, } from "./connectors/base.js";
import { UniswapConnector } from "./connectors/uniswap.js";
import { MockBridgeConnector } from "./connectors/mockBridge.js";
export { parseQuoteRequest, sortQuotesDescending };
export { AerodromeConnector, CurveConnector, UniswapConnector, MockBridgeConnector };
export function createDefaultConnectors(options = {}) {
    const connectors = [
        new AerodromeConnector(options.aerodrome),
        new UniswapConnector(options.uniswap),
        new CurveConnector(options.curve),
    ];
    if (options.mockBridge) {
        connectors.push(new MockBridgeConnector(options.mockBridge));
    }
    return connectors;
}
export function createConnectorMap(options) {
    return createDefaultConnectors(options).reduce((acc, connector) => {
        acc[connector.venue] = connector;
        return acc;
    }, {});
}
