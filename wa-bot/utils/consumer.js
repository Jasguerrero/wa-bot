const amqp = require('amqplib');
const { processTibiaNotification } = require('../tibia/notification');

/**
 * Starts a RabbitMQ consumer that processes WhatsApp notification messages
 * @param {Object} sock - The WhatsApp socket connection
 * @param {Object} mongoClient - MongoDB client connection
 * @returns {Promise<Object>} - Returns the RabbitMQ connection and channel
 */
const startNotificationConsumer = async (sock, mongoClient, chatIDs) => {
    try {
        console.log('Starting RabbitMQ notification consumer...');
        
        // RabbitMQ connection parameters
        const rabbitMQUrl = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:5672`;
        
        // Connect to RabbitMQ
        const connection = await amqp.connect(rabbitMQUrl);
        const channel = await connection.createChannel();
        
        // Make sure the queue exists
        await channel.assertQueue('notification_queue', { durable: true });
        
        console.log('Connected to RabbitMQ, waiting for notification messages...');
        
        // Get MongoDB collection for audit logs
        const db = mongoClient.db('wa-bot');
        const notificationsCollection = db.collection('notifications');
        
        // Set prefetch to 1 to ensure we process one message at a time
        channel.prefetch(1);
        
        // Consume messages
        channel.consume('notification_queue', async (msg) => {
            if (msg !== null) {
                const notificationRecord = {
                    timestamp: new Date()
                };
                let notificationResult = false;
        
                try {
                    const notification = JSON.parse(msg.content.toString());
                    console.log('Received notification message:', notification);
                    notificationRecord.message = notification;
                    
                    // Process the notification
                    if (notification.type == "tibia_notification") {
                        notificationResult = await processTibiaNotification(notificationRecord, notification, sock, channel, msg, chatIDs)
                    }
                    else if (notification.phone && notification.message) {
                        notificationResult = await processNotification(notificationRecord, notification, sock, channel, msg)
                    } else {
                        console.error('Invalid message format, missing phone or message:', notification);
                        // Don't requeue invalid messages
                        channel.ack(msg);
                        if (!notification.phone) {
                            notificationRecord.status = 'missing_phone';
                        } else {
                            notificationRecord.status = 'missing_message';
                        }
                        notificationResult = true;
                    }
                } catch (processingError) {
                    console.error('Error processing notification message:', processingError);
                    // Requeue the message on processing error
                    channel.reject(msg, true);
                } finally {
                    // Save only ack messages
                    try {
                        if (notificationResult) {
                            await notificationsCollection.insertOne(notificationRecord);
                            console.log('Message logged to notifications database');
                        }
                    } catch (dbError) {
                        console.error(`Failed to insert ${notificationRecord}`, dbError);
                    }
                }
            }
        },{
            noAck: false
        }); // Explicit acknowledgment mode
    
        // Handle connection close events
        connection.on('close', async () => {
            console.log('RabbitMQ connection closed, attempting to reconnect...');
            // Wait before attempting to reconnect
            await new Promise(resolve => setTimeout(resolve, 5000));
            return startNotificationConsumer(sock, mongoClient, chatIDs);
        });
    
        // Handle errors
        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
        });
    
        return { connection, channel };
    } catch (error) {
        console.error('Failed to start notification consumer:', error);
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000));
        return startNotificationConsumer(sock, mongoClient, chatIDs);
    }
};

const processNotification = async (notificationRecord, notification, sock, channel, msg) => {
    const jid = `${notification.phone}@s.whatsapp.net`;

    try {
        // Check if the number exists on WhatsApp
        const [result] = await sock.onWhatsApp(jid);
        if (result && result.exists) {
            // Send message using the exact JID returned by onWhatsApp
            const message = await sock.sendMessage(result.jid, { 
                text: notification.message
            });
            // ack message inmediatly even to not spam users in case of unexpected errors
            channel.ack(msg);
            console.log('Message sent with ID:', message.key.id);
            console.log('To JID:', message.key.remoteJid);
            console.log(`Successfully delivered notification ${notification.id} to ${notification.phone}`);

            notificationRecord.status = 'delivered'
            notificationRecord.recipient = notification.phone;
            notificationRecord.message_id = message.key.id;
            notificationRecord.remote_jid = message.key.remoteJid;
        } else {
            console.log(`Phone number not in WhatsApp: ${jid}`);

            // Ack invalid phone and not retry message
            channel.ack(msg);
            notificationRecord.status = 'undeliverable_number_not_on_whatsapp';
        }
    } catch (whatsappError) {
        console.error(`Error sending WhatsApp message to ${jid}:`, whatsappError);
        // Unack and retry message on whatsapp errors
        channel.reject(msg, true);
        return false;
    }
    return true;
}

module.exports = { startNotificationConsumer };
