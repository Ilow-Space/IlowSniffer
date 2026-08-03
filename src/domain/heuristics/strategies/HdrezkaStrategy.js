/**
 * Heuristic Parser for HDRezka and its mirror domains.
 */
export class HdrezkaStrategy {
    canHandle(url, doc) {
        return !!doc.querySelector(".b-post__origtitle") || !!doc.querySelector(".b-post__title");
    }

    extract(doc, url) {
        const metadata = {
            title: null,
            mediaType: "movie",
            season: null,
            episode: null
        };

        // 1. Extract Exact Original Title (e.g. Cyberpunk: Edgerunners)
        const origTitleEl = doc.querySelector(".b-post__origtitle");
        if (origTitleEl) {
            metadata.title = origTitleEl.textContent.trim();
        } else {
            const altTitle = doc.querySelector(".b-post__title h1");
            if (altTitle) metadata.title = altTitle.textContent.trim();
        }

        // 2. Extract TV Series Sequence Info from URL Hash
        // Catches formats like: #t:19-s:1-e:1
        try {
            const hash = new URL(url).hash;
            const match = hash.match(/s:(\d+)-e:(\d+)/i);

            if (match) {
                metadata.mediaType = "tv";
                metadata.season = parseInt(match[1], 10);
                metadata.episode = parseInt(match[2], 10);
            }
        } catch (e) {
            console.warn("[HdrezkaStrategy] URL parsing failed for sequence parameters.");
        }

        return metadata;
    }
}

export function extractHDRezkaMetadata() {
    let title = "";
    let year = null;
    let mediaType = "movie";

    // 1. Extract Title
    const titleEl = document.querySelector('.b-post__title h1') || document.querySelector('h1');
    if (titleEl) {
        title = titleEl.textContent.trim();
    }

    // 2. Extract Year from HDRezka Info Table
    // Strategy A: Direct link matching /year/YYYY/
    const yearLink = document.querySelector('.b-post__info a[href*="/year/"]');
    if (yearLink) {
        const match = yearLink.href.match(/\/year\/(\d{4})\//) || yearLink.textContent.match(/\b(19\d\d|20\d\d)\b/);
        if (match) year = parseInt(match[1]);
    }

    // Strategy B: Fallback to parsing "Дата выхода" row
    if (!year) {
        const rows = document.querySelectorAll('.b-post__info tr');
        for (const row of rows) {
            if (row.textContent.includes('Дата выхода')) {
                const match = row.textContent.match(/\b(19\d\d|20\d\d)\b/);
                if (match) {
                    year = parseInt(match[1]);
                    break;
                }
            }
        }
    }

    // 3. Detect Media Type (Check if page has season/episode selectors or "сериал" in genre)
    const hasSeasons = !!document.querySelector('.b-simple_episodes__list, .b-series-seasons');
    const genreText = document.querySelector('.b-post__info')?.textContent || "";
    if (hasSeasons || genreText.includes("Сериалы") || genreText.includes("Мультсериалы")) {
        mediaType = "tv";
    }

    return {
        title,
        year,
        mediaType
    };
}