const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { MessageEmbed } = require('discord.js');
const LismFunctions = require("../util/functions");

//TODO implement code for the role options
//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('Get leaderboard for the lismore course')
    //.setDefaultPermission()
    .addIntegerOption(option =>
        option.setName('term')
            .setDescription('Optionally choose only 1 term')
            .addChoice("Term 1", 0)
            .addChoice("Term 2", 1)
            .addChoice("Term 3", 2)
    )
    .addBooleanOption(option =>
        option
            .setName("add-roles")
            .setDescription("Add Roles to students in discord based off ranking")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName("remove-roles")
            .setDescription("Removes all the ranking roles given to everyone")
            .setRequired(false)
    )
    .addStringOption(option => option.setName('rig').setDescription('rig the score for a person e.g Harrison Baird = 12'));

module.exports = {
    ...data.toJSON(),
    run: async (client, interaction) => {

        await interaction.deferReply();

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        //log into the browser
        await LismFunctions.LismLogin(page)

        let termInt = await interaction.options.getInteger("term");
        let riggedTerm = await interaction.options.getString("rig");
        //has to be != null cause 0 fails it
        if(termInt != null){
            let currentTerm = LismFunctions.GetTermURLS()[termInt];
            if(riggedTerm){
                SendEmbedMessage(await FasterLeaderboard(page, [currentTerm], riggedTerm), interaction, `Term ${termInt + 1} (:shushing_face: its rigged)`)
            }
            else{
                SendEmbedMessage(await FasterLeaderboard(page, [currentTerm], riggedTerm), interaction, `Term ${termInt + 1}`)
            }
            //SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, [currentTerm]), studentName), interaction, studentName);
        }
        else{
            //sendEmbed again
            if(riggedTerm != null){
                SendEmbedMessage(await FasterLeaderboard(page, LismFunctions.GetTermURLS(), riggedTerm), interaction, "All Terms (totally not rigged :sweat_smile:)")
            }
            else{
                SendEmbedMessage(await FasterLeaderboard(page, LismFunctions.GetTermURLS(), riggedTerm), interaction, "All Terms")
            }
        }
        //Once its done, close the browser to stop the browsers stacking up
        browser.close();
    }
}

async function FasterLeaderboard(page, term_urlArr=LismFunctions.GetTermURLS(), rigPerson=null){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    leaderboardResults = {};
    for (term_url of term_urlArr){
        //debug
        // console.log(term_url)

        
        await page.goto(term_url)
        // console.log(await page.content())
    
        try {
            await page.click('#id_date_enabled');
        } catch(err){
            console.log("term doesn't exist yet")
            //Don't try find people as page is un accessable
            break;
        }
        // submit form amd wait for navigation to a new page
        await Promise.all([
            page.click('#id_submitbutton'),
            page.waitForNavigation(),
        ]);
        
        //Make sure it loads before grabbing people
        await page.waitForSelector("table.assignment-recent > tbody > tr > td:nth-child(2) > div > a")

        leaderboardResults = await page.evaluate((leaderboardResults) => {             
            for (elem of document.querySelectorAll('table.assignment-recent > tbody > tr > td:nth-child(2) > div > a')){

                leaderboardResults[elem.textContent] = (leaderboardResults[elem.textContent] || 0) + 1;
            }
            return leaderboardResults;
        }, leaderboardResults);
    }
    //Its pretty poor code but I might remove it anyways
    if(rigPerson != null){
        rigArr = rigPerson.split("=")
        rigArr = rigArr.map(x => x.trim())
        if(rigArr[0] == "hb") rigArr[0] = "Harrison Baird";
        if(rigArr[0] == "ls") rigArr[0] = "Lachlan Stroh";
        try{
            leaderboardResults[rigArr[0]] = parseInt(rigArr[1]);
        }
        catch(err){
            console.log(err);
            console.log("didn't set the rig message properly");
        }
        
    }
    // leaderboardResults["Harrison Baird"] -= 4;
    return leaderboardResults;
}

function SendEmbedMessage(leaderboardResults, interaction, fieldName, title="default", colour="#156385") {
    let embedMsg = new MessageEmbed();

    if(title != "default"){
        embedMsg.setTitle(title)
    }
    else{
        embedMsg.setTitle(`Leaderboard Results:`);
    }

    AddToMsgString(leaderboardResults, fieldName);


    embedMsg.setColor(colour);

    try{
        interaction.editReply({ embeds: [embedMsg] });
    }
    catch(DiscordAPIError){
        interaction.editReply("The result is too long to send in a discord (embed) message")    
    }
    // if(!messageTooLong){
    // }
    // else{
        //Send the assignments, but not as an embed, maybe check the stringss before adding the embed feilds
    // }

    function AddToMsgString(leaderboardResults, fieldName) {
        let msgString = "";
        sortedLeaderboardResults = Object.entries(leaderboardResults).sort((a,b) => b[1]-a[1])
        // for(studentAndScore of Object.entries(leaderboardResults)){
        //     let [studentName, score] = studentAndScore;
        //     msgString += `${studentName} : ${score}\n`
        // }
        for(studentAndScore of sortedLeaderboardResults){
            let [studentName, score] = studentAndScore;
            msgString += `${studentName} : ${score}\n`
        }

        if (msgString == ""){
            msgString = "Uhhhhh Nobody is here?? :face_with_raised_eyebrow:"  
        }
        if(msgString.length > 1024){

            const assignmentStrings = msgString.match(/.{1,1024}(\s|$)/g);

            let chunks = []
            let tempStr = ""
            assignmentStrings.forEach((assignChunk) => {
                if(tempStr.length < (1024 - assignChunk.length)){
                    tempStr += assignChunk;
                }
                else{
                    chunks.push(tempStr);
                    tempStr = "";
                }
            })
            if(tempStr != ""){
                chunks.push(tempStr)
            }

            chunks.forEach((biggerChunk, index) => embedMsg.addField(`fieldName part ${index+1}`, biggerChunk))
        }
        else{
            //Add the assignments that were done to the message
            embedMsg.addField(fieldName, msgString)
        }

    }
}