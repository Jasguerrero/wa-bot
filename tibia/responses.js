
/**
 * Parses a message and returns a response based on the !house command.
 * @param {string} msg - The message received.
 * @returns {string} - The response message or an empty string if no valid command is found.
 */
const handleTibiaResponse = (msg) => {
    if (msg == null) {
        return ''
    }
    // Split the message by whitespace
    const parts = msg.trim().split(/\s+/);

    // Check if the command is "!house" and has exactly 3 words
    if (parts[0] === '!house' && parts.length === 3) {
        const [command, world, city] = parts; // Extract parts
        return `You asked about the house in ${world}, city ${city}.`;
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