import { google } from 'googleapis';
import fs from 'fs';
import readline from 'readline';

const CREDENTIALS_PATH = './data/credentials/oauth-credentials.json';
const TOKEN_PATH = './data/credentials/oauth-token.json';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function main() {
  // Leer credenciales
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Generar URL de autorización
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('🔐 Autoriza esta app visitando esta URL:\n');
  console.log(authUrl);
  console.log('\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('📋 Ingresa el código de autorización aquí: ', async (code) => {
    rl.close();

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      // Guardar token
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('\n✅ Token guardado en:', TOKEN_PATH);
      console.log('\n🎉 ¡Listo! Ahora puedes usar Google Drive en el bot.');
    } catch (error) {
      console.error('❌ Error obteniendo token:', error);
    }
  });
}

main();
