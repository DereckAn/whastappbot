import { mkdirSync } from "fs";
import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp/client.js";
import { initDatabase } from "./storage/db.js";
import { fetchSecretsIfNeeded } from "./scripts/fetch-secrets.js";
import { runCookieMenu } from "./scripts/setup-cookies.js";
import { runDriveMenu } from "./scripts/setup-drive.js";

async function main() {
  try {
    // Crear directorios necesarios si no existen
    mkdirSync(config.whatsappAuthDir, { recursive: true });
    mkdirSync(config.downloadsDir, { recursive: true });

    // Terminal interactiva (local): mostrar menú de cookies.
    // Sin TTY (Docker en background): descarga automática desde el repo.
    if (process.stdin.isTTY) {
      await runCookieMenu();
      await runDriveMenu();
    } else {
      await fetchSecretsIfNeeded();
    }

    // Inicializar base de datos
    initDatabase();
    console.log("✓ Base de datos inicializada");

    console.log("Iniciando WhatsApp bot...");
    await startWhatsApp(); // adjunta el handler internamente
  } catch (error) {
    console.error("Error iniciando el bot:", error);
    process.exit(1);
  }
}

main();
