import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  WHATSAPP_AUTH_DIR: z.string(),
  DOWNLOADS_DIR: z.string().default('./downloads'),
  GALLERY_DL_PATH: z.string().default('gallery-dl'),
  MONITORED_GROUPS: z.string().default(''),
  GDRIVE_ENABLED: z.string().default('false').transform((val) => val === 'true'),
  GDRIVE_OAUTH_CREDENTIALS_PATH: z.string().optional(),
  GDRIVE_OAUTH_TOKEN_PATH: z.string().optional(),
  GDRIVE_ROOT_FOLDER_ID: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const env = envSchema.parse(process.env);

export const config = {
  whatsappAuthDir: env.WHATSAPP_AUTH_DIR,
  downloadsDir: env.DOWNLOADS_DIR,
  galleryDLPath: env.GALLERY_DL_PATH,
  monitoredGroups: env.MONITORED_GROUPS.split(',').map((id) => id.trim()).filter(Boolean),
  gdriveEnabled: env.GDRIVE_ENABLED,
  gdriveOAuthCredentialsPath: env.GDRIVE_OAUTH_CREDENTIALS_PATH,
  gdriveOAuthTokenPath: env.GDRIVE_OAUTH_TOKEN_PATH,
  gdriveRootFolderId: env.GDRIVE_ROOT_FOLDER_ID,
  logLevel: env.LOG_LEVEL,
};