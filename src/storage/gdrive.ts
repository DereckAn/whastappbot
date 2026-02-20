import { google } from 'googleapis';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

// Cache de IDs de carpetas para no recrearlas
const folderCache = new Map<string, string>();

// Autenticación con OAuth
function getAuthClient() {
  if (!config.gdriveOAuthCredentialsPath || !config.gdriveOAuthTokenPath) {
    throw new Error('GDRIVE_OAUTH_CREDENTIALS_PATH o GDRIVE_OAUTH_TOKEN_PATH no está configurado');
  }

  const credentials = JSON.parse(fs.readFileSync(config.gdriveOAuthCredentialsPath, 'utf-8'));
  const token = JSON.parse(fs.readFileSync(config.gdriveOAuthTokenPath, 'utf-8'));

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}

// Crear carpeta en Google Drive
async function createFolder(name: string, parentId: string): Promise<string> {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return response.data.id!;
}

// Buscar carpeta por nombre
async function findFolder(name: string, parentId: string): Promise<string | null> {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id!;
  }

  return null;
}

// Obtener o crear carpeta
async function getOrCreateFolder(name: string, parentId: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`;

  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  let folderId = await findFolder(name, parentId);

  if (!folderId) {
    console.log(`📁 Creando carpeta en Drive: ${name}`);
    folderId = await createFolder(name, parentId);
  }

  folderCache.set(cacheKey, folderId);
  return folderId;
}

// Subir archivo a Google Drive
export async function uploadToGoogleDrive(
  filePath: string,
  groupName: string,
  platform: string
): Promise<string> {
  if (!config.gdriveEnabled) {
    throw new Error('Google Drive no está habilitado');
  }

  if (!config.gdriveRootFolderId) {
    throw new Error('GDRIVE_ROOT_FOLDER_ID no está configurado');
  }

  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // Crear estructura: RootFolder/GroupName/Platform/
  const groupFolderId = await getOrCreateFolder(groupName, config.gdriveRootFolderId);
  const platformFolderId = await getOrCreateFolder(platform, groupFolderId);

  // Subir archivo
  const fileName = path.basename(filePath);
  console.log(`☁️  Subiendo a Drive: ${fileName}`);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [platformFolderId],
    },
    media: {
      body: fs.createReadStream(filePath),
    },
    fields: 'id',
  });

  console.log(`✅ Subido a Drive: ${fileName}`);
  return response.data.id!;
}
