const {handleTibiaResponse, isGermanyTimeBetween10And11AM} = require('../tibia/responses');

const sendPeriodicMessage = async (sock, chatIDs, runnedBefore) => {
    if (runnedBefore[0]) {
        console.log('Cronjob runned before')
        return;
    }
    try {
        console.log(`Running cronjob`);
        if (isGermanyTimeBetween10And11AM(new Date())) {
            const r = await handleTibiaResponse("!boss");
            const arr = Array.from(chatIDs);
            for (let i = 0; i < arr.length; i++) {
                console.log(`Sending message to: ${arr[i]}`)
                await sock.sendMessage(arr[i], { text: r });
                console.log('Message sent to:', arr[i]);
            }
            runnedBefore[0] = true;
        } else {
            console.log('Not server save yet')
        }
    } catch (error) {
        console.error('Error sending periodic message:', error);
    }
};

module.exports = {
    sendPeriodicMessage
}
