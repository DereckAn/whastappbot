export type Platform = "twitter" | "instagram" | "unknown";

export function identifyPlatform(url: string): Platform {
    if (/https?:\/\/(twitter\.com|x\.com|t\.co)\/\S+/i.test(url)) {
        return "twitter";
    } else if (/https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/\S+/i.test(url)) {
        return "instagram";
    } else {
        return "unknown";
    }
}