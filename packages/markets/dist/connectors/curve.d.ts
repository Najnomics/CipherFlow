import type { QuoteConnector } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";
export interface CurveConnectorOptions {
    apiUrl?: string;
}
export declare class CurveConnector implements QuoteConnector {
    readonly venue = "curve";
    private readonly options;
    constructor(options?: CurveConnectorOptions);
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
