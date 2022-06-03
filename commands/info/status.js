const puppeteer = require('puppeteer');
const {MessageEmbed} = require('discord.js');
const {LismLogin} = require("../../util/functions")

module.exports = {
    name: "status",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        //TODO make context id settable.
        var URL = "https://moodle.oeclism.catholic.edu.au/user/index.php?contextid=123980&id=896&perpage=26";
        var inputNames = [];
        var fuzz = false;
        var filter = false;
        var filterArg = "";
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
            //TODO: make one that returns the whole class in a table in order of last online
            else if(arg == "filter"){
                //Increase the arg counter, then get filter, that way it doesn't become a name
                i++;
                filter = true;
                // eg. To filter by role you go "Role:-Student"
                filterArg = args[i].replace("-", "");
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

                    //Getting the status for each type
                    let statusRole = await GetRole(page, i);
                    let statusGroup = await GetGroup(page, i);
                    let statusOnline = await GetLastOnStatus(page, i);
                    if (filter){
                        // get all people to be array of objects, once it is last person make sure there stats match
                        //This object idea might be really cool to use normally!
                        tempPersonObj = { 
                            "username" : username,
                            "Role" : statusRole,
                            "Group" : statusGroup,
                            "Online" : statusOnline
                        }
                        participantInfo.push(tempPersonObj);
                       
                        //get the correct filter terms and check if they match person
                        var filterArr = filterArg.split(":", 2);
                        var filterStatusType = filterArr[0]
                        var filterStatusValue = filterArr[1]
                        // console.log(filterStatusType + " : " + filterStatusValue + filterArr)
                        if(tempPersonObj[filterStatusType] == filterStatusValue){
                            SendEmbedMessage(username, statusRole, statusGroup, statusOnline, message);
                        }
                        //implement who has been offline the longest
                        else if(filterStatusType == "Online"){
                           // console.log("got into online")
                            switch(filterStatusValue.toLowerCase()) {
                                case "now":                                  //it says secs in participants screen but is essentially now
                                    if(tempPersonObj[filterStatusType].includes("sec")){
                                        SendEmbedMessage(username, statusRole, statusGroup, statusOnline, message);
                                    }
                                  break;
                                case "hour":
                                    //TODO: fix if it says 3 days 4 hours it will include that
                                    if(tempPersonObj[filterStatusType].includes("hour") && tempPersonObj[filterStatusType].includes("min")){
                                        SendEmbedMessage(username, statusRole, statusGroup, statusOnline, message);
                                    }
                                  break;
                                case "day":
                                    if(tempPersonObj[filterStatusType].includes("1 day")){
                                        SendEmbedMessage(username, statusRole, statusGroup, statusOnline, message);
                                    }
                                    break;
                                default:
                                    console.log("couldn't find anyone with " + filterStatusValue);
                              } 
                        }
                    }
                    else {
                        SendEmbedMessage(username, statusRole, statusGroup, statusOnline, message);
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
            console.log(participantInfo)
        }
       // browser.close();
        
    }
} 
function SendEmbedMessage(username, statusRole, statusGroup, statusOnline, message) {
    let statusEmbed = new MessageEmbed();
    statusEmbed.setTitle(username);
    statusEmbed.addFields(
        { name: "Roles", value: statusRole },
        { name: "Groups", value: statusGroup },
        { name: "Last Online", value: statusOnline }
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
