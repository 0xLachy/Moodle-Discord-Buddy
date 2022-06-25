const fs = require("fs")

const getFiles = (path, ending) => {
    return fs.readdirSync(path).filter(f=> f.endsWith(ending))
}

//ENTER TERM URLS HERE
const GetTermURLS = () => { 
    return [ 
        "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=896",
        "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897",
        "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=898"
    ]; 
}

const LismLogin = async (page) => {
    //CHANGE TERM URL HERE
    await page.goto("https://moodle.oeclism.catholic.edu.au/course/recent.php?id=896");
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
    //best band ever! 😍
    //Enter your own nicknames here
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

module.exports = {
    getFiles,
    GetTermURLS,
    LismLogin,
    NicknameToRealName
}