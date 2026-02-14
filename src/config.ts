import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  WHATSAPP_AUTH_DIR: z.string(),
  DOWNLOADS_DIR: z.string().default('./downloads'),
  YT_DLP_PATH: z.string().default('yt-dlp'),
  MONITORED_GROUPS: z.string().default(''),
  GDRIVE_ENABLED: z.string().default('false').transform((val) => val === 'true'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const env = envSchema.parse(process.env);

export const config = {
  whatsappAuthDir: env.WHATSAPP_AUTH_DIR,
  downloadsDir: env.DOWNLOADS_DIR,
  ytdlpPath: env.YT_DLP_PATH,
  monitoredGroups: env.MONITORED_GROUPS.split(',').map((id) => id.trim()).filter(Boolean),
  gdriveEnabled: env.GDRIVE_ENABLED,
  logLevel: env.LOG_LEVEL,
};