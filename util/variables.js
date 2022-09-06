//colour stuff
const primaryColour = 0x156385;
const errorColour = 0xFF0000;

//REWARDS
const dailyQuizTokens = 25;
const assignmentSubmissionTokens = 75;
const confirmationTokens = 100;

const assignmentBorrowCost = 50;

//PENALTIES
const fakeAssignmentPenalty = 150; // if the confirmation is found that they added a fake assignment

//IMAGES -- Upload them to a file hosting website because it is quicker for embeds
// https://postimages.org/ > https://imgur.com/
const MoodleCoinImgURL = 'https://i.postimg.cc/s2SBqYDx/glowing-m-coin-supernatural.png';
        // 'https://i.imgur.com/h7kg8ZJ.png' // Supernatural coin
        // 'https://i.imgur.com/iMUzCmX.jpeg' // gold coin with letter m
        // 'https://i.imgur.com/eblwSjH.jpeg' // blue coin with letter m
        // 'https://i.imgur.com/M5sJ1zK.png' // abstract m coin
//TODO fix up other scripts to use these colours.js instead of the ones inside util functions
module.exports = {
    primaryColour,
    errorColour,
    MoodleCoinImgURL,
    dailyQuizTokens,
    assignmentSubmissionTokens,
    confirmationTokens,
    assignmentBorrowCost,
    fakeAssignmentPenalty,
}