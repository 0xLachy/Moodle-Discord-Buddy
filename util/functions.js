const fs = require("fs");
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
//VARIABLES
const currentTerm = 2;
const classAmount = 26;
const contextId = 124194;

const primaryColour = "#156385";
const errorColour = "#FF0000";

const mainStaticUrl = "https://moodle.oeclism.catholic.edu.au/";
const dashboardUrl = `${mainStaticUrl}my/index.php`
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
            generatedUrls.push(`${mainStaticUrl}user/index.php?contextid=${contextId}&id=${termId}&perpage=5000`)
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


const LoginToMoodle = async (page, TermURL=dashboardUrl) => {
    // if (TermURL == 'Null') {
    //     console.log(Object.values(await GetCourseUrls(page))[currentTerm - 1])
    //     TermURL = Object.values(await GetCourseUrls(page))[currentTerm - 1]
    // }

    await page.goto(TermURL);
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
    await page.keyboard.type(process.env.LISMNAME);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(process.env.PASSWORD);
    await Promise.all([
    page.click(BUTTON_SELECTOR),
    page.waitForNavigation()
    ])
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
            termInfo[aElem.querySelector('span.multiline').textContent.trim()] = [ aElem.href, aElem.querySelector('[data-course-id]').getAttribute("data-course-id") ]; // getting an element with the id, then getting that id
        }
        return termInfo

    })
}

function AskForCourse(interaction, page){
    // you aren't supposed to put async in new promise but oh well, WHOS GONNA STOP ME!!!
    return new Promise(async (resolve, reject) => {
        const termInfo = await GetCourseUrls(page)
        const termsEmbed = new MessageEmbed()
        .setColor(primaryColour)
        .setTitle('Term / Course with user in it')
        .setURL(dashboardUrl)
        .setDescription("Click on one of the buttons bellow to choose the term, you might need to be logged in if the bot owner isn't in the same course");
    
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
        interaction.editReply({/*ephemeral: true,*/ embeds: [termsEmbed], components: [row]})
    
        // handle buttonMessage
        const filter = i => Object.keys(termInfo).includes(i.customId);
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });
    
        // So if one of the buttons was clicked, then update text
        collector.on('collect', async i => {
            await i.deferUpdate();
            await i.editReply({ content: 'A button was clicked!', components: [] });
            // callback(i.customId);
            resolve(termInfo[i.customId])
            collector.stop()
            // return i;
        });
    
        // when it ends, delete message maybe? from timer, or by the button clicked
        collector.on('end', collected => {
            // console.log(`Collected ${collected.size} items`)
            // callback("Finished Now")
            if(collected.size == 0) {
                reject("No button was pressed")
            }
            //clean way to delete it, but maybe it's better to just edit the message? 
            // interaction.deleteReply()

            // callback(i.customId);
            // return 
        });
    })

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
    LoginToMoodle,
    GetCourseUrls,
    AskForCourse,
    NicknameToRealName,
    ConvertTime,
    classAmount,
    courseIDs,
    primaryColour,
    mainStaticUrl,
    errorColour
}