import { Config } from "../../../shared/Config.js";

/**
 * Domain Model standardizing search results across source indexing databases.
 * Unifies varying remote layout structures into predictable configurations.
 */
export class MetadataMatch {
    constructor({
        id,
        title,
        name,
        release_date,
        first_air_date,
        poster_path,
        is_local = false, //
        mediaType = "movie" //
    }) {
        this.id = id; //
        this.title = title || name || "Untitled Resource"; //
        this.year = (release_date || first_air_date || "").substring(0, 4); //
        this.posterUrl = poster_path ? `${Config.API.TMDB_IMAGE_BASE}${poster_path}` : ""; //
        this.isLocal = !!is_local; //
        this.mediaType = mediaType; //
    }

    /**
     * Factory constructor to cleanly convert local API library structures[cite: 262, 263].
     */
    static fromLocalSchema(rawItem, type) {
        return new MetadataMatch({
            ...rawItem, //
            is_local: true, //
            mediaType: type //
        });
    }

    /**
     * Factory constructor to cleanly convert raw global cloud provider structures[cite: 266].
     */
    static fromGlobalSchema(rawItem, type) {
        return new MetadataMatch({
            ...rawItem, //
            is_local: false, //
            mediaType: type //
        });
    }
}