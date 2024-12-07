const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, jidDecode } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

// Kike bot responses
const kike_responses = [
  "Yo me voy a dormir tranquilo, pq yo se que jugué mejor aunque perdí",
  "No es de ahuevo ganar, lo importante es divertirse",
  "Ni pedo, a levantar la cabeza, fue un partido difícil, y a pensar en el juego del fin de semana",
  "La bronca de ten hag es que sus títulos menores enmascararon los resultados malos",
  "Ya me llego el anillo de Pinedo"
];

const PORT = process.env.PORT || 8080;

// Start Express server to satisfy Cloud Run's health check
const app = express();
app.get('/', (req, res) => res.send('WhatsApp Bot is running'));
app.listen(PORT, () => console.log(`Health check server listening on port ${PORT}`));

// Function to initialize the bot
const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const store = makeInMemoryStore({});
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  store.bind(sock.ev);

  // Listen for QR code
  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) {
      console.log('Scan the QR code to authenticate');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('Connected successfully!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Listen to messages
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (!message.message || message.key.fromMe) return;

    const from = message.key.remoteJid; // Sender ID or group ID
    const textMessage = message.message.conversation || message.message.extendedTextMessage?.text;
    const msg = textMessage.toLowerCase();

    console.log(`[${from}] ${textMessage}`);

    if (from.endsWith('@g.us')) {
      if (msg.includes('kike bot') || msg.includes('kikebot')) {
        const randomResponse = kike_responses[Math.floor(Math.random() * kike_responses.length)];
        await sock.sendMessage(from, { text: randomResponse });
      } else if (msg === '!commands') {
        await sock.sendMessage(from, { text: `Estos son los comandos que puedes usar:\n- kikebot\n- kike bot` });
      } else if (msg.includes('napo')) {
        await sock.sendMessage(from, { text: `Napo es un pendejo` });
      }
    }
  });
};

// Start the bot
startBot().catch((err) => {
  console.error('Failed to start the bot:', err);
});
