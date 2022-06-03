const puppeteer = require('puppeteer');
const {MessageEmbed} = require('discord.js');
const {LismLogin} = require("../../util/functions")

module.exports = {
    name: "status",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        //TODO instead of having these fuzz things, instead make them call the fuzz function or filter function etc
        //TODO make context id settable.
        var URL = "https://moodle.oeclism.catholic.edu.au/user/index.php?contextid=123980&id=896&perpage=26";
        var inputNames = [];
        var fuzz = false;
        var filter = false;
        var filterArg = "";
        var leaderboardstyle = false;
        //maybe store everything apart from last online locally? And call -Update to update db
        var participantInfo = []
        //move pointer to function location
        //#form_autocomplete_input-1653380416775
        classAmount = 26;
        //TODO add nickname through slash command
        const nicknames = {
            "lachy": "lachlan",
            "lachianus": "lachlan",
            "harrisonus": "lachlan",
            "harry": "harrison",
            "poohead": "harrison",
            "teacher": "michael",
            "sddmaster": "harrison",
            "jebidiah": "jeb"
        }

        for(let i = 0;i < args.length; i++){
            let arg = args[i].toLowerCase();
            arg = arg.replace("-", "");  
            if(arg == "fuzz"){
                fuzz = true;
            } 
            else if(arg == "filter"){
                //Increase the arg counter, then get filter, that way it doesn't become a name
                i++;
                filter = true;
                // eg. To filter by role you go "Role:-Student"
                filterArg = args[i].replace("-", "");
            }
            else if(arg == "lb" || arg == "learderboard"){
                leaderboardStyle = true;
            }
            else{
                inputNames.push(arg)
            }
        }

        //convert names from nicknames
        for (let i = 0; i < inputNames.length; i++){
            for (let nickname in nicknames) {
                if(nickname == inputNames[i]){
                    inputNames[i] = nicknames[nickname];
                    break;
                }
            }
        }
        // Starts browser visible 
        //const browser = await puppeteer.launch({ headless: false});
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Gets past login screen.
        await LismLogin(page, URL)
        
        if(filterArg != ""){
           // ApplyFilter(filterArg);
          // await page.click("#form_autocomplete_input-1653380416775");
            if(inputNames.length == 0) {
                inputNames.push("filtering");
            }
        }

        for (let inputName in inputNames){
            //need to get the actual name and not the index
            inputName = inputNames[inputName]
            // Loops through each student to get correct one.
            Classloop: for(let i = 0; i < classAmount; i++){
                let username = await page.evaluate((sel) => {
                    return document.querySelector(sel).textContent;
                    }, `#user-index-participants-896_r${i}_c0 > a`);
                let LCUserName = username.toLowerCase();
                if (LCUserName == inputName || LCUserName.split(" ")[0] == inputName 
                || (fuzz && LCUserName.includes(inputName)) || (filterArg != "" && filter)){

                    //Puts alll the info about someone into an object
                    personObj = { 
                        "username" : username,
                        "Role" : await GetRole(page, i),
                        "Group" : await GetGroup(page, i),
                        "Online" : await GetLastOnStatus(page, i)
                    }
                    // puts the person into group of people user for debugging or maybe in future caching??
                   // participantInfo.push(personObj);

                    if (filter){                    
                        //get the correct filter terms and check if they match person
                        var filterArr = filterArg.split(":", 2);
                        var filterStatusType = filterArr[0]
                        var filterStatusValue = filterArr[1]
                        // console.log(filterStatusType + " : " + filterStatusValue + filterArr)
                        if(personObj[filterStatusType] == filterStatusValue){
                            SendEmbedMessage(personObj, message);
                        }
                        //implement who has been offline the longest
                        else if(filterStatusType == "Online"){
                           // console.log("got into online")
                            switch(filterStatusValue.toLowerCase()) {
                                case "now":                                  //it says secs in participants screen but is essentially now
                                    if(personObj[filterStatusType].includes("sec")){
                                        SendEmbedMessage(personObj, message);
                                    }
                                  break;
                                case "hour":
                                    //TODO: fix if it says 3 days 4 hours it will include that
                                    if(personObj[filterStatusType].includes("hour") && personObj[filterStatusType].includes("min")){
                                        SendEmbedMessage(personObj, message);
                                    }
                                  break;
                                case "day":
                                    if(personObj[filterStatusType].includes("1 day")){
                                        SendEmbedMessage(personObj, message);
                                    }
                                    break;
                                default:
                                    console.log("nobody found with" + [fitlerStatusType])
                              } 
                        }
                    }
                    else {
                        SendEmbedMessage(personObj, message);
                    }
                    //change it to && after finished testing
                    if(!fuzz && filterArg == ""){
                        console.log("broke loop");
                        break Classloop;
                    }
                }
                // if i is the last person and their name isn't found
                else if(i == classAmount - 1 && !fuzz){
                    message.channel.send(`Couldn't find person: ${inputName}, did you spell their name correctly`)
                }
            }
          //  console.log(participantInfo)
        }
       // browser.close();
        
    }
} 
//option for custom title if wanted
function SendEmbedMessage(personObj, message, title="none") {
    let statusEmbed = new MessageEmbed();
    if(title != "none"){
        statusEmbed.setTitle(title)
    }
    else{
        statusEmbed.setTitle(personObj["username"]);
    }
    statusEmbed.addFields(
        { name: "Roles", value: personObj["Role"] },
        { name: "Groups", value: personObj["Group"] },
        { name: "Last Online", value: personObj["Online"] }
    );
    statusEmbed.setColor("#156385");

    message.channel.send({ embeds: [statusEmbed] });
}

// async function ApplyFilter(page, filterString){
//     //clicking on filter box
//     await page.click("#form_autocomplete_input-1653380416775");
//     await page.keyboard.type(filterString);
//     await Promise.all([
//     await page.keyboard.press('Enter'),
//     page.waitForNavigation()
//     ])
// }

async function GetRole(page, i) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-896_r${i}_c1`);
}

async function GetGroup(page, i) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-896_r${i}_c2`);
}

async function GetLastOnStatus(page, i) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-896_r${i}_c3`);
}
