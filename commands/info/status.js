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
        var inputName = args.join(" ").toLowerCase();
        classAmount = 26;
        //TODO add nickname through slash command
        const nicknames = {
            "lachy": "lachlan",
            "lachianus": "lachlan",
            "harry": "harrison",
            "poohead": "harrison",
            "teacher": "michael",
            "jebidiah": "jeb"
        }

        for (let nickname in nicknames) {
            if(nickname == inputName){
                inputName = nicknames[nickname];
                break;
            }
        }

        for(let i = 1;i < args.length; i++){
            let arg = args[i].toLowerCase();
            arg = arg.replace("-", "");           
        }

        // Starts browser.
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Gets past login screen.
        await LismLogin(page, URL)

        // Loops through each student to get correct one.
        for(let i = 0; i < classAmount; i++){

            let username = await page.evaluate((sel) => {
                return document.querySelector(sel).textContent;
                }, `#user-index-participants-896_r${i}_c0 > a`);
            let LCUserName = username.toLowerCase();
            if (LCUserName == inputName || LCUserName.split(" ")[0] == inputName){

                let statusRole = await GetRole(page, i);
                let statusGroup = await GetGroup(page, i);
                let statusOnline = await GetLastOnStatus(page, i);
                
                let statusEmbed = new MessageEmbed();
                statusEmbed.setTitle(username)
                statusEmbed.addFields(
                    {name: "Roles", value: statusRole},
                    {name: "Groups", value: statusGroup},
                    {name: "Last Online", value: statusOnline}
                )
                statusEmbed.setColor("#156385")
                
                message.channel.send({embeds: [statusEmbed]})
                break;
            }
            else if(i == classAmount - 1){
                message.channel.send("Couldn't find person, did you spell their name correctly")
            }

        }
        browser.close();
        
    }
} 

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
