import { type WASocket } from "@whiskeysockets/baileys";
import { config } from "../config.js";
import { processUrl } from "../downloader/index.js";
import { isUrlDownloaded, saveDownload } from "../storage/db.js";
import { extractSupportedUrls, identifyPlatform } from "../downloader/parser.js";
import { uploadToGoogleDrive } from "../storage/gdrive.js";

// Cache jid -> nombre de grupo para no llamar a groupMetadata en cada mensaje
const groupNameCache = new Map<string, string>();

async function getGroupName(sock: WASocket, jid: string): Promise<string | null> {
  const cached = groupNameCache.get(jid);
  if (cached) return cached;
  try {
    const name = (await sock.groupMetadata(jid)).subject;
    groupNameCache.set(jid, name);
    return name;
  } catch (error) {
    console.error("Error al obtener metadata del grupo:", error);
    return null;
  }
}

// Descarga una URL, la sube a Drive y la registra en la DB. Lanza error si falla la descarga.
export async function handleUrl(url: string, groupName: string): Promise<"skipped" | "downloaded"> {
  if (isUrlDownloaded(url)) {
    console.log(`⏭️  Ya descargado: ${url}`);
    return "skipped";
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
    file_path: filePaths[0]!, // primer archivo como referencia
  });
  return "downloaded";
}

export function setupMessageHandler(sock: WASocket): void {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[DEBUG] messages.upsert type="${type}" count=${messages.length}`);
    if (type !== "notify") return;

    for (const msg of messages) {
      // Ignorar mensajes del historial (tienen timestamp muy antiguo)
      const msgTimestamp = Number(msg.messageTimestamp ?? 0);
      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
      if (msgTimestamp < fiveMinutesAgo) {
        console.log(`[DEBUG] Mensaje antiguo ignorado (ts=${msgTimestamp})`);
        continue;
      }

      // Solo mensajes de grupos
      if (!msg.key.remoteJid?.endsWith("@g.us")) {
        console.log(`[DEBUG] No es grupo, ignorando (jid=${msg.key.remoteJid})`);
        continue;
      }

      // Verificar que el grupo esté monitoreado
      const groupName = await getGroupName(sock, msg.key.remoteJid);
      if (!groupName || !config.monitoredGroups.includes(groupName)) continue;

      // Extraer texto del mensaje
      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        "";

      if (!text) continue;

      console.log(`[DEBUG] Texto recibido: "${text}"`);

      // Buscar URLs de Twitter/X e Instagram
      const relevantUrls = extractSupportedUrls(text);
      if (relevantUrls.length === 0) {
        console.log("[DEBUG] No se encontraron URLs soportadas en el mensaje.");
        continue;
      }
      console.log("URLs encontradas:", relevantUrls);

      for (const url of relevantUrls) {
        try {
          await handleUrl(url, groupName);
        } catch (error) {
          console.error("❌ Error al procesar URL:", error);
        }
      }
    }
  });
}
