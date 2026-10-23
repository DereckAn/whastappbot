// Descarga los últimos N links de un chat exportado desde WhatsApp (Exportar chat → Sin multimedia)
// Uso: bun run backfill <chat.txt> <grupo> [--last 50]
import { config } from "../config.js";
import { initDatabase } from "../storage/db.js";
import { extractSupportedUrls } from "../downloader/parser.js";
import { handleUrl } from "../whatsapp/handler.js";

const [chatPath, groupName, flag, lastArg] = process.argv.slice(2);
const last = flag === "--last" ? Number(lastArg) : 50;

if (!chatPath || !groupName || !Number.isInteger(last) || last <= 0) {
  console.error("Uso: bun run backfill <chat.txt> <grupo> [--last 50]");
  process.exit(1);
}
// El nombre del grupo se usa como carpeta: solo aceptamos grupos monitoreados
if (!config.monitoredGroups.includes(groupName)) {
  console.error(`Grupo "${groupName}" no está en MONITORED_GROUPS (${config.monitoredGroups.join(", ")})`);
  process.exit(1);
}

const urls = extractSupportedUrls(await Bun.file(chatPath).text()).slice(-last);
console.log(`🔗 ${urls.length} links de Twitter/X e Instagram para "${groupName}"`);

initDatabase();
const totals = { downloaded: 0, skipped: 0, failed: 0 };

for (const [i, url] of urls.entries()) {
  const prefix = `[${i + 1}/${urls.length}]`;
  try {
    const { result } = await handleUrl(url, groupName);
    totals[result]++;
    console.log(`${prefix} ${result === "downloaded" ? "✅" : "⏭️ "} ${url}`);
    if (result === "skipped") continue;
  } catch (error) {
    totals.failed++;
    console.error(`${prefix} ❌ ${url}`, error);
  }
  if (i === urls.length - 1) break;
  // ponytail: pausa fija de 20-60s para no quemar las cookies; súbela si Instagram pide checkpoint
  const seconds = 20 + Math.floor(Math.random() * 41);
  console.log(`⏳ Esperando ${seconds}s...`);
  await Bun.sleep(seconds * 1000);
}

console.log(`\nListo: ${totals.downloaded} descargados, ${totals.skipped} omitidos, ${totals.failed} fallidos`);
