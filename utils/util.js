const {handleTibiaResponse} = require('../tibia/responses');
const fs = require('fs');
const path = require('path');

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
            
            // Extract the filename from the URL
            const imageName = path.basename(imageUrl);
            
            // Path to the downloaded boss images
            const bossImagesDir = path.join(__dirname, '../boss_images');
            const bossImagePath = path.join(bossImagesDir, imageName);
            
            // Check if we have the image
            const hasImage = fs.existsSync(bossImagePath);
            console.log(`${hasImage ? 'Found' : 'Could not find'} image: ${imageName}`);
            
            const arr = Array.from(chatIDs);
            for (let i = 0; i < arr.length; i++) {
                console.log(`Sending message to: ${arr[i]}`);
                
                if (hasImage) {
                    // Send message with local boss image
                    await sock.sendMessage(arr[i], {
                        image: { url: bossImagePath },
                        caption: response
                    });
                } else {
                    // If we don't have the image, send text only as a fallback
                    await sock.sendMessage(arr[i], { 
                        text: response 
                    });
                }
                
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
