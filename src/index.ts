import { mkdirSync } from "fs";
import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp/client.js";
import { initDatabase } from "./storage/db.js";
import { fetchSecretsIfNeeded } from "./scripts/fetch-secrets.js";
import { runCookieMenu } from "./scripts/setup-cookies.js";
import { runDriveMenu } from "./scripts/setup-drive.js";
import { startWebServer } from "./web/server.js";
import { setupDone } from "./web/state.js";

// `bun dev` → todo en la terminal; `bun dev ui` → configuración, QR y dashboard en el navegador
const uiMode = process.argv.slice(2).includes("ui");

function openBrowser(url: string): void {
  try {
    Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    // Sin navegador (Docker, servidor): el usuario abre la URL a mano
  }
}

async function main() {
  try {
    // Crear directorios necesarios si no existen
    mkdirSync(config.whatsappAuthDir, { recursive: true });
    mkdirSync(config.downloadsDir, { recursive: true });

    // Inicializar base de datos (el dashboard la lee desde el inicio)
    initDatabase();
    console.log("✓ Base de datos inicializada");

    if (uiMode) {
      // Las preguntas de inicio se responden en la página
      const url = startWebServer();
      openBrowser(url);
      console.log("→ Termina la configuración en el navegador para iniciar el bot.");
      await setupDone;
    } else if (process.stdin.isTTY) {
      // Terminal interactiva (local): mostrar menú de cookies.
      await runCookieMenu();
      await runDriveMenu();
    } else {
      // Sin TTY (Docker en background): descarga automática desde el repo.
      await fetchSecretsIfNeeded();
    }

    console.log("Iniciando WhatsApp bot...");
    await startWhatsApp(); // adjunta el handler internamente
  } catch (error) {
    console.error("Error iniciando el bot:", error);
    process.exit(1);
  }
}

main();
