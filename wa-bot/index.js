require('dotenv').config({ path: './wa-bot/.env' });
const { MongoClient } = require('mongodb');
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { startNotificationConsumer } = require('./utils/consumer');
const redis = require('redis');

const MAX_RETRIES = 5; // Maximum number of retries
let retryCount = 0;
const environment = process.env.ENVIRONMENT;

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

const mongoUri = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
let mongoClient = null;

const connectToMongo = async () => {
  try {
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    console.log('Connected to MongoDB successfully');
    return mongoClient;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Try to continue even if MongoDB fails - critical path should work
    return null;
  }
};

// Store references to intervals so we can clear them on reconnection
let rabbitMQConsumer = null;

// Function to clear existing intervals
const clearIntervals = async () => {
  if (rabbitMQConsumer) {
    try {
      if (rabbitMQConsumer.channel) {
        await rabbitMQConsumer.channel.close();
      }
      if (rabbitMQConsumer.connection) {
        await rabbitMQConsumer.connection.close();
      }
    } catch (err) {
      console.error('Error closing RabbitMQ connections:', err);
    }
    rabbitMQConsumer = null;
  }
};

// Function to initialize the bot
const startBot = async () => {
  console.log('Initializing WhatsApp bot...');

  try {
    await connectToMongo();
    const { state, saveCreds } = await useMultiFileAuthState('./wa-bot/auth_info');
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
        
        // Set up notification consumer
        clearIntervals()
        startNotificationConsumer(sock, mongoClient).catch(err => {
          console.error('Error setting up notification consumer', err);
        });
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
      console.log(`phone: [${from}] message: [${textMessage}]`);

      if (from.includes("1625327984@g.us")) {
        console.log("generic bot group")
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
  await clearIntervals();
  console.log('Bot shutting down...');
  if (redisClient.isOpen) {
    await redisClient.quit();
    console.log('Redis connection closed');
  }
  if (mongoClient) {
    await mongoClient.close();
    console.log('MongoDB connection closed');
  }
  process.exit(0);
});

// Start the bot
startBot();
