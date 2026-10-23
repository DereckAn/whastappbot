import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import { config } from "../config.js";
import { setupMessageHandler } from "./handler.js";
import { botState } from "../web/state.js";

export async function startWhatsApp(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(config.whatsappAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
    });

    sock.ev.on("creds.update", saveCreds);
    // Adjuntar aquí para que cada socket (incluidas las reconexiones) tenga handler
    setupMessageHandler(sock);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection) botState.connection = connection;
        if (connection === "open") {
            botState.qr = null;
            botState.me = sock.user?.id.split(/[:@]/)[0] ?? null;
        }

        if (qr) {
            botState.connection = "qr";
            botState.qr = qr;
            botState.qrVersion++;
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

