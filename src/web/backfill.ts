// Backfill lanzado desde el dashboard: una cola de links con pausa aleatoria entre descargas
import { statSync } from "fs";
import { handleUrl } from "../whatsapp/handler.js";
import type { ChatLink } from "../whatsapp/chat-export.js";

export const WAIT_SECONDS = { min: 20, max: 60 };

export interface BackfillItem extends ChatLink {
  status: "queued" | "downloading" | "downloaded" | "skipped" | "failed";
  files: number;
  bytes: number;
  firstFile: string | null;
  error?: string;
  tookMs?: number;
  waitedSec?: number; // pausa que se hizo después de este link
}

export interface BackfillJob {
  group: string;
  startedAt: string;
  finishedAt: string | null;
  state: "running" | "paused" | "stopped" | "done";
  wait: { total: number; remaining: number } | null; // cuenta regresiva de la pausa actual
  items: BackfillItem[];
}

export let backfillJob: BackfillJob | null = null;

const isActive = (job: BackfillJob | null) => job?.state === "running" || job?.state === "paused";

const fileSize = (file: string) => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};

export function startBackfill(links: ChatLink[], group: string): BackfillJob {
  if (isActive(backfillJob)) throw new Error("Ya hay un backfill en curso.");
  if (links.length === 0) throw new Error("No hay links nuevos para descargar.");
  const job: BackfillJob = {
    group,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    state: "running",
    wait: null,
    items: links.map((link) => ({ ...link, status: "queued", files: 0, bytes: 0, firstFile: null })),
  };
  backfillJob = job;
  void run(job);
  return job;
}

export function controlBackfill(action: "pause" | "resume" | "stop"): void {
  const job = backfillJob;
  if (!job || !isActive(job)) throw new Error("No hay un backfill en curso.");
  if (action === "pause") job.state = "paused";
  if (action === "resume") job.state = "running";
  if (action === "stop") job.state = "stopped";
}

// Espera en pasos de 1 s: la pausa del usuario congela la cuenta y "detener" la corta
async function waitSeconds(job: BackfillJob, seconds: number): Promise<void> {
  job.wait = { total: seconds, remaining: seconds };
  while (job.wait.remaining > 0 && job.state !== "stopped") {
    await Bun.sleep(1000);
    if (job.state === "running") job.wait.remaining--;
  }
  job.wait = null;
}

async function run(job: BackfillJob): Promise<void> {
  for (const [i, item] of job.items.entries()) {
    while (job.state === "paused") await Bun.sleep(500);
    if (job.state === "stopped") break;

    item.status = "downloading";
    const started = Date.now();
    try {
      const { result, files } = await handleUrl(item.url, job.group);
      item.status = result;
      item.files = files.length;
      item.bytes = files.reduce((n, f) => n + fileSize(f), 0);
      item.firstFile = files[0] ?? null;
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
    }
    item.tookMs = Date.now() - started;

    // Sin pausa tras un omitido (no tocó Instagram/X) ni tras el último
    if (item.status === "skipped" || i === job.items.length - 1) continue;
    const seconds = WAIT_SECONDS.min + Math.floor(Math.random() * (WAIT_SECONDS.max - WAIT_SECONDS.min + 1));
    item.waitedSec = seconds;
    await waitSeconds(job, seconds);
  }
  if (job.state !== "stopped") job.state = "done";
  job.finishedAt = new Date().toISOString();
}
