/**
 * Parses a message and returns a response based on the !house command.
 * @param {string} msg - The message received.
 * @returns {string} - The response message or an empty string if no valid command is found.
 */
const axios = require('axios');

/**
 * Parses a message and fetches house data from TibiaData API.
 * @param {string} msg - The message received.
 * @returns {Promise<string>} - A response message or error.
 */
const handleTibiaResponse = async (msg) => {
  // Split the message by whitespace
  const parts = msg.trim().split(/\s+/);

  // Check if the command is "!house" and has exactly 3 words
  if (parts[0] === '!house' && parts.length === 3) {
    const [, world, city] = parts;

    try {
      // Make GET request to TibiaData API
      const response = await axios.get(`https://api.tibiadata.com/v4/houses/${world}/${city}`);

      // Check if HTTP status code is 200
      if (response.status === 200 && response.data?.houses?.house_list) {
        const houseList = response.data.houses.house_list;

        // Filter houses that are auctioned
        const auctionedHouses = houseList.filter(house => house.auction?.auctioned === true);

        if (auctionedHouses.length === 0) {
          return `No auctioned houses found in ${city}, ${world}.`;
        }

        // Format auctioned houses into a readable list
        const houseDetails = auctionedHouses.map(house => {
          return `Name: ${house.name}, Rent: ${house.rent} gold, Size: ${house.size} SQM, Time Left: ${house.auction.time_left}`;
        }).join('\n');

        return `Auctioned Houses in ${city}, ${world}:\n${houseDetails}`;
      } else {
        return `${world} and ${city} not found.`;
      }
    } catch (error) {
      console.error('Error fetching house data:', error.message);
      return `${world} and ${city} not found.`;
    }
  }

  // Return an empty string if no valid command is found
  return '';
};

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