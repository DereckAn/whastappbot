import { type WASocket } from "@whiskeysockets/baileys";
import { config } from "../config.js";
import { processUrl } from "../downloader/index.js";
import { isUrlDownloaded, saveDownload } from "../storage/db.js";
import { identifyPlatform } from "../downloader/parser.js";
import { uploadToGoogleDrive } from "../storage/gdrive.js";

const PLATFORM_PATTERNS = {
  twitter: /https?:\/\/(twitter\.com|x\.com|t\.co)\/\S+/i,
  instagram: /https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/\S+/i,
};

export function setupMessageHandler(sock: WASocket): void {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Solo mensajes de grupos
      if (!msg.key.remoteJid?.endsWith("@g.us")) {
        continue;
      }

      // Verificar que el grupo esté monitoreado
      const groupJid = msg.key.remoteJid;
      const groupMetadata = await sock.groupMetadata(groupJid);
      const groupName = groupMetadata.subject; // ej: "arte"

      try {
        if (!config.monitoredGroups.includes(groupName)) continue;
      } catch (error) {
        console.error("Error al obtener metadata del grupo:", error);
        continue;
      }

      // Extraer texto del mensaje
      const messageContent = msg.message;
      if (!messageContent) continue;

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        "";

      if (!text) continue;

      // Buscar URLs
      const urls = text.match(/https?:\/\/[^\s]+/g);
      if (!urls) continue;

      // Filtrar URLs de Twitter/X e Instagram
      const relevantUrls = urls.filter((url) => {
        return (
          PLATFORM_PATTERNS.twitter.test(url) ||
          PLATFORM_PATTERNS.instagram.test(url)
        );
      });

      if (relevantUrls.length > 0) {
        console.log("URLs encontradas:", relevantUrls);
      }

      for (const url of relevantUrls) {
        try {
          // Verificar si ya fue descargado
          if (isUrlDownloaded(url)) {
            console.log(`⏭️  Ya descargado: ${url}`);
            continue;
          }

          const filePaths = await processUrl(url, groupName);
          console.log(`✅ Archivos descargados (${filePaths.length}):`, filePaths);

          const platform = identifyPlatform(url);

          // Subir cada archivo a Google Drive y guardar en DB
          for (const filePath of filePaths) {
            let gdriveId: string | undefined;

            // Subir a Google Drive si está habilitado
            if (config.gdriveEnabled) {
              try {
                gdriveId = await uploadToGoogleDrive(filePath, groupName, platform);
              } catch (error) {
                console.error("❌ Error subiendo a Drive:", error);
              }
            }

            // Guardar en la base de datos (cada archivo individual)
            saveDownload({
              url: `${url}#${filePath}`, // URL única por archivo
              platform,
              group_name: groupName,
              file_path: filePath,
              gdrive_id: gdriveId,
            });
          }

          // Marcar URL principal como descargada
          saveDownload({
            url,
            platform,
            group_name: groupName,
            file_path: filePaths[0], // primer archivo como referencia
          });
        } catch (error) {
          console.error("❌ Error al procesar URL:", error);
        }
      }
    }
  });
}
