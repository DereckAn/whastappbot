export type Platform = "twitter" | "instagram" | "unknown";

export const PLATFORM_PATTERNS = {
    twitter: /https?:\/\/(twitter\.com|x\.com|t\.co)\/\S+/i,
    instagram: /https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/\S+/i,
};

export function identifyPlatform(url: string): Platform {
    if (PLATFORM_PATTERNS.twitter.test(url)) {
        return "twitter";
    } else if (PLATFORM_PATTERNS.instagram.test(url)) {
        return "instagram";
    } else {
        return "unknown";
    }
}

// URLs de Twitter/X e Instagram en el texto, en orden y sin repetir
export function extractSupportedUrls(text: string): string[] {
    const urls = text.match(/https?:\/\/[^\s]+/g) ?? [];
    return [...new Set(urls.filter((url) => identifyPlatform(url) !== "unknown"))];
}
