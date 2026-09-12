/**
 * Heuristic Parser for YummyAnime (DLE "animedia" template) and its mirrors.
 */
export class YummyAnimeStrategy {
    canHandle(url, doc) {
        try {
            if (new URL(url).hostname.includes("yummyanime")) return true;
        } catch (e) {
            // Malformed/relative url - fall back to the structural check below.
        }
        return !!doc.querySelector('h1[itemprop="name"]') && !!doc.querySelector(".inner-page__player");
    }

    extract(doc, url) {
        const metadata = {
            title: null,
            mediaType: "movie",
            season: null,
            episode: null,
            year: null
        };

        // 1. Prefer the original/romanized subtitle over the localized Russian
        // title - it matches TMDB search far better (e.g. "Genius Party" vs
        // "Гениальная вечеринка").
        const altTitleEl = doc.querySelector(".inner-page__subtitle");
        const nameTitleEl = doc.querySelector('h1[itemprop="name"]');
        if (altTitleEl && altTitleEl.textContent.trim()) {
            metadata.title = altTitleEl.textContent.trim();
        } else if (nameTitleEl) {
            metadata.title = nameTitleEl.textContent.trim();
        }

        // 2. Release year lives in the "Год выхода:" info row.
        const infoItems = doc.querySelectorAll(".inner-page__list li");
        for (const li of infoItems) {
            const label = li.querySelector("span");
            if (label && label.textContent.includes("Год выхода")) {
                const match = li.textContent.match(/(19|20)\d{2}/);
                if (match) metadata.year = parseInt(match[0], 10);
                break;
            }
        }

        // NOTE: season/episode are NOT extracted here. YummyAnime embeds a
        // third-party Kodik player in a cross-origin <iframe> (kodikplayer.com),
        // and the season/episode <select> UI (.serial-panel) lives inside THAT
        // frame's own document, not on this top-level page. ContentScraper runs
        // its own lightweight watcher inside every frame (see
        // `watchKodikSeasonEpisode` in ContentScraper.js) and pushes season/
        // episode to the background service worker directly; BackgroundController
        // merges it into this same video's heuristics when it arrives.

        return metadata;
    }
}
