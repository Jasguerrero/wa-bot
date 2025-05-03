const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

/**
 * Downloads an image from a URL to a temporary file
 * @param {string} url - The URL of the image to download
 * @returns {Promise<string|null>} - Path to the temporary file or null if download failed
 */
const downloadImage = async (url) => {
    if (!url) return null;
    
    // Create a temporary file path with proper extension
    let fileExtension = '.jpg';
    try {
        // Extract the file extension from the URL or default to .jpg
        const urlPath = new URL(url).pathname;
        const urlExtension = path.extname(urlPath).toLowerCase();
        
        // Use the original extension if it exists and is a common image format
        if (urlExtension && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(urlExtension)) {
            fileExtension = urlExtension;
        }
    } catch (error) {
        console.warn(`Could not parse URL for extension, using default: ${url}`, error);
        // Continue with default extension
    }
    
    const tempDir = os.tmpdir();
    const fileName = `tibia_image_${Date.now()}${fileExtension}`;
    const filePath = path.join(tempDir, fileName);
    
    try {
        // Fetch the image with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const imageResponse = await fetch(url, { 
            signal: controller.signal 
        }).finally(() => clearTimeout(timeoutId));
        
        if (!imageResponse.ok) {
            console.error(`Error downloading image: ${imageResponse.status} ${imageResponse.statusText}`);
            return null;
        }
        
        // Save the image to temp file
        const fileStream = fs.createWriteStream(filePath);
        await pipeline(imageResponse.body, fileStream);
        console.log(`Image downloaded to: ${filePath}`);
        
        return filePath;
    } catch (error) {
        console.error(`Error downloading image from ${url}:`, error);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath); // Clean up partial file if it exists
            } catch (cleanupError) {
                console.error(`Error cleaning up partial file: ${filePath}`, cleanupError);
            }
        }
        return null;
    }
};

/**
 * Cleans up a temporary file if it exists
 * @param {string|null} filePath - Path to the file to remove
 */
const cleanupTempFile = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`Temporary image file removed: ${filePath}`);
        } catch (error) {
            console.error(`Error removing temporary image file: ${filePath}`, error);
        }
    }
};

/**
 * Processes Tibia notifications and sends them via WhatsApp
 */
const processTibiaNotification = async (notificationRecord, notification,
    sock, channel, msg, chatIDs) => {
    console.log('New boss information detected, sending messages...');
    const arr = Array.from(chatIDs);
    const imagePath = notification.image_url;
    const response = notification.message;
    let success = [];
    let tempImagePath = null;
    
    try {
        // Try to download the image if URL is provided, but continue even if it fails
        if (imagePath) {
            try {
                tempImagePath = await downloadImage(imagePath);
            } catch (downloadError) {
                console.error(`Failed to download image, will send text-only message:`, downloadError);
                // Continue with null tempImagePath which will result in text-only message
            }
        }

        for (let i = 0; i < arr.length; i++) {
            console.log(`Sending message to: ${arr[i]}`);
            let payload;
            
            if (tempImagePath) {
                payload = {
                    image: { url: tempImagePath },
                    caption: response
                };
            } else {
                payload = {
                    text: response
                };
            }
            
            try {
                await sock.sendMessage(arr[i], payload);
                console.log('Message sent to:', arr[i]);
                success.push(arr[i]);
            } catch(whatsappError) {
                console.error(`Error sending WhatsApp message to ${arr[i]}:`, whatsappError);
            }
        }

        // Process results
        if (success.length === 0) {
            channel.reject(msg, true);
            return false;
        }

        if (success.length === arr.length) {
            notificationRecord.status = 'delivered';
        } else {
            notificationRecord.status = 'partial';
        }
        
        notificationRecord.recipient = success;
        channel.ack(msg);
        return true;
    } finally {
        // Always clean up the temp file, regardless of success or failure
        cleanupTempFile(tempImagePath);
    }
};

module.exports = { 
    processTibiaNotification,
};
