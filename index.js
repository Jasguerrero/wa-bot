require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { handleTibiaResponse } = require('./tibia/responses');
const { sendPeriodicMessage } = require('./utils/util');
const { notificationsTask } = require('./utils/notifications');
const redis = require('redis');

// Kike bot responses
const kike_responses = [
  "Yo me voy a dormir tranquilo, pq yo se que jugué mejor aunque perdí",
  "No es de ahuevo ganar, lo importante es divertirse",
  "Ni pedo, a levantar la cabeza, fue un partido difícil, y a pensar en el juego del fin de semana",
  "La bronca de ten hag es que sus títulos menores enmascararon los resultados malos",
  "Ya me llego el anillo de Pinedo",
  "No importa lo que yo opine, porque la hubieran usado o no, yo no me bajo del barco de amorin",
  "Valen verga esos cabrones",
  "Seguimos adelante"
];

const MAX_RETRIES = 5; // Maximum number of retries
let retryCount = 0;
const environment = process.env.ENVIRONMENT;
const tibiaGroupIDs = process.env.TIBIA_GROUPS;
const tibiaGroupSet = new Set(tibiaGroupIDs.split(','));
const ticketsNotificationsURL = process.env.TICKETS_NOTIFICATIONS_URL;
let runnedBefore = {};

// Redis configuration
const redisClient = redis.createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

// Connect to Redis
(async () => {
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
  await redisClient.connect();
  console.log('Connected to Redis successfully');
})();

// Store references to intervals so we can clear them on reconnection
let periodicMessageInterval = null;
let notificationsInterval = null;

// Function to clear existing intervals
const clearIntervals = () => {
  if (periodicMessageInterval) {
    clearInterval(periodicMessageInterval);
    periodicMessageInterval = null;
  }
  
  if (notificationsInterval) {
    clearInterval(notificationsInterval);
    notificationsInterval = null;
  }
};

// Function to set up the scheduled tasks
const setupScheduledTasks = (sock) => {
  // Clear any existing intervals first
  clearIntervals();
  
  // Set up new intervals
  periodicMessageInterval = setInterval(
    () => sendPeriodicMessage(sock, tibiaGroupSet, runnedBefore, redisClient), 
    10 * 30 * 1000
  ); // Every 10 minutes
  
  notificationsInterval = setInterval(
    () => notificationsTask(sock, ticketsNotificationsURL), 
    10 * 1000
  ); // Every 10 seconds
  
  console.log('Scheduled tasks initialized');
};

// Function to initialize the bot
const startBot = async () => {
  console.log('Initializing WhatsApp bot...');

  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const store = makeInMemoryStore({});
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });

    store.bind(sock.ev);

    // Listen for QR code
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('Scan the QR code to authenticate');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        // Clear intervals when connection closes
        clearIntervals();
        
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
        console.log('Connection closed. Reconnecting...', shouldReconnect);

        if (shouldReconnect) {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retry attempt ${retryCount} of ${MAX_RETRIES}`);
            startBot();
          } else {
            console.error('Max retries reached. Exiting...');
            process.exit(1);
          }
        } else {
          console.error('Authentication error. Please re-scan the QR code.');
          process.exit(1);
        }
      }

      if (connection === 'open') {
        console.log('Connected successfully!');
        require('log-timestamp');
        retryCount = 0; // Reset retry count on successful connection
        
        // Set up the scheduled tasks after successful connection
        setupScheduledTasks(sock);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Listen to messages
    sock.ev.on('messages.upsert', async (m) => {
      const message = m.messages[0];
      if (!message.message || (message.key.fromMe && environment === "prod")) return;

      const from = message.key.remoteJid; // Sender ID or group ID
      const textMessage = message.message.conversation || message.message.extendedTextMessage?.text;
      if (textMessage == null) {
        return;
      }
      const msg = textMessage.toLowerCase();
      console.log(`[${from}] ${textMessage}`);

      if (from.includes("1625327984@g.us")) {
        if (msg.includes('kike bot') || msg.includes('kikebot') || msg.includes("5663596435")) {
          const randomResponse = kike_responses[Math.floor(Math.random() * kike_responses.length)];
          await sock.sendMessage(from, { text: randomResponse });
        } else if (msg === '!commands') {
          await sock.sendMessage(from, { text: `Estos son los comandos que puedes usar:\n- kikebot\n- kike bot` });
        } else if (msg.includes('napo')) {
          await sock.sendMessage(from, { text: `Napo es un pendejo` });
        }
      }
      else if(tibiaGroupSet.has(from)) {
        const r = await handleTibiaResponse(msg);
        if (r == '') {
            return;
        }
        await sock.sendMessage(from, { text: r });
      }
    });

  } catch (error) {
    console.error('Failed to start the bot:', error);
    
    // Clear intervals on error
    clearIntervals();

    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`Retry attempt ${retryCount} of ${MAX_RETRIES}`);
      startBot();
    } else {
      console.error('Max retries reached. Exiting...');
      process.exit(1);
    }
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  clearIntervals();
  console.log('Bot shutting down...');
  if (redisClient.isOpen) {
    await redisClient.quit();
    console.log('Redis connection closed');
  }
  process.exit(0);
});

// Start the bot
startBot();
