const {handleTibiaResponse} = require('../tibia/responses');
const axios = require('axios');
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
            
            // Create a temporary file path
            const imageName = path.basename(imageUrl);
            const tempDir = path.join(__dirname, '../temp');
            const imagePath = path.join(tempDir, imageName);
            
            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // Download and save the image
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.tibia.com',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                }
            });
            
            // Write to file
            fs.writeFileSync(imagePath, Buffer.from(imageResponse.data));
            console.log(`Image saved to ${imagePath}`);
            
            const arr = Array.from(chatIDs);
            for (let i = 0; i < arr.length; i++) {
                console.log(`Sending message to: ${arr[i]}`);
                console.log(imageUrl);
                
                // Send image from local file
                await sock.sendMessage(arr[i], {
                    image: { url: imagePath },
                    caption: response
                });
                
                console.log('Message sent to:', arr[i]);
            }
            
            // Clean up temp file
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log('Temp image file removed');
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
