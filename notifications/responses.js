const axios = require('axios');

const getPendingNotifications = async (notificationsURL) => {
    console.log('Fetching pending notifications')
    const response = await axios.get(`http://${notificationsURL}/notifications/pending`);
    // Check if HTTP status code is 200
    if (response.status === 200) {
      return response.data;
    } else {
        console.log(response)
        return []
    } 
}

const updateNotificationStatus = async (notificationsURL, notification, status) => {
    console.log('Updating notification status')
    const response = await axios.post(`http://${notificationsURL}/notifications/${notification.id}/update-status`, {
        user_id: notification.user_id,
        status: status
    });
    // Check if HTTP status code is 200
    if (response.status === 200) {
      return response.data;
    } else {
        console.log(response)
        return {}
    } 
}

module.exports = {
    getPendingNotifications,
    updateNotificationStatus
};
