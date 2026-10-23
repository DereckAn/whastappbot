import { extractSupportedUrls } from "../downloader/parser.js";

export interface ChatLink {
  url: string;
  sender: string | null;
  date: string | null;
  time: string | null;
}

// Cabecera de mensaje: iOS "[22/10/26, 14:03:11] Ana: …" o Android "22/10/26, 14:03 - Ana: …"
const HEADER = /^\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?\]?\s*-?\s*([^:]+?):\s/i;

// Links de X/Instagram de un chat exportado, en orden y sin repetir, con quién y cuándo los mandó.
// Las líneas sin cabecera son continuación del mensaje anterior.
export function parseChatExport(text: string): { lines: number; links: ChatLink[] } {
  const lines = text.replace(/[‎‏‪-‮]/g, "").split(/\r?\n/);
  const seen = new Set<string>();
  const links: ChatLink[] = [];
  let current: Omit<ChatLink, "url"> = { sender: null, date: null, time: null };
  for (const line of lines) {
    const m = HEADER.exec(line);
    if (m) current = { date: m[1]!, time: m[2]!, sender: m[3]!.trim() };
    for (const url of extractSupportedUrls(line)) {
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({ url, ...current });
    }
  }
  return { lines: lines.length, links };
}
