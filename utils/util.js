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
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.tibia.com',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                }
            });
            
            const arr = Array.from(chatIDs);
            for (let i = 0; i < arr.length; i++) {
                console.log(`Sending message to: ${arr[i]}`);
                console.log(imageUrl);
                await sock.sendMessage(arr[i], {
                    image: { stream: imageResponse.data },
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
