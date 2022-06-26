const puppeteer = require('puppeteer');
const {MessageEmbed} = require('discord.js');
const { LismLogin, NicknameToRealName, classAmount, courseIDs } = require("../../util/functions")

module.exports = {
    name: "status",
    aliases: ["st", "stat"],
    //TODO make this look nicer / make more sense
    usage: "status ['fuzz', 'filter <filterType>:<filterValue>', 'leaderboard/lb [seconds/sec]',] (<person>)", 
    description: "Return status of user (or class), filter example => LastOnline:1-day or Role:Teacher",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        // {classAmount} = client; //TODO put that into client
        //TODO maybe change the leaderboard to be in leaderboard.js instead of status or even LastOnline script itself
        //TODO instead of having these fuzz things, instead make them call the fuzz function or filter function etc
        //TODO make context id settable.
        //TODO change the url thing so that it fetches from util, the 896 is important
        var URL = `https://moodle.oeclism.catholic.edu.au/user/index.php?contextid=124194&id=896&perpage=${classAmount}`;
        var inputNames = [];
        var fuzz = false;
        var filterArg = "";

        //move pointer to function location
        //#form_autocomplete_input-1653380416775
        //TODO add nickname through slash command

        // Starts browser visible 
        // const browser = await puppeteer.launch({ headless: false});
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Gets past login screen.
        await LismLogin(page, URL)
        
        // Did all that before getting to args, so that I can call functions using page
        for(let i = 0;i < args.length; i++){
            let arg = args[i].toLowerCase();
            arg = arg.replace("-", "");  

            if(arg == "fuzz"){
                fuzz = true;
            } 
            else if(arg == "filter"){
                //Increase the arg counter, then get filter, that way it doesn't become a name
                i++;
                // eg. To filter by role you go "Role:-Student"
                //case sensitive :/
                filterArg = args[i].replace("-", "");
                //Call the filter and send in the filter args as an array e.g Role: Teacher
                await Filter(page, filterArg.split(":", 2), message)
            }
            else if(arg == "lb" || arg == "learderboard"){
                //TODO call function instead, remember to put await
                if(args[i+1]?.toLowerCase().replace("-", "").includes("sec")){
                    i++;
                    await GetOnlineLeaderboard(page, message, includeSecs=true);
                }
                else{
                    await GetOnlineLeaderboard(page, message);
                }
            }
            else{
                inputNames.push(arg)
            }
        }

        //convert names from nicknames
        // for (let i = 0; i < inputNames.length; i++){
        //     for (let nickname in nicknames) {
        //         if(nickname == inputNames[i]){
        //             inputNames[i] = nicknames[nickname];
        //             break;
        //         }
        //     }
        // }
        for(nameIndex in inputNames){
            inputNames[nameIndex] = await NicknameToRealName(inputNames[nameIndex])
        }

        for (inputName of inputNames){
            // Loops through each student to get correct one then breaks
            Classloop: for (let i = 0; i < classAmount; i++) {
                personObj = await GetPersonObj(page, i);
                let LCUserName = personObj["Username"].toLowerCase();
                if (LCUserName == inputName || LCUserName.split(" ")[0] == inputName || (fuzz && LCUserName.includes(inputName))) {
                    SendEmbedMessage(personObj, message);
                    break Classloop;
                }
                else if (i == classAmount - 1 && !fuzz) {
                    message.channel.send(`Couldn't find person: ${inputName}, did you spell their name correctly`);
                }
            }
            //await MainLoop(page, inputName, fuzz, filterArg, filter, message);
          //  console.log(participantInfo)
        }
        browser.close();
        
    }
} 
//when calling this function use await
async function GetPersonObj(page, i){
    return {
        "Username": await GetUsername(page, i, 897),
        "Role": await GetRole(page, i, 897),
        "Group": await GetGroup(page, i, 897),
        "LastOnline": await GetLastOnStatus(page, i, 897),
        "Thumbnail": await GetProfilePic(page, i, 897)
    };  
}

async function Filter(page, filterArr, message){
    let foundPerson = false;
    let filterStatusType = filterArr[0];
    let filterStatusValue = filterArr[1];
    let filterSecondValue = await ConvertTime(filterStatusValue.toLowerCase());

    // console.log(filterStatusType + " : " + filterStatusValue + filterArr)
    for (let i = 0; i < classAmount; i++) {
        
        personObj = await GetPersonObj(page, i);
        // console.log(personObj);

        // console.log(personObj[filterStatusType])
        if (personObj[filterStatusType] == filterStatusValue) {
            SendEmbedMessage(personObj, message);
            foundPerson = true;
        }

        //implement who has been offline the longest
        else if (filterStatusType == "LastOnline") {
            // console.log("got into online")
            let personObjSeconds = await ConvertTime(personObj[filterStatusType]);
            if(filterSecondValue > personObjSeconds){
                SendEmbedMessage(personObj, message);
                foundPerson = true;
            }
        }
    }
    if(!foundPerson){
        message.channel.send("Couldn't find anybody with " + [filterArr])
    }
}

//option for custom title if wanted
function SendEmbedMessage(participantData, message, title="none", colour="#156385") {
    let statusEmbed = new MessageEmbed();
    //check if data is obj or array
    //console.log(participantData.constructor.name);

    if(participantData.constructor.name == "Object"){
        if(title != "none"){
            statusEmbed.setTitle(title)
        }
        else{
            statusEmbed.setTitle(participantData["Username"]);
        }
        statusEmbed.addFields(
            { name: "Roles", value: participantData["Role"] },
            { name: "Groups", value: participantData["Group"] },
            { name: "Last Online", value: participantData["LastOnline"] }
        ); 
        statusEmbed.setThumbnail(participantData["Thumbnail"])   
    }
    else if(participantData.constructor.name == "Array"){
        if(title != "none"){
            statusEmbed.setTitle(title)
        }
        else{
            statusEmbed.setTitle("Last Online leaderboard");
        }
        participantData.forEach(participant => {
            let participantInfoString = "";
            for (const [key, value] of Object.entries(participant)) {
                //console.log(`${key}: ${value}`);
                //last online can be either included field or in name of field not sure what looks better
                if(key != "Username" && key != "SecondsOnline" && key != "Thumbnail"){
                    participantInfoString += `**${key}** : ${value} `
                }
            }
            statusEmbed.addFields(           
                { name: participant["Username"], value: participantInfoString }
            );
        });
    }
    else{
        console.log(participantData.constructor.name + " isn't an Object, or Array")
    }

    statusEmbed.setColor(colour);
    message.channel.send({ embeds: [statusEmbed] });
}

async function GetUsername(page, i, courseID) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-${courseID}_r${i}_c0 > a`);
}

async function GetRole(page, i, courseID) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-${courseID}_r${i}_c1`);
}

async function GetGroup(page, i, courseID) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-${courseID}_r${i}_c2`);
}

async function GetLastOnStatus(page, i, courseID) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-${courseID}_r${i}_c3`);
}

async function GetProfilePic(page, i, courseID) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).src;
    }, `#user-index-participants-${courseID}_r${i}_c0 > a > img`);
}


async function GetOnlineLeaderboard(page, message, includeSecs=false){
    let participantInfo = []
//TODO set big data of participants, order by date (can be function) then return back as big string like leaderboard
    for (let i = 0; i < classAmount; i++) {
        personObj = await GetPersonObj(page, i);
        personObj.SecondsOnline = await ConvertTime(personObj["LastOnline"]);
        if (includeSecs){
            personObj["Username"] += ` (${await ConvertTime(personObj["LastOnline"])} seconds)`
        }
        //console.log(personObj);
        participantInfo.push(personObj)
    }
    // The sort() method accepts a comparator function. This function accepts two arguments (both presumably of the same type)
    // and it's job is to determine which of the two comes first.
    participantInfo.sort((a, b) => a.SecondsOnline - b.SecondsOnline)
    SendEmbedMessage(participantInfo, message);

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