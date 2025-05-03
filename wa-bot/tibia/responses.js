/**
 * Parses a message and returns a response based on the !house command.
 * @param {string} msg - The message received.
 * @returns {string} - The response message or an empty string if no valid command is found.
 */
const axios = require('axios');
const {
    TIBIA_API_URL
} = require('./constants');
const fs = require('fs');
const path = require('path');

function isValidTibiaCommand(parts) {
  if (!parts || parts.length === 0) {
    return false;
  }
  const validCommands = new Set(["!commands", "!house", "!boss"]);
  const command = parts[0];
  return validCommands.has(command);
}

const handleTibiaResponse = async (msg, jid, sock) => {
  // Split the message by whitespace
  const parts = msg.trim().split(/\s+/);
  if (!isValidTibiaCommand(parts)) {
    return ['', ''];
  }

  await sock.sendPresenceUpdate('composing', jid);

  let response = ''
  let image = ''
  if (parts[0] === '!commands') {
    response = 'Comandos: \n!house {world} {city} (ejemplo: !house pacera thais)\n!boss\n'
  } else if (parts[0] === '!house' && parts.length >= 3) {
    const world = parts[1];
    const city = parts.slice(2).join(' ');
    response = await getHousesDetail(world, city)
  } else if (parts[0] === '!boss') {
    [response, image] = await getBoostedBoss();
  }

  await sock.sendPresenceUpdate('paused', jid);
  return [response, image];
};

const getHousesDetail = async (world, city) => {
    try {
        // Make GET request to TibiaData API
        console.log('Fetching house data...')
        const response = await axios.get(`${TIBIA_API_URL}/houses/${world}/${city}`);
  
        // Check if HTTP status code is 200
        if (response.status === 200 && response.data?.houses?.house_list) {
          const houseList = response.data.houses.house_list;
  
          // Filter houses that are auctioned
          const auctionedHouses = houseList.filter(house => house.auctioned === true);
  
          if (auctionedHouses.length === 0) {
            return `No auctioned houses found in ${city}, ${world}.`;
          }
  
          // Format auctioned houses into a readable list
          const houseDetails = auctionedHouses.map(house => {
            return `Name: ${house.name}, Rent: ${house.rent} gold, Size: ${house.size} SQM, Current Bid: ${house.auction.current_bid}, Time Left: ${house.auction.time_left}\n`;
          }).join('\n');
  
          return `Auctioned Houses in ${city}, ${world}:\n\n${houseDetails}`;
        } else {
          return `${world} and ${city} not found.`;
        }
      } catch (error) {
        console.error('Error fetching house data:', error.message);
        return `Error: ${world} and ${city} not found.`;
      }
}

const getBoostedBoss = async () => {
      // Make GET request to TibiaData API
      console.log('Fetching boosted boss...')
      const response = await axios.get(`${TIBIA_API_URL}/boostablebosses/`);

      // Check if HTTP status code is 200
      if (response.status === 200 && response.data?.boostable_bosses?.boosted) {
        const boostedBoss = response.data.boostable_bosses.boosted;
        return [`Boosted boss: ${boostedBoss.name}`, `${getImage('boss_images', boostedBoss.image_url)}`];
      } else {
          console.log(response)
          return [`Error getting boss`, ''];
      } 
}

const getImage = (imageDir, imageUrl) => {
  const imageName = path.basename(imageUrl);

  // Path to the downloaded boss images
  const fullDir = path.join(__dirname, `../${imageDir}`);
  const imagePath = path.join(fullDir, imageName);
  
  // Check if we have the image
  const hasImage = fs.existsSync(imagePath);
  console.log(`${hasImage ? 'Found' : 'Could not find'} image: ${imagePath}`);
  if (hasImage){
    return imagePath
  }
  return ''
}

const isGermanyTimeBetween10And11AM = (date) => {
    //const now = new Date();
    const germanyTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false, // Use 24-hour format
    }).formatToParts(date);
    console.log(germanyTime);
  
    const hour = parseInt(germanyTime.find((part) => part.type === 'hour').value, 10);
    const minute = parseInt(germanyTime.find((part) => part.type === 'minute').value, 10);

    // Check if time is between 10:10 AM and 11:00 AM
    return (hour === 10 && minute >= 10) || (hour === 11 && minute === 0);
  };

module.exports = {
  handleTibiaResponse,
  isGermanyTimeBetween10And11AM,
  getBoostedBoss
};
