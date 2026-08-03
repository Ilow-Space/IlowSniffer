import { HdrezkaStrategy } from "./strategies/HdrezkaStrategy.js";

/**
 * Orchestrator for domain-specific DOM metadata extraction.
 */
export class MetadataHeuristicsEngine {
    /**
     * Registry of all active ingestion strategies.
     */
    static getStrategies() {
        return [
            new HdrezkaStrategy()
            // Add future strategies here (e.g., NetflixStrategy, YoutubeStrategy)
        ];
    }

    /**
     * Iterates through available strategies and applies the first valid match.
     */
    static extractMetadata(document, url) {
        const strategies = this.getStrategies();

        for (const strategy of strategies) {
            if (strategy.canHandle(url, document)) {
                try {
                    const data = strategy.extract(document, url);
                    return data;
                } catch (e) {
                    console.error(`[Heuristics Engine] Strategy ${strategy.constructor.name} crashed:`, e);
                }
            }
        }

        return null; // Return null if no heuristic strategy recognizes the page
    }
}