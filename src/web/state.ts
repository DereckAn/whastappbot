// Estado en memoria del bot para el dashboard (se pierde al reiniciar)
export type Connection = "connecting" | "qr" | "open" | "close";

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
  qrVersion: 0, // cambia con cada QR nuevo (la página solo recarga la imagen entonces)
  connection: "connecting" as Connection,
  startedAt: new Date().toISOString(),
  active: new Map<string, string>(), // url -> grupo
  events: [] as BotEvent[],
};

export function logEvent(event: Omit<BotEvent, "at">): void {
  botState.events.unshift({ at: new Date().toISOString(), ...event });
  botState.events.length = Math.min(botState.events.length, 50);
}

// Modo UI: el bot espera a que el usuario termine la configuración en la página
let resolveSetup: () => void;
export const setupDone = new Promise<void>((resolve) => (resolveSetup = resolve));

export function finishSetup(): void {
  botState.phase = "running";
  resolveSetup();
}
