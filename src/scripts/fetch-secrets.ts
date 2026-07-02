import { existsSync, mkdirSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";

const REPO = "DereckAn/da-proj-secrets";

// Files to fetch: [repoPath, localPath]
const SECRET_FILES: [string, string][] = [
  ["cookies/www.instagram.com_cookies.txt", "./data/www.instagram.com_cookies.txt"],
  ["cookies/x.com_cookies.txt", "./data/x.com_cookies.txt"],
  ["credentials/oauth-credentials.json", "./data/credentials/oauth-credentials.json"],
  ["credentials/oauth-token.json", "./data/credentials/oauth-token.json"],
];

function isGhInstalled(): boolean {
  const result = spawnSync("gh", ["--version"], { encoding: "utf-8" });
  return result.status === 0;
}

function isGhAuthenticated(): boolean {
  const result = spawnSync("gh", ["auth", "status"], { encoding: "utf-8" });
  return result.status === 0;
}

function ghLogin(): void {
  console.log("\n🌐 Abriendo GitHub en el navegador para autenticarte...");
  // --web opens a browser-based OAuth flow
  const result = spawnSync("gh", ["auth", "login", "--hostname", "github.com", "--web"], {
    stdio: "inherit",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error("Falló la autenticación con GitHub.");
  }
}

function fetchFile(repoPath: string): string {
  const result = spawnSync(
    "gh",
    ["api", `repos/${REPO}/contents/${repoPath}`, "-H", "Accept: application/vnd.github.v3.raw"],
    { encoding: "utf-8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `Error al obtener ${repoPath}`);
  }
  return result.stdout;
}

function credentialsExist(): boolean {
  return SECRET_FILES.every(([, localPath]) => existsSync(localPath));
}

export async function fetchSecretsIfNeeded(force = false): Promise<void> {
  if (!force && credentialsExist()) {
    console.log("✓ Credenciales encontradas localmente, omitiendo fetch.");
    return;
  }

  console.log("\n⚠️  No se encontraron credenciales locales.");
  console.log(`   Se descargarán desde: ${REPO}\n`);

  if (!isGhInstalled()) {
    throw new Error("gh CLI no está instalado. Reconstruye el contenedor con: docker compose build");
  }

  if (!isGhAuthenticated()) {
    ghLogin();
  } else {
    console.log("✓ Ya autenticado con GitHub.");
  }

  console.log("\n📥 Descargando credenciales...");

  for (const [repoPath, localPath] of SECRET_FILES) {
    try {
      const content = fetchFile(repoPath);
      const dir = path.dirname(localPath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(localPath, content, "utf-8");
      console.log(`  ✓ ${repoPath}`);
    } catch (err: any) {
      console.warn(`  ⚠ ${repoPath}: ${err.message}`);
    }
  }

  console.log("\n✓ Credenciales descargadas.\n");
}

// Ejecutado directamente (bun run src/scripts/fetch-secrets.ts): fuerza la descarga
if (import.meta.main) {
  fetchSecretsIfNeeded(true).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
