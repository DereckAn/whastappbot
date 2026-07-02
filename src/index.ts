import { mkdirSync } from "fs";
import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp/client.js";
import { initDatabase } from "./storage/db.js";
import { fetchSecretsIfNeeded } from "./scripts/fetch-secrets.js";

async function main() {
  try {
    // Crear directorios necesarios si no existen
    mkdirSync(config.whatsappAuthDir, { recursive: true });
    mkdirSync(config.downloadsDir, { recursive: true });

    // Obtener credenciales desde GitHub si no existen localmente
    await fetchSecretsIfNeeded();

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
