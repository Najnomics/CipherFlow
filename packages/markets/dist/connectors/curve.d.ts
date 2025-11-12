import type { QuoteConnector } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";
export declare class CurveConnector implements QuoteConnector {
    readonly venue = "curve";
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
