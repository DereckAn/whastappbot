import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import { config } from "../config.js";

export async function startWhatsApp(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(config.whatsappAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("Escanea este QR con WhatsApp:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
            const shouldReconnect =
                (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

            console.log("Conexión cerrada. Reconectando:", shouldReconnect);

            if (shouldReconnect) {
                startWhatsApp();
            }
        }

        if (connection === "open") {
            console.log("✓ Conectado!");
        }
    });

    return sock;
}

