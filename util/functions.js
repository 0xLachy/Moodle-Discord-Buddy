const fs = require("fs");
const { MessageEmbed, MessageActionRow, MessageButton, ButtonInteraction } = require('discord.js');
const { resolve } = require("path");
const crypto = require("crypto");

//VARIABLES
const currentTerm = 2;
const classAmount = 26;
const contextId = 124194;

//colour stuff
const primaryColour = "#156385";
const errorColour = "#FF0000";

//course stuff
const mainStaticUrl = "https://moodle.oeclism.catholic.edu.au/";
const dashboardUrl = `${mainStaticUrl}my/index.php`
const courseIDs = ["896", "897", "898"]

//login stuff
const algorithm = "aes-256-cbc"; 
const loginGroups = {};
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

//USE LOGIN GROUPS TO GET ID
const getFiles = (path, ending) => {
    return fs.readdirSync(path).filter(f=> f.endsWith(ending))
}

//Default is leaderboard cause its used the most
const GetTermURLS = (sectionOfWebsite="leaderboard", termId=courseIDs[currentTerm - 1]) => { 
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
            // id = courseIDs[currentTerm - 1]
            //generatedUrls.push(`${mainStaticUrl}user/index.php?contextid=${contextId}&id=${termId}&perpage=5000`)
            generatedUrls.push(`${mainStaticUrl}user/index.php?page=0&perpage=5000&contextid=${contextId}&id=${termId}&newcourse`)
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


const LoginToMoodle = async (page, discordUserId=undefined, TermURL=dashboardUrl, loginDetails=undefined) => {
    // if (TermURL == 'Null') {
    //     console.log(Object.values(await GetCourseUrls(page))[currentTerm - 1])
    //     TermURL = Object.values(await GetCourseUrls(page))[currentTerm - 1]
    // }
    await page.goto(TermURL);
    
    if (discordUserId != undefined){
        if (loginGroups[discordUserId] != undefined) loginDetails = decrypt(...loginGroups[discordUserId]);
    }
    // dom element selectors
    const USERNAME_SELECTOR = '#username';
    const PASSWORD_SELECTOR = '#password';
    const BUTTON_SELECTOR = 'body > div > div > div > div.uk-card-body.uk-text-left > div > div.uk-width-3-4 > form > div.uk-margin.uk-text-right > button';
    
    //TODO USE WAITFORSELECTOR
    try {
        await page.waitForSelector(USERNAME_SELECTOR)
    } catch(err){
        console.logError("login page not working, #Username not found")
        console.log(err)
    }
    
    await page.click(USERNAME_SELECTOR);
    loginDetails != undefined ? await page.keyboard.type(loginDetails.username) : await page.keyboard.type(process.env.LISMNAME);

    await page.click(PASSWORD_SELECTOR);
    loginDetails != undefined ? await page.keyboard.type(loginDetails.password) : await page.keyboard.type(process.env.PASSWORD);
    // try {
        
    // } catch (error) {
        
    // }
    await Promise.all([
    page.click(BUTTON_SELECTOR),
    page.waitForNavigation()
    ])

    //more specific way to get
    let reasonForFailure = await page.evaluate(() => {
        //
        return document.querySelector('div.uk-alert-danger.uk-text-center.uk-alert > p')?.textContent//.textContent body -le
    })
    if (reasonForFailure != undefined && TermURL != page.url()) return new Promise((resolve, reject) => reject(reasonForFailure))
    //If they haven't successfully gotten past login to the wanted url, it bugs out for other urls that aren't dashboard url
    else if (TermURL != await page.url() && TermURL == dashboardUrl) return new Promise((resolve, reject) => reject("Login Failed, wrong username or password"))
    else {
        if (loginDetails != undefined) { loginGroups[discordUserId] = encrypt(loginDetails) };
        return new Promise((resolve, reject) => resolve('Successfully logged in as ' + discordUserId));
    }
}
const LogoutOfMoodle = async (discordUserId) => {
    delete loginGroups[discordUserId]
}

const GetCourseUrls = async (page) => {
    if(page.url() != dashboardUrl){
        await page.goto(dashboardUrl)
    }

    try {
        await page.waitForSelector('div[class*="block_myoverview"] div > a[class*="coursename"')
    } catch(err){
        console.log("Moodle website has been updated and doesn't work anymore with the bot")
    }
    
    return await page.evaluate(() => {
        let termInfo = {}
        let aElements = document.querySelectorAll('div[class*="block_myoverview"] div > a[class*="coursename"')//#course-info-container-898-11 > div > div.w-100.text-truncate > a
        for (const aElem of aElements) {
            // This is the **child** part that contains the name of the term
            console.log(aElem)
            termInfo[aElem.querySelector('span.multiline').textContent.trim()] = { "URL": aElem.href, "ID": aElem.querySelector('[data-course-id]').getAttribute("data-course-id")}; // getting an element with the id, then getting that id
        }
        return termInfo

    })
}

function AskForCourse(interaction, page, multipleTerms=false){
    // you aren't supposed to put async in new promise but oh well, WHOS GONNA STOP ME!!!
    return new Promise(async (resolve, reject) => {
        const termInfo = await GetCourseUrls(page)
        const termsEmbed = new MessageEmbed()
        .setColor(primaryColour)
        .setTitle('Term / Courses Select')
        .setURL(dashboardUrl)
        .setDescription("Click on one of the buttons bellow to choose the term, you might need to be logged in if the bot owner isn't in the same course");
        
        if (multipleTerms) termsEmbed.setDescription("Click on Terms to disable them, if they are disabled they are grey, click on them again to make them blue, which means they are included!\n\nYou have 15 seconds to set up, or press enter to send it early!")
        const row = new MessageActionRow();
        // term info is <termname> = [ <url> , <id>]
        for (const term of Object.keys(termInfo)) {
            // let termButton = new MessageButton().setCustomId(term).setLabel(term).setStyle('PRIMARY')
            // row.addComponents(termButton)
            row.addComponents(
                new MessageButton()
                    .setCustomId(term)
                    .setLabel(term)
                    .setStyle('PRIMARY'),
            );	
        }
        // If allowing multiple, have a enter button
        if (multipleTerms){
            row.addComponents(
                new MessageButton()
                .setCustomId('Enter')
                .setLabel('Enter')
                .setStyle('SUCCESS')
            )           
        }

        await interaction.editReply({/*ephemeral: true,*/ embeds: [termsEmbed], components: [row]})
    
        // handle buttonMessage only, doesn't work for enter terminfo thing // todo maybe make it so only the author of the button can click em
        const filter = i => /*Object.keys(termInfo).includes(i.customId)*/i.user.id == 2343242342;
        //set the channel to send the command
        let channel = await interaction.channel
        //If the channel isn't inside the guild, you need to create a custom cd channel
        if(!interaction.inGuild()){
            channel = await interaction.user.createDM(); 
        }
        // create collector to handle when button is clicked using the channel
        const collector = await channel.createMessageComponentCollector({ /*filter, */time: 15000 });
        let updatedButtons = row.components;
        // console.log(updatedButtons)
    
        // So if one of the buttons was clicked, then update text
        collector.on('collect', async i => {
            if (multipleTerms) {
                // if enter button, stop early
                if(i.customId == 'Enter'){
                    // console.log("Stopped on enter")
                    await collector.stop()
                    return;
                }                
                else if (i.component.style == 'PRIMARY'){
                    // Change the style of the button component,
                    // that triggered this interaction
                    await i.component.setStyle('SECONDARY')
                }
                else if(i.component.style == 'SECONDARY') {
                    // set it back to primary then
                    await i.component.setStyle('PRIMARY');
                }

                // Respond to the interaction, 
                // and send updated components to the Discord API
                await i.update({components: i.message.components})
                // Update button info because a button has been clicked
                //message components are stored as an array as action rows, but all that matters is the components (The wanted buttons are in the first(only) row)
                updatedButtons = await i.message.components[0].components;
            }     
            else {
                await i.update({ content: 'Term Chosen, Scraping Now!', components: [], embeds: [] });
                resolve(termInfo[i.customId])
                await collector.stop()
            }
            // return i;
        });
    
        collector.on('end', collected => {
            if (multipleTerms) {
                // on end, remove the buttons and embed // maybe insteadof content, use a new embed that says the chosen terms
                
                leaderboardData = updatedButtons.reduce((leaderboardData, button) => {
                    // If the Enter button is primary then do button.customId != 'Enter'
                    if(button.style == 'PRIMARY') {
                        leaderboardData[button.customId] = termInfo[button.customId]
                    }
                    return leaderboardData
                }, {})
                
                let analyserEmbed = new MessageEmbed()
                .setColor(primaryColour)
                .setTitle('Analysing Terms / Courses')
                .setURL(dashboardUrl)
                .setDescription("Going To each Term / Course and Scraping data. The more here, the longer it will take :/ ");
                
                for (const termName of Object.keys(leaderboardData)) {
                    analyserEmbed.addField(termName, `URL: ${leaderboardData[termName].URL}`)
                }
                interaction.editReply({components: [], embeds: [analyserEmbed]})

                resolve(leaderboardData)
            }
            else if(collected.size == 0) {
                reject("No button was pressed")
            }
            //clean way to delete it, but maybe it's better to just edit the message? 
            // interaction.deleteReply()

            // callback(i.customId);
            // return 
        });
    })

}

const NameToID = async (interaction, page, nameToConvert, chosenTerm) => {
        // if it isn't a number then the person needs to be found
        if(isNaN(nameToConvert)){
            //if chosen term is undefined 
            if(!chosenTerm) {
                chosenTerm = await AskForCourse(interaction, page).catch(async (reason) => {
                //If no button was pressed, then just quit
                console.log(reason)
                // await interaction.deleteReply();
                // interaction.editReply({content: reason, embeds: []})
                // await browser.close()
                return null;
                })
                if(chosenTerm == null) return;
            }

            interaction.editReply({ content: `Going to the url ${chosenTerm.URL} to find ${nameToConvert}`, embeds: []})
            // use zero because it returns an array for no reason
            await page.goto(await GetTermURLS("participants", chosenTerm.ID)[0])
            let userUrl = await GetUserUrlByName(page, nameToConvert)
            if(userUrl == null) {
                // If no username found, I should say that and then quit
                await interaction.editReply({content: "No Person Found", embeds: []})
                // browser.close()
                return;
            }
            await page.goto(userUrl) // I am asuming that it actually returns something
            // assuming it returns the data id otherwise it should hopefully be null
            return await page.evaluate(() => document.querySelector('#adaptable-message-user-button').getAttribute('data-userid'))

        }
        else { // if it was an id, just return that, pretty easy
            return nameToConvert;
        }
}
const GetUserUrlByName = async (page, inputName) => {
    return await page.evaluate((cleanedName) => {
        let tableRows = document.querySelectorAll('tr[id*="user-index-participant"]');
        for (trElem of tableRows){
            let personNodes = trElem.querySelectorAll("a")
            for (person of personNodes){
                // includes means they will get the first person and may not be the intended one
                if (person.textContent.toLowerCase().includes(cleanedName)) return person.href
            }
        }
        return null;
    }, await NicknameToRealName(inputName))
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

function encrypt(loginDetails){
    // generate 16 bytes of random data
    const initVector = crypto.randomBytes(16);;

    // secret key generate 32 bytes of random data
    const Securitykey = crypto.randomBytes(32);

    // the cipher function
    const cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);

    // encrypt the message
    // input encoding
    // output encoding
    let encryptedPassword = cipher.update(loginDetails.password, "utf-8", "hex");

    encryptedPassword += cipher.final("hex");

    // console.log("Encrypted message: " + encryptedData);
    return [ loginDetails.username, encryptedPassword, Securitykey, initVector]


}

function decrypt(username, encryptedPassword, Securitykey, initVector){
    // the decipher function
    const decipher = crypto.createDecipheriv(algorithm, Securitykey, initVector);

    let decryptedData = decipher.update(encryptedPassword, "hex", "utf-8");

    decryptedData += decipher.final("utf8");
    
    return { "username": username, "password": decryptedData }
}

module.exports = {
    getFiles,
    GetTermURLS,
    LoginToMoodle,
    LogoutOfMoodle,
    GetCourseUrls,
    AskForCourse,
    NameToID,
    NicknameToRealName,
    ConvertTime,
    loginGroups,
    classAmount,
    courseIDs,
    primaryColour,
    mainStaticUrl,
    errorColour
}