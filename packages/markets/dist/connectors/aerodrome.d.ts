import type { QuoteConnector } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";
export interface AerodromeConnectorOptions {
    apiUrl?: string;
}
export declare class AerodromeConnector implements QuoteConnector {
    readonly venue = "aerodrome";
    private readonly options;
    constructor(options?: AerodromeConnectorOptions);
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
