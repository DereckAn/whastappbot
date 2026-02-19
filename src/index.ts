import { mkdirSync } from "fs";
import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp/client.js";
import { setupMessageHandler } from "./whatsapp/handler.js";

async function main() {
  try {
    // Crear directorios necesarios si no existen
    mkdirSync(config.whatsappAuthDir, { recursive: true });
    mkdirSync(config.downloadsDir, { recursive: true });

    console.log("Iniciando WhatsApp bot...");
    const sock = await startWhatsApp();
    
    setupMessageHandler(sock);
  } catch (error) {
    console.error("Error iniciando el bot:", error);
    process.exit(1);
  }
}

main();
