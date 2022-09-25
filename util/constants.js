//* put everything added here into module.exports

//todo get rid of using bot owners in client, and use it from here instead, seems cleaner
//Your discord id, get that by being in developer mode and right clicking on your profile in a chat and copy id
const botOwners = ['618689924970840103'];
//colour stuff
const primaryColour = 0x156385;
const errorColour = 0xFF0000;

//REWARDS
const dailyQuizTokensPerQuestion = 2.5;
const assignmentSubmissionTokens = 75;
const confirmationTokens = 100;

//cost of borrowing another persons assignment
const assignmentBorrowCost = 100;
//how much the owner of the assignment gets
const assignmentSharedTokens = 75;

//PENALTIES
// if the confirmation is found that they added a fake assignment, 
// they lose their submission tokens, so the lose this amount from the whole situation
const fakeAssignmentPenalty = 50; 

//IMAGES -- Upload them to a file hosting website because it is quicker for embeds
// https://postimages.org/ > https://imgur.com/
const MoodleCoinImgURL = 'https://i.postimg.cc/s2SBqYDx/glowing-m-coin-supernatural.png';
// 'https://i.imgur.com/h7kg8ZJ.png' // Supernatural coin
// 'https://i.imgur.com/iMUzCmX.jpeg' // gold coin with letter m
// 'https://i.imgur.com/eblwSjH.jpeg' // blue coin with letter m
// 'https://i.imgur.com/M5sJ1zK.png' // abstract m coin

module.exports = {
    botOwners,
    primaryColour,
    errorColour,
    MoodleCoinImgURL,
    dailyQuizTokensPerQuestion,
    assignmentSubmissionTokens,
    confirmationTokens,
    assignmentBorrowCost,
    assignmentSharedTokens,
    fakeAssignmentPenalty,
}