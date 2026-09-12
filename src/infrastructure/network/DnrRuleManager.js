import { Config } from "../../shared/Config.js";

/**
 * Infrastructure Service handling Declarative Net Request (DNR) rule orchestration.
 * Safely wraps browser-level security modifications.
 */
export class DnrRuleManager {
    /**
     * Completely clears out runtime dynamic credentials rule sets.
     */
    async clearImpersonationRules() {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [Config.NETWORK.IMPERSONATION_RULE_ID] //
        });
    }

    /**
     * Configures a real-time modification filter to mirror origin request credentials.
     * Strips out forbidden headers to prevent extension engine exceptions.
     */
    async setupImpersonationRules(targetUrl, originalHeaders) {
        if (!originalHeaders || Object.keys(originalHeaders).length === 0) return; //

        try {
            const urlObj = new URL(targetUrl); //
            // Use the base registrable domain (last two labels), not the exact
            // hostname: many CDNs load-balance/redirect across sibling
            // subdomains (e.g. p13.solodcdn.com -> p14.solodcdn.com), and "||"
            // in a DNR urlFilter only matches a domain and ITS subdomains, not
            // sibling subdomains - matching just the captured hostname meant
            // the header impersonation silently stopped applying the moment
            // the CDN redirected to a different edge node.
            const hostParts = urlObj.hostname.split(".");
            const domain = hostParts.length > 2 ? hostParts.slice(-2).join(".") : urlObj.hostname; //

            const forbiddenHeaders = ["content-length", "host", "connection", "accept-encoding"]; //

            const headersToSet = Object.keys(originalHeaders)
                .filter((key) => !forbiddenHeaders.includes(key.toLowerCase())) //
                .map((key) => ({
                    header: key,
                    operation: "set", //
                    value: originalHeaders[key] //
                }));

            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [Config.NETWORK.IMPERSONATION_RULE_ID], //
                addRules: [
                    {
                        id: Config.NETWORK.IMPERSONATION_RULE_ID, //
                        priority: 1, //
                        action: {
                            type: "modifyHeaders", //
                            requestHeaders: headersToSet
                        },
                        condition: {
                            urlFilter: `||${domain}`, //
                            resourceTypes: ["xmlhttprequest", "media", "other"] //
                        }
                    }
                ]
            });
        } catch (error) {
            console.error("[DNR Rule Manager] Failed to register network interception rules:", error); //
        }
    }
}