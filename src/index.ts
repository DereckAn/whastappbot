import { mkdirSync } from "fs";
import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp/client.js";
import { setupMessageHandler } from "./whatsapp/handler.js";
import { initDatabase } from "./storage/db.js";
import path from "path";

async function main() {
  try {
    // Crear directorios necesarios si no existen
    mkdirSync(config.whatsappAuthDir, { recursive: true });
    mkdirSync(config.downloadsDir, { recursive: true });

    // Inicializar base de datos
    initDatabase();
    console.log("✓ Base de datos inicializada");

    console.log("Iniciando WhatsApp bot...");
    const sock = await startWhatsApp();

    setupMessageHandler(sock);
  } catch (error) {
    console.error("Error iniciando el bot:", error);
    process.exit(1);
  }
}

main();
