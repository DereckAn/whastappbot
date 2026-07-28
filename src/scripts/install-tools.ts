import { mkdirSync, writeFileSync, chmodSync } from "fs";
import path from "path";

// Binarios standalone (sin Python) de yt-dlp y gallery-dl según SO/arquitectura.
// gallery-dl solo publica binario para Linux x64 y Windows; en el resto se usa pip/brew.
const YTDLP = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

// url directa, o repo+asset a resolver (gallery-dl dejó de adjuntar binarios en su release "latest")
type Tool = { name: string; url?: string; repo?: string; asset?: string };

function assetsFor(platform: string, arch: string): { tools: Tool[]; notes: string[] } {
  const notes: string[] = [];
  const tools: Tool[] = [];

  if (platform === "win32") {
    tools.push({ name: "yt-dlp.exe", url: `${YTDLP}/yt-dlp.exe` });
    tools.push({ name: "gallery-dl.exe", repo: "mikf/gallery-dl", asset: "gallery-dl.exe" });
  } else if (platform === "darwin") {
    tools.push({ name: "yt-dlp", url: `${YTDLP}/yt-dlp_macos` });
    notes.push("gallery-dl no publica binario para macOS → instálalo con: brew install gallery-dl");
  } else {
    // linux
    const yt = arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
    tools.push({ name: "yt-dlp", url: `${YTDLP}/${yt}` });
    if (arch === "x64") {
      tools.push({ name: "gallery-dl", repo: "mikf/gallery-dl", asset: "gallery-dl.bin" });
    } else {
      notes.push(`gallery-dl no publica binario para linux/${arch} → instálalo con: pip install --user gallery-dl`);
    }
  }
  return { tools, notes };
}

// Busca en las releases recientes la primera que realmente incluye el asset pedido.
async function resolveAssetUrl(repo: string, asset: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: { "User-Agent": "whatsappbot-setup" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} para ${repo}`);
  const releases = (await res.json()) as Array<{ assets: Array<{ name: string; browser_download_url: string }> }>;
  for (const rel of releases) {
    const found = rel.assets.find((a) => a.name === asset);
    if (found) return found.browser_download_url;
  }
  throw new Error(`Ninguna release reciente de ${repo} incluye ${asset}`);
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url); // fetch sigue redirecciones de GitHub automáticamente
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} al descargar ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  if (process.platform !== "win32") chmodSync(dest, 0o755);
}

async function main() {
  const binDir = path.resolve("./bin");
  mkdirSync(binDir, { recursive: true });

  const { tools, notes } = assetsFor(process.platform, process.arch);
  console.log(`Descargando binarios para ${process.platform}/${process.arch} → ${binDir}\n`);

  for (const t of tools) {
    const dest = path.join(binDir, t.name);
    process.stdout.write(`  ${t.name} … `);
    const url = t.url ?? (await resolveAssetUrl(t.repo!, t.asset!));
    await download(url, dest);
    console.log("✓");
  }

  for (const n of notes) console.log(`  ⚠ ${n}`);
  console.log("\n✓ Listo. El proyecto usará ./bin automáticamente (ver src/tools.ts).");
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});
