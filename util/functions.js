const fs = require("fs")
//VARIABLES
const currentTerm = 2;
const classAmount = 26;
const contextId = 124194;

const primaryColour = "#156385";
const errorColour = "#FF0000";

const mainStaticUrl = "https://moodle.oeclism.catholic.edu.au/";
const courseIDs = ["896", "897", "898"]
//example urls:
// const TermURLS = [ 
//         "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=896",
//         "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897",
//         "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=898"
// ]; 
//const participantURL = `https://moodle.oeclism.catholic.edu.au/user/index.php?contextid=123980&id=896&perpage=${classAmount}`;


//best band ever! 😍
//make sure that they are all lowercase
const nicknames = {
    "lachy": "lachlan",
    "lociānus": "lachlan",
    "locianus": "lachlan",
    "harrisonus": "harrison",
    "harry": "harrison",
    "poohead": "harrison",
    "teacher": "michael",
    "sddmaster": "harrison",
    "jebidiah": "jeb"
}  

const getFiles = (path, ending) => {
    return fs.readdirSync(path).filter(f=> f.endsWith(ending))
}

//Default is leaderboard cause its used the most
const GetTermURLS = (sectionOfWebsite="leaderboard") => { 
    generatedUrls = []
    switch (sectionOfWebsite) {
        case "leaderboard":
            for (id of courseIDs){
                generatedUrls.push(`${mainStaticUrl}course/recent.php?id=${id}`)
            }
            break;
        case "participants":
            // for (id of courseIDs){
            //     generatedUrls.push(`${mainStaticUrl}user/index.php?contextid=${contextId}&id=${id}&perpage=${classAmount}`)
            // }
            //Minus 1 because 0 indexing (you cant have term zero lol)
            id = courseIDs[currentTerm - 1]
            generatedUrls.push(`${mainStaticUrl}user/index.php?contextid=${contextId}&id=${id}&perpage=${classAmount}`)
            break;
        default:
            break;
    }
    return generatedUrls;
    
    //generate URLs
    // function generateURLS(endingBit){
    //     return ${mainStaticUrl}
    //         fullURLS.push(`${mainStaticUrl}${endingBit}${id}`)
        
    // }
}


const LismLogin = async (page, TermURL=`${mainStaticUrl}course/recent.php?id=${courseIDs[0]}`) => {
    //CHANGE TERM URL HERE
    await page.goto(TermURL);
    // dom element selectors
    const USERNAME_SELECTOR = '#username';
    const PASSWORD_SELECTOR = '#password';
    const BUTTON_SELECTOR = 'body > div > div > div > div.uk-card-body.uk-text-left > div > div.uk-width-3-4 > form > div.uk-margin.uk-text-right > button';

    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(process.env.LISMNAME);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(process.env.PASSWORD);
    await Promise.all([
    page.click(BUTTON_SELECTOR),
    page.waitForNavigation()
    ])
}

const NicknameToRealName = async (inputName) => {
    inputName = inputName.toLowerCase(); 
    for(nicknamePair of Object.entries(nicknames)){
        let [ nickname, trueName ] = nicknamePair;
        if(inputName == nickname) { 
            inputName = trueName;
            break;
        }
    }
    //returns original name if the for loop didn't work
    return inputName;
}

async function ConvertTime(unsortedTime){
    //boom my own regex! LETS GOOOOOO
    //if its now, just return 0 seconds
    if(unsortedTime == "now"){
        return 0
    }
    var timeArr = unsortedTime.match(/[0-9]+[ a-zA-Z]+/g)?.map(time => {
        //multiply by 60 to get hours to mins, then another 60 to get seconds

        //Not sure of years exist
        if(time.includes("year")){
            //console.log("contains year")
            return time.match(/[0-9]+/g)[0] * 365 * 7 * 24 * 60 * 60;
        }
        else if(time.includes("week")){
            //console.log("contains week")
            return time.match(/[0-9]+/g)[0] * 7 * 24 * 60 * 60;
        }
        else if(time.includes("day")){
           // console.log("contains day")
            return time.match(/[0-9]+/g)[0] * 24 * 60 * 60;
        }
        else if(time.includes("hour")){
            //console.log("contains hour")
            return time.match(/[0-9]+/g)[0] * 60 * 60;
        }
        else if(time.includes("min")){
           // console.log("contains min")
            return time.match(/[0-9]+/g)[0] * 60;
        }
        else if(time.includes("sec")){
            //console.log("contains second: " + time)
            //somehow it is stored as text
            return parseInt(time.match(/[0-9]+/g)[0]);
        }
        else{
            console.log("don't know " + time)
            return time.match(/[0-9]+/g)[0];
        }
    });
    //Adds the seconds together if array is not null
    secondTime = timeArr?.reduce((x,y) => x + y);
    //console.log(secondTime)
    return secondTime;
}
module.exports = {
    getFiles,
    GetTermURLS,
    LismLogin,
    NicknameToRealName,
    ConvertTime,
    classAmount,
    courseIDs,
    primaryColour,
    errorColour
}