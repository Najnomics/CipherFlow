import type { QuoteConnector } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";
export declare class AerodromeConnector implements QuoteConnector {
    readonly venue = "aerodrome";
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
