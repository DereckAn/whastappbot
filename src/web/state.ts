// Estado en memoria del bot para el dashboard (se pierde al reiniciar)
// loggedOut: la sesión se cerró desde el teléfono y el bot ya no reintenta
export type Connection = "connecting" | "qr" | "open" | "close" | "loggedOut";

export interface BotEvent {
  at: string;
  url: string;
  group: string;
  result: "downloaded" | "skipped" | "failed";
  error?: string;
}

export const botState = {
  phase: "setup" as "setup" | "running", // solo cambia en modo UI
  qr: null as string | null,
  qrAt: null as string | null, // cuándo llegó el QR actual
  me: null as string | null, // número de WhatsApp vinculado
  meName: null as string | null,
  qrVersion: 0, // cambia con cada QR nuevo (la página solo recarga la imagen entonces)
  connection: "connecting" as Connection,
  startedAt: new Date().toISOString(),
  active: new Map<string, string>(), // url -> grupo
  events: [] as BotEvent[],
  connLog: [] as { at: string; tag: string; text: string }[], // eventos de conexión, más reciente primero
};

export function logEvent(event: Omit<BotEvent, "at">): void {
  botState.events.unshift({ at: new Date().toISOString(), ...event });
  botState.events.length = Math.min(botState.events.length, 50);
}

export function logConnection(tag: string, text: string): void {
  botState.connLog.unshift({ at: new Date().toISOString(), tag, text });
  botState.connLog.length = Math.min(botState.connLog.length, 50);
}

// Modo UI: el bot espera a que el usuario termine la configuración en la página
let resolveSetup: () => void;
export const setupDone = new Promise<void>((resolve) => (resolveSetup = resolve));

export function finishSetup(): void {
  botState.phase = "running";
  resolveSetup();
}
