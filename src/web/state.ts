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
  connection: "connecting" as Connection,
  startedAt: new Date().toISOString(),
  active: new Map<string, string>(), // url -> grupo
  events: [] as BotEvent[],
};

export function logEvent(event: Omit<BotEvent, "at">): void {
  botState.events.unshift({ at: new Date().toISOString(), ...event });
  botState.events.length = Math.min(botState.events.length, 50);
}
