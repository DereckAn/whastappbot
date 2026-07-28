import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import os from "os";
import { fetchSecretsIfNeeded } from "./fetch-secrets.js";
import { resolveTool } from "../tools.js";

// prompt() es un global de Bun; tsconfig usa lib ESNext (sin DOM) así que lo declaramos
declare const prompt: (message?: string) => string | null;

const IG_COOKIE = path.resolve("./data/www.instagram.com_cookies.txt");
const X_COOKIE = path.resolve("./data/x.com_cookies.txt");
const GALLERY_CONFIG = path.join(os.homedir(), ".config", "gallery-dl", "config.json");

// gallery-dl lee cookies desde su config: o una ruta a archivo Netscape, o ["navegador"]
// ponytail: sobreescribe el config completo; solo gestionamos cookies aquí
function writeGalleryConfig(instagram: string | string[], twitter: string | string[]): void {
  mkdirSync(path.dirname(GALLERY_CONFIG), { recursive: true });
  const config = { extractor: { instagram: { cookies: instagram }, twitter: { cookies: twitter } } };
  writeFileSync(GALLERY_CONFIG, JSON.stringify(config, null, 2), "utf-8");
  console.log(`✓ gallery-dl config: ${GALLERY_CONFIG}`);
}

// ① Descargar cookies desde el repo privado
async function fromRepo(): Promise<void> {
  await fetchSecretsIfNeeded(true);
  if (!existsSync(IG_COOKIE) || !existsSync(X_COOKIE)) {
    throw new Error("El repo no entregó los archivos de cookies esperados.");
  }
  writeGalleryConfig(IG_COOKIE, X_COOKIE);
}

// ② Localizar un archivo de cookies en el equipo (zenity si hay GUI, si no ruta escrita)
function pickFile(label: string): string | null {
  if (process.env.DISPLAY && spawnSync("zenity", ["--version"]).status === 0) {
    const res = spawnSync("zenity", ["--file-selection", "--title", `Selecciona cookies de ${label}`], {
      encoding: "utf-8",
    });
    return res.status === 0 ? res.stdout.trim() : null;
  }
  return prompt(`Ruta al archivo de cookies de ${label} (enter para omitir):`)?.trim() || null;
}

function fromLocalFile(): void {
  mkdirSync("./data", { recursive: true });
  const ig = pickFile("Instagram");
  if (ig) copyFileSync(ig, IG_COOKIE), console.log(`  ✓ Instagram → ${IG_COOKIE}`);
  const x = pickFile("Twitter/X");
  if (x) copyFileSync(x, X_COOKIE), console.log(`  ✓ Twitter/X → ${X_COOKIE}`);
  if (!ig && !x) throw new Error("No se seleccionó ningún archivo.");
  writeGalleryConfig(IG_COOKIE, X_COOKIE);
}

// Separar un jar Netscape completo en los dos archivos por dominio que espera gallery-dl
// Extrae del jar Netscape las líneas de Instagram y de Twitter/X (dominio = columna 0)
function readJarDomains(jarPath: string): { ig: string[]; x: string[] } {
  const lines = readFileSync(jarPath, "utf-8").split("\n");
  const domainOf = (l: string) => (l.split("\t")[0] || "");
  return {
    ig: lines.filter((l) => domainOf(l).includes("instagram.com")),
    x: lines.filter((l) => domainOf(l).includes("x.com") || domainOf(l).includes("twitter.com")),
  };
}

// Escribe el archivo de cookies solo si hay algo; nunca pisa uno bueno con vacío.
function writeCookieFile(dest: string, lines: string[], label: string): void {
  if (lines.length === 0) {
    console.log(`  ⚠ ${label}: 0 cookies → conservo el archivo existente (no lo sobreescribo).`);
    return;
  }
  writeFileSync(dest, "# Netscape HTTP Cookie File\n" + lines.join("\n") + "\n", "utf-8");
  console.log(`  ✓ ${label} (${lines.length} cookies) → ${dest}`);
}

// ③ Exportar cookies del navegador a archivos .txt (Netscape) con yt-dlp
function fromBrowser(): void {
  const ytdlp = resolveTool("yt-dlp");
  if (spawnSync(ytdlp, ["--version"]).status !== 0) {
    throw new Error(
      "yt-dlp no disponible (se usa para exportar las cookies del navegador a .txt).\n" +
      "  Descárgalo con:  bun run tools   (o: pip install --user yt-dlp)"
    );
  }

  const browser = (prompt("¿Qué navegador? (brave/firefox/chrome/chromium) [brave]:") || "brave").trim().toLowerCase();
  console.log(`\n⚠️  Cierra ${browser} durante la exportación: bloquea la base de cookies mientras está abierto.`);
  prompt("Presiona enter cuando esté cerrado…");

  mkdirSync("./data", { recursive: true });
  const fullJar = path.resolve("./data/_browser_cookies.tmp.txt");

  // En Linux la clave de cifrado de Chromium vive en el llavero; probamos varios.
  // (yt-dlp falla si --cookies apunta a un archivo vacío, por eso borramos antes.)
  const specs = [browser, `${browser}+gnomekeyring`, `${browser}+kwallet`];
  let best: { ig: string[]; x: string[] } = { ig: [], x: [] };
  try {
    for (const spec of specs) {
      rmSync(fullJar, { force: true });
      spawnSync(ytdlp, ["--cookies-from-browser", spec, "--cookies", fullJar,
        "--skip-download", "--ignore-errors", "--no-warnings",
        "--playlist-items", "0", "https://www.youtube.com/"], { encoding: "utf-8" });
      if (!existsSync(fullJar)) continue;
      const found = readJarDomains(fullJar);
      if (found.ig.length + found.x.length > best.ig.length + best.x.length) best = found;
      if (best.ig.length && best.x.length) break; // ya tenemos ambas redes
    }

    if (best.ig.length + best.x.length === 0) {
      throw new Error(
        "No se hallaron cookies de Instagram/Twitter en el navegador.\n" +
        "  Verifica que iniciaste sesión en ese navegador y que el llavero (keyring) está desbloqueado."
      );
    }

    writeCookieFile(IG_COOKIE, best.ig, "Instagram");
    writeCookieFile(X_COOKIE, best.x, "Twitter/X");
    writeGalleryConfig(IG_COOKIE, X_COOKIE);
  } finally {
    // El jar completo contiene cookies de TODOS los sitios: borrarlo por seguridad
    rmSync(fullJar, { force: true });
  }

  console.log("  → Listo. Ya puedes mantener el navegador abierto; se usan los archivos .txt.");
}

export async function runCookieMenu(): Promise<void> {
  console.log("\n=== Configuración de cookies ===");
  console.log("  1) Descargar del repo privado");
  console.log("  2) Buscar archivo en el equipo");
  console.log("  3) Exportar de un navegador a .txt (ya con sesión iniciada)");
  console.log("  0) Continuar con lo que ya hay");

  const choice = prompt("Elige una opción [0]:")?.trim() || "0";
  switch (choice) {
    case "1": await fromRepo(); break;
    case "2": fromLocalFile(); break;
    case "3": fromBrowser(); break;
    default: console.log("→ Continuando sin cambios.");
  }
}

// ponytail: check mínimo del parser de dominios — `bun run src/scripts/setup-cookies.ts --selftest`
function selfTest(): void {
  const dir = path.resolve("./data");
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, "_selftest_jar.txt");
  writeFileSync(tmp,
    "# Netscape HTTP Cookie File\n" +
    ".instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tIG\n" +
    ".x.com\tTRUE\t/\tTRUE\t0\tauth_token\tX\n" +
    ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tYT\n", "utf-8");
  try {
    const { ig, x } = readJarDomains(tmp);
    if (ig.length !== 1 || !ig[0]!.includes("sessionid")) throw new Error("IG split incorrecto");
    if (x.length !== 1 || !x[0]!.includes("auth_token")) throw new Error("X split incorrecto");
    if (ig.some((l) => l.includes("PREF")) || x.some((l) => l.includes("PREF"))) throw new Error("filtró youtube");
    console.log("✓ selftest OK");
  } finally {
    rmSync(tmp, { force: true });
  }
}

if (import.meta.main) {
  if (process.argv[2] === "--selftest") {
    selfTest();
  } else {
    runCookieMenu().catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
  }
}
