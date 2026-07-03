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
function splitJarByDomain(jarPath: string, igOut = IG_COOKIE, xOut = X_COOKIE): void {
  const header = "# Netscape HTTP Cookie File\n";
  const lines = readFileSync(jarPath, "utf-8").split("\n");
  const domainOf = (l: string) => (l.split("\t")[0] || "");
  const ig = lines.filter((l) => domainOf(l).includes("instagram.com"));
  const x = lines.filter((l) => domainOf(l).includes("x.com") || domainOf(l).includes("twitter.com"));

  writeFileSync(igOut, header + ig.join("\n") + "\n", "utf-8");
  writeFileSync(xOut, header + x.join("\n") + "\n", "utf-8");
  console.log(`  ✓ Instagram (${ig.length} cookies) → ${igOut}`);
  console.log(`  ✓ Twitter/X (${x.length} cookies) → ${xOut}`);
  if (ig.length === 0 && x.length === 0) {
    console.log("  ⚠ No se hallaron cookies de esas redes. ¿Iniciaste sesión en ese navegador?");
  }
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

  // yt-dlp carga TODAS las cookies del navegador y guarda el jar completo en --cookies.
  // La URL de youtube solo dispara el volcado; --playlist-items 0 evita descargar nada.
  const res = spawnSync(
    ytdlp,
    ["--cookies-from-browser", browser, "--cookies", fullJar,
     "--skip-download", "--ignore-errors", "--no-warnings",
     "--playlist-items", "0", "https://www.youtube.com/"],
    { encoding: "utf-8" }
  );

  if (!existsSync(fullJar)) {
    throw new Error(`yt-dlp no pudo exportar cookies.\n${res.stderr || res.stdout || ""}`);
  }

  try {
    splitJarByDomain(fullJar);
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
  const igOut = path.join(dir, "_selftest_ig.txt");
  const xOut = path.join(dir, "_selftest_x.txt");
  writeFileSync(tmp,
    "# Netscape HTTP Cookie File\n" +
    ".instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tIG\n" +
    ".x.com\tTRUE\t/\tTRUE\t0\tauth_token\tX\n" +
    ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tYT\n", "utf-8");
  try {
    splitJarByDomain(tmp, igOut, xOut);
    const ig = readFileSync(igOut, "utf-8");
    const x = readFileSync(xOut, "utf-8");
    if (!ig.includes("sessionid") || ig.includes("PREF")) throw new Error("IG split incorrecto");
    if (!x.includes("auth_token") || x.includes("PREF")) throw new Error("X split incorrecto");
    console.log("✓ selftest OK");
  } finally {
    for (const f of [tmp, igOut, xOut]) rmSync(f, { force: true });
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
