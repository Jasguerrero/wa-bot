const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Function to download a single image with a delay
const downloadImage = async (url, filepath, index, total) => {
  // Check if the file already exists
  if (fs.existsSync(filepath)) {
    const percentage = Math.round((index / total) * 100);
    console.log(`[${percentage}%] Skipped: ${path.basename(filepath)} (already exists)`);
    return true;
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.tibia.com',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    
    fs.writeFileSync(filepath, Buffer.from(response.data));
    const percentage = Math.round((index / total) * 100);
    console.log(`[${percentage}%] Downloaded: ${path.basename(filepath)}`);
    return true;
  } catch (error) {
    console.error(`Error downloading ${url}: ${error.message}`);
    return false;
  }
};

// Function to sleep for a specified time
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main download function
const downloadAllBossImages = async () => {
  // Create directory for boss images
  const imagesDir = path.join(__dirname, 'boss_images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  try {
    console.log('Fetching boss list from Tibia API...');
    const response = await axios.get('https://api.tibiadata.com/v4/boostablebosses');
    const data = response.data;
    
    // Extract all bosses from the list
    const bosses = [];
    
    // Add all boostable bosses (including the currently boosted one)
    if (data.boostable_bosses.boostable_boss_list) {
      bosses.push(...data.boostable_bosses.boostable_boss_list);
    }
    
    console.log(`Found ${bosses.length} bosses. Starting download...`);
    
    // Download each boss image with delays to avoid being blocked
    let successCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i];
      const imageUrl = boss.image_url;
      const imageName = path.basename(imageUrl);
      const imagePath = path.join(imagesDir, imageName);
      
      // Check if the file already exists before download
      if (fs.existsSync(imagePath)) {
        const percentage = Math.round((i + 1) / bosses.length * 100);
        console.log(`[${percentage}%] Skipped: ${imageName} (already exists)`);
        successCount++;
        skippedCount++;
        continue;
      }
      
      // Download the image
      const success = await downloadImage(imageUrl, imagePath, i + 1, bosses.length);
      if (success) successCount++;
      
      // Wait a random time between 1-3 seconds before next download to avoid being blocked
      if (i < bosses.length - 1) {
        const delay = 1000 + Math.random() * 2000;
        await sleep(delay);
      }
    }
    
    console.log(`\nDownload complete! Successfully processed ${successCount} out of ${bosses.length} boss images.`);
    console.log(`${skippedCount} images were already downloaded and skipped.`);
    console.log(`${successCount - skippedCount} new images were downloaded.`);
    console.log(`Images saved to: ${imagesDir}`);
    
    // Create or update the manifest file with just the image URLs
    const simplifiedBosses = bosses.map(boss => ({
      image_url: boss.image_url
    }));
    
    fs.writeFileSync(
      path.join(imagesDir, 'bosses_manifest.json'), 
      JSON.stringify(simplifiedBosses, null, 2)
    );
    console.log('Created/updated bosses_manifest.json with boss image URLs');
    
  } catch (error) {
    console.error('Failed to fetch boss data:', error.message);
  }
};

// Run the script
downloadAllBossImages();
