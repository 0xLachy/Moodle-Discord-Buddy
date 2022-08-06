const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions");
const { merge } = require('superagent');

//TODO implement code for the role options and also todo, when those roles are added make sure not in dm
//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('Get leaderboard for the lismore course')
    //.setDMPermission(false)
    //.setDefaultPermission()
    // .addIntegerOption(option =>
    //     option.setName('term')
    //         .setDescription('Optionally choose only 1 term')
    //         .addChoices(
    //             { name: 'Term 1', value: 0 },
    //             { name: 'Term 2', value: 1 },
    //             { name: 'Term 3', value: 2 },
    //         )
    // )
    .addBooleanOption(option =>
        option
            .setName("merge")
            .setDescription("Merge the results of all the terms chosen together into one")
            .setRequired(false)
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
    category: "info",
    permissions: [],
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {

        await interaction.deferReply();

        // const browser = await puppeteer.launch({headless: false});
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        //log into the browser
        try {
            await UtilFunctions.LoginToMoodle(page, interaction.user.id)
        } catch (error) {
            return await interaction.editReply("The Wifi is Too Slow and timed out on Navigation, here is the error") // TODO put in error name and title
        }

        let chosenTerms = await UtilFunctions.AskForCourse(interaction, page, true).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            interaction.deleteReply();
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })
        let mergeResults = await interaction.options.getBoolean('merge') // doesn't seem to work
        if(mergeResults == null) { mergeResults = true }  // default value!

        // if(mergeResults == undefined) mergeResults = true; // default value is now true
        let riggedTerm = await interaction.options.getString("rig");
        let leaderboardTitle = riggedTerm ? "Leaderboard For Selected Terms (totally not rigged :sweat_smile:)" : "Leaderboard For Selected Terms"; // could use += and add the total not rigged part but but yeah
        
        //The leaderboard is being sent in from fasterleaderboard return. then just add the other stuff
        SendEmbedMessage(await FasterLeaderboard(page, chosenTerms, riggedTerm, mergeResults), interaction, mergeResults, leaderboardTitle)
        // }
        //Once its done, close the browser to stop the browsers stacking up
        browser.close();
    }
}

async function FasterLeaderboard(page, chosenTerms, rigPerson=null, mergeResults=true){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    leaderboardResults = {};

    for (termName of Object.keys(chosenTerms)){
        let termData = chosenTerms[termName]
        let term_url = `${UtilFunctions.mainStaticUrl}/course/recent.php?id=${termData.ID}`

        await page.goto(term_url)
    
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
        
        //Make sure it loads before grabbing people, Do the same thing here because if term exists but no assignments are done
        try {
            await page.waitForSelector("table.assignment-recent > tbody > tr > td:nth-child(2) > div > a")
        } catch(err){
            console.log("term doesn't exist yet")
            break;
        }

        //If Merging the results, don't include the term name
        if (mergeResults){
            leaderboardResults = await page.evaluate((leaderboardResults) => {             
                for (elem of document.querySelectorAll('table.assignment-recent > tbody > tr > td:nth-child(2) > div > a')){
                    //sets the leaderboardresultsObj at username 1 or increase it (if undefined it is 0 + 1)
                    leaderboardResults[elem.textContent] = (leaderboardResults[elem.textContent] || 0) + 1;
                }
                return leaderboardResults;
            }, leaderboardResults);
        }
        else {
            leaderboardResults[termName] = await page.evaluate(() => { 
            let leaderboardResultsObj = {}            
            for (elem of document.querySelectorAll('table.assignment-recent > tbody > tr > td:nth-child(2) > div > a')){
                leaderboardResultsObj[elem.textContent] = (leaderboardResultsObj[elem.textContent] || 0) + 1;
            }
            return leaderboardResultsObj;
        });
        }
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
    return leaderboardResults;
}

function SendEmbedMessage(leaderboardResults, interaction, mergeResults=true, title, colour=UtilFunctions.primaryColour) {
    // Create the Message Embed to send to the channel
    let embedMsg = new EmbedBuilder();
    title ? embedMsg.setTitle(title) : embedMsg.setTitle(`Leaderboard Results:`);
    // if(title != "default"){
    //     embedMsg.setTitle(title)
    // }
    // else{
    //     embedMsg.setTitle(`Leaderboard Results:`);
    // }
    // if merging results, send the results straight into the embed
    if (mergeResults) {
        AddToLeaderboardResultToEmbed(leaderboardResults, "All Terms / Courses")
    }
    else { // otherwise loop through the terms, and set field name to be the term name
        for (const termResultName of Object.keys(leaderboardResults)) {
            // console.log(termResultName);
            AddToLeaderboardResultToEmbed(leaderboardResults[termResultName], termResultName);
        }
    }

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

    function AddToLeaderboardResultToEmbed(leaderboardResults, fieldName) {
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

            chunks.forEach((biggerChunk, index) => embedMsg.addFields({ name: `${fieldName} part ${index + 1}`, value: biggerChunk }))
        }
        else{
            //Add the assignments that were done to the message
            embedMsg.addFields( { name: fieldName, value: msgString } )
        }

    }
}