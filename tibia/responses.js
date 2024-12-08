/**
 * Parses a message and returns a response based on the !house command.
 * @param {string} msg - The message received.
 * @returns {string} - The response message or an empty string if no valid command is found.
 */
const axios = require('axios');
const {
    TIBIA_API_URL
} = require('./constants');

/**
 * Parses a message and fetches house data from TibiaData API.
 * @param {string} msg - The message received.
 * @returns {Promise<string>} - A response message or error.
 */
const handleTibiaResponse = async (msg) => {
  // Split the message by whitespace
  const parts = msg.trim().split(/\s+/);

  // Check if the command is "!house" and has exactly 3 words
  let response = ''
  if (parts[0] === '!commands') {
    response = 'Comandos: \n!house {world} {city} (ejemplo: !house pacera thais)\n!boss\n'
  } else if (parts[0] === '!house' && parts.length >= 3) {
    const world = parts[1];
    const city = parts.slice(2).join(' ');
    response = await getHousesDetail(world, city)
  } else if (parts[0] === '!boss') {
    response = await getBoostedBoss();
  }

  // Return an empty string if no valid command is found
  return response;
};

const getHousesDetail = async (world, city) => {
    try {
        // Make GET request to TibiaData API
        const response = await axios.get(`${TIBIA_API_URL}/houses/${world}/${city}`);
  
        // Check if HTTP status code is 200
        if (response.status === 200 && response.data?.houses?.house_list) {
          console.log(response.data)
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
    try {
        // Make GET request to TibiaData API
        const response = await axios.get(`${TIBIA_API_URL}/boostablebosses/`);
  
        // Check if HTTP status code is 200
        if (response.status === 200 && response.data?.boostable_bosses?.boosted) {
          console.log(response.data)
          const boostedBoss = response.data.boostable_bosses.boostable_bosses;
          return `Boosted boss: ${boostedBoss.name}`;
        } else {
            console.log(response)
            return `Error getting boss`;
        }
      } catch (error) {
        console.error('Error fetching boosted boss:', error.message);
        return `Error`;
      }
} 

const isGermanyTimeBetween10And11AM = () => {
    const now = new Date();
    const germanyTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false, // Use 24-hour format
    }).formatToParts(now);
  
    const hour = parseInt(germanyTime.find((part) => part.type === 'hour').value, 10);
  
    // Check if the hour is between 10 and 11 AM
    return hour === 10;
  };

  module.exports = handleTibiaResponse;