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
        var inputName = args.join(" ")
        classAmount = 26;
        //TODO add nickname through slash command
        const nicknames = {
            "lachy": "lachlan",
            "lachianus": "lachlan",
            "harry": "harrison",
            "idiot": "harrison",
            "teacher": "michael"
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

            if (username.toLowerCase() == inputName.toLowerCase() || username.split(" ")[0].toLowerCase() == inputName.toLowerCase()){
                let statusRole = await page.evaluate((sel) => {
                    return document.querySelector(sel).textContent;
                }, `#user-index-participants-896_r${i}_c1`);

                let statusGroup = await page.evaluate((sel) => {
                    return document.querySelector(sel).textContent;
                }, `#user-index-participants-896_r${i}_c2`);

                let statusOnline = await page.evaluate((sel) => {
                    return document.querySelector(sel).textContent;
                }, `#user-index-participants-896_r${i}_c3`);
                
                let statusEmbed = new MessageEmbed();
                statusEmbed.setTitle(username)
                statusEmbed.addFields(
                    {name: "Roles", value: statusRole},
                    {name: "Groups", value: statusGroup},
                    {name: "Last Online", value: statusOnline}
                )
                
                message.channel.send({embeds: [statusEmbed]})

                break;
            }
            else if(i == classAmount - 1){
                message.channel.send("Couldn't find person, did you spell their name correctly")
            }

        }
        
    }
} 