import path from "path";
import { existsSync, statSync, statfsSync } from "fs";
import { config } from "../config.js";
import { groupStats, listDownloads, type DownloadRow } from "../storage/db.js";
import { BROWSERS, IG_COOKIE, X_COOKIE, exportBrowserCookies, fromRepo, saveUploadedCookies } from "../scripts/setup-cookies.js";
import { botState, finishSetup } from "./state.js";
// @ts-ignore: generador QR que ya trae qrcode-terminal (sin tipos)
import QRCode from "qrcode-terminal/vendor/QRCode";
import page from "./index.html";
import setupPage from "./setup.html";

const DOWNLOADS_ROOT = path.resolve(config.downloadsDir);
const DRIVE_CONFIGURED = config.gdriveEnabled; // valor del .env antes de que el usuario elija
const MAX_COOKIE_BYTES = 2 * 1024 * 1024;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const fileSize = (file: string) => {
  try {
    return statSync(file).size;
  } catch {
    return null; // borrado del disco
  }
};

// Archivos de la galería con tipo y tamaño en disco
// ponytail: filtra en memoria y hace stat de cada archivo; pasar a SQL si la biblioteca llega a ~100k
function mediaRows(params: URLSearchParams) {
  return listDownloads(params.get("group"), params.get("q")?.trim() || null).map((r: DownloadRow) => ({
    ...r,
    kind: VIDEO_EXT.test(r.file_path) ? ("video" as const) : ("photo" as const),
    size: fileSize(r.file_path),
  }));
}

const TYPE_FILTERS: Record<string, (r: ReturnType<typeof mediaRows>[number]) => boolean> = {
  all: () => true,
  photo: (r) => r.kind === "photo",
  video: (r) => r.kind === "video",
  carousel: (r) => r.parts > 1,
  missing: (r) => r.size === null,
};

function stats(params: URLSearchParams) {
  const rows = mediaRows(params);
  const count = (type: string) => rows.filter(TYPE_FILTERS[type]!).length;
  const bytes = (kind: string) => rows.reduce((n, r) => n + (r.kind === kind ? r.size ?? 0 : 0), 0);
  return {
    total: rows.length,
    photo: count("photo"),
    video: count("video"),
    carousel: count("carousel"),
    missing: count("missing"),
    bytes: { photo: bytes("photo"), video: bytes("video") },
  };
}

function diskFree(): number | null {
  try {
    const s = statfsSync(DOWNLOADS_ROOT);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

// Fecha de modificación del archivo de cookies (null si no existe)
const modifiedAt = (file: string) => (existsSync(file) ? statSync(file).mtime.toISOString() : null);

function status() {
  const stats = new Map(groupStats().map((s) => [s.group_name, s]));
  return {
    phase: botState.phase,
    connection: botState.connection,
    me: botState.me,
    diskFree: diskFree(),
    qrVersion: botState.qr ? botState.qrVersion : null,
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
      gdriveConfigured: DRIVE_CONFIGURED,
      instagramCookies: modifiedAt(IG_COOKIE),
      twitterCookies: modifiedAt(X_COOKIE),
      gdriveFolderId: config.gdriveRootFolderId ?? null,
      logLevel: config.logLevel,
      browsers: BROWSERS,
    },
  };
}

function qrSvg(text: string): string {
  const qr = new QRCode(-1, 1); // 1 = nivel de corrección L
  qr.addData(text);
  qr.make();
  const n: number = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// Ejecuta un paso de configuración y devuelve { ok } o { error } a la página
async function setupStep(req: Request, step: () => unknown): Promise<Response> {
  // Otra web abierta en el navegador no puede enviar formularios aquí
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  if (botState.phase !== "setup") return Response.json({ error: "El bot ya arrancó" }, { status: 409 });
  try {
    await step();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

async function readUpload(form: { get(name: string): unknown }, field: string): Promise<string | null> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_COOKIE_BYTES) throw new Error(`${file.name} es demasiado grande`);
  return file.text();
}

export function startWebServer(): string {
  const server = Bun.serve({
    hostname: config.uiHost,
    port: config.uiPort,
    routes: {
      "/": page,
      "/setup": setupPage,
      "/api/status": () => Response.json(status()),
      "/api/qr": () =>
        botState.qr
          ? new Response(qrSvg(botState.qr), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } })
          : new Response("Sin QR", { status: 404 }),
      "/api/activity": () =>
        Response.json({
          active: [...botState.active].map(([url, group]) => ({ url, group })),
          events: botState.events,
        }),
      "/api/downloads": (req) => {
        const params = new URL(req.url).searchParams;
        const limit = Math.min(Number(params.get("limit")) || 60, 500);
        const offset = Math.max(Number(params.get("offset")) || 0, 0);
        let rows = mediaRows(params).filter(TYPE_FILTERS[params.get("type") ?? "all"] ?? TYPE_FILTERS.all!);
        if (params.get("order") === "oldest") rows = rows.reverse();
        return Response.json({ total: rows.length, items: rows.slice(offset, offset + limit) });
      },
      "/api/stats": (req) => Response.json(stats(new URL(req.url).searchParams)),
      "/api/setup/cookies/repo": { POST: (req) => setupStep(req, fromRepo) },
      "/api/setup/cookies/browser": {
        POST: async (req) => {
          const { browser } = (await req.json()) as { browser: string };
          return setupStep(req, () => exportBrowserCookies(browser));
        },
      },
      "/api/setup/cookies/upload": {
        POST: async (req) => {
          const form = await req.formData();
          return setupStep(req, async () => saveUploadedCookies(await readUpload(form, "ig"), await readUpload(form, "x")));
        },
      },
      "/api/setup/start": {
        POST: async (req) => {
          const { drive } = (await req.json()) as { drive: boolean };
          return setupStep(req, () => {
            config.gdriveEnabled = DRIVE_CONFIGURED && drive === true;
            finishSetup();
          });
        },
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
  return server.url.href;
}
