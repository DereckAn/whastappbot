import path from "path";
import { existsSync } from "fs";
import { config } from "../config.js";
import { groupStats, listDownloads } from "../storage/db.js";
import { IG_COOKIE, X_COOKIE } from "../scripts/setup-cookies.js";
import { botState } from "./state.js";
import page from "./index.html";

const DOWNLOADS_ROOT = path.resolve(config.downloadsDir);

function status() {
  const stats = new Map(groupStats().map((s) => [s.group_name, s]));
  return {
    connection: botState.connection,
    startedAt: botState.startedAt,
    groups: config.monitoredGroups.map((name) => ({
      name,
      files: stats.get(name)?.files ?? 0,
      last: stats.get(name)?.last ?? null,
    })),
    // Solo datos no sensibles: nunca contenido de cookies ni tokens
    settings: {
      monitoredGroups: config.monitoredGroups,
      downloadsDir: DOWNLOADS_ROOT,
      galleryDLPath: config.galleryDLPath,
      gdriveEnabled: config.gdriveEnabled,
      instagramCookies: existsSync(IG_COOKIE),
      twitterCookies: existsSync(X_COOKIE),
      logLevel: config.logLevel,
    },
  };
}

export function startWebServer(): void {
  const server = Bun.serve({
    hostname: config.uiHost,
    port: config.uiPort,
    routes: {
      "/": page,
      "/api/status": () => Response.json(status()),
      "/api/activity": () =>
        Response.json({
          active: [...botState.active].map(([url, group]) => ({ url, group })),
          events: botState.events,
        }),
      "/api/downloads": (req) => {
        const params = new URL(req.url).searchParams;
        const limit = Math.min(Number(params.get("limit")) || 60, 500);
        return Response.json(listDownloads(params.get("group"), limit));
      },
      "/media": async (req) => {
        // Solo archivos dentro de DOWNLOADS_DIR (evita ../)
        const full = path.resolve(new URL(req.url).searchParams.get("path") ?? "");
        if (!full.startsWith(DOWNLOADS_ROOT + path.sep)) return new Response("Forbidden", { status: 403 });
        const file = Bun.file(full);
        if (!(await file.exists())) return new Response("Not found", { status: 404 });
        // Safari solo reproduce video si el servidor responde Range con 206
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.get("range") ?? "");
        if (!range) return new Response(file);
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
        return new Response(file.slice(start, end + 1), {
          status: 206,
          headers: { "Content-Range": `bytes ${start}-${end}/${file.size}`, "Accept-Ranges": "bytes", "Content-Type": file.type },
        });
      },
    },
    fetch: () => new Response("Not found", { status: 404 }),
  });
  console.log(`✓ Dashboard en ${server.url}`);
}
