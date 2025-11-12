import type { QuoteConnector } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";
export interface UniswapConnectorOptions {
    apiUrl?: string;
}
export declare class UniswapConnector implements QuoteConnector {
    readonly venue = "uniswap";
    private readonly options;
    constructor(options?: UniswapConnectorOptions);
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
