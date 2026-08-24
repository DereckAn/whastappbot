import { config } from "../config.js";

// prompt() es un global de Bun; tsconfig usa lib ESNext (sin DOM) así que lo declaramos
declare const prompt: (message?: string) => string | null;

// Pregunta si conectar a Google Drive esta sesión. Si el usuario dice que no
// (o no hay nada configurado), deshabilita gdrive en memoria para que el resto
// del bot siga funcionando igual, sin reintentos ni logs de error por Drive.
export async function runDriveMenu(): Promise<void> {
  if (!config.gdriveEnabled) return;

  console.log("\n=== Google Drive ===");
  const answer = (prompt("¿Conectar a Google Drive esta sesión? [s/N]:") || "").trim().toLowerCase();
  const wantsDrive = answer === "s" || answer === "si" || answer === "sí" || answer === "y" || answer === "yes";

  if (!wantsDrive) {
    config.gdriveEnabled = false;
    console.log("→ Continuando sin Google Drive.");
    return;
  }

  console.log("→ Usando Google Drive con las credenciales existentes en data/credentials/.");
  console.log("  (Renovar/reconectar el token OAuth manualmente aún no está implementado.)");
}
