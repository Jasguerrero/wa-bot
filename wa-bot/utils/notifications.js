const {getPendingNotifications, updateNotificationStatus} = require('../notifications/responses');

const notificationsTask = async (sock, notificationsURL) => {
    d = new Date();
    today = d.toISOString().slice(0, 10)
    try {
        sentMessages = 0
        console.log(`Running notifications task`);
        notifications = await getPendingNotifications(notificationsURL)
        for(i = 0; i < notifications.length; i++){
            notification = notifications[i]
            if (notification.phone == null) {
                console.log(`Missing phone number for user_id: ${notification.user_id}`)
                data = await updateNotificationStatus(notificationsURL, notification, 'undeliverable')
                console.log(`Mark as undeliverable ${data.id}`)
                continue
            }
            const jid = `${notification.phone}@s.whatsapp.net`;
            const [result] = await sock.onWhatsApp(jid);
            if (result && result.exists) {
                // Use the exact JID returned by onWhatsApp
                const message = await sock.sendMessage(result.jid, { 
                    text: notification.message
                });
                
                // Log the message info to see what's happening
                console.log('Message sent with ID:', message.key.id);
                console.log('To JID:', message.key.remoteJid);
                sentMessages++;

                data = await updateNotificationStatus(notificationsURL, notification, 'sent')
                console.log(`Marked as sent ${data.id}`)
            } else {
                console.log(`Phone number not in whatsapp: ${jid}`)
                data = await updateNotificationStatus(notificationsURL, notification, 'undeliverable')
                console.log(`Mark as undeliverable ${data.id}`)
            }
        }
        console.log(`Finished running notifications task, sent messages: ${sentMessages}`);
    } catch (error) {
        console.error('Error sending periodic message:', error);
    }
};

module.exports = {
    notificationsTask
}
