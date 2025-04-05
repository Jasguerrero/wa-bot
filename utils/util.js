const {handleTibiaResponse} = require('../tibia/responses');

const sendPeriodicMessage = async (sock, chatIDs, redisClient) => {
    try {
        console.log(`Running cronjob`);
        
        // Get the boss information
        const [response, imageUrl] = await handleTibiaResponse("!boss");
        
        // If response contains "Error", do nothing
        if (response.includes("Error")) {
            console.log('Response contains error, skipping...');
            return;
        }
        
        // Get the last response we stored in Redis
        const lastResponse = await redisClient.get('last_boss_response');
        
        // If the response is different from what we have stored in Redis, send messages
        if (response !== lastResponse) {
            console.log('New boss information detected, sending messages...');
            
            const arr = Array.from(chatIDs);
            for (let i = 0; i < arr.length; i++) {
                console.log(`Sending message to: ${arr[i]}`);
                console.log(imageUrl);
                await sock.sendMessage(arr[i], {
                    image: { url: imageUrl },
                    caption: response
                });
                console.log('Message sent to:', arr[i]);
            }
            
            // Store the new response in Redis with 36-hour TTL
            await redisClient.set('last_boss_response', response, {
                EX: 36 * 60 * 60 // 36 hours in seconds
            });
            
            console.log('Updated cached response in Redis');
        } else {
            console.log('Boss information unchanged, no messages sent');
        }
    } catch (error) {
        console.error('Error sending periodic message:', error);
    }
};

module.exports = {
    sendPeriodicMessage
}
