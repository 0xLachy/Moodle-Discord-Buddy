const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const UtilFunctions = require("../util/functions");

//TODO implement code for the role options and also todo, when those roles are added make sure not in dm
//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('Get leaderboard for the lismore course')
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



//The Roles for the leaderboard, an array so it can use index for status, like king is first and so on
// the roles will be added in order up until index of the last place roles, 
// you can add custom perms with perms: <their perms>
const leaderBoardRoles = [
    { name: 'SDD KING', color: "#F83E0C"/*, perms: [PermissionsBitField.Flags.PrioritySpeaker] */},  
    { name: 'SDD ELDER', color: "#D9540B"}, 
    { name: 'SDD KNIGHT', color: "#F07900"}, 
    { name: 'SDD SOLDIER', color: "#D98C0B"},
    { name: 'SDD SLACKER', color: "#4A412A"},
]

// taken from the end, in this case only sdd slacker will be the last place role
const lastPlaceRolesCount = 1;

//TODO when doing add roles, check that interaction.InGuild()
module.exports = {
    category: "info",
    permissions: [],
    idLinked: false,
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
    let leaderboardResults = {};

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


// ROLE STUFF =================>


// returns true if created a new role otherwise returns false
//every won't work, need a .some that works even after passing the test
const CreateRole = async (interaction, newRole) => {
    const { name, color, permissions } = newRole;
    // const role = client.guilds.cache.find(r => r.name == "Test Role to give");

    // await interaction.member.roles.add(role);
    // if the role doesn't exist then add it!
    if (!interaction.guild.roles.cache.find(role => role.name == newRole.name)) {
        interaction.guild.roles.create({
            name,
            color,
            permissions: permissions || [],
            reason: 'Created to show rankings from the /leaderboard command'
        }).catch(console.error); 
    }

}



async function RemoveRoles(interaction) {
    interaction.guild.roles.cache.each(role => {
        //if the leaderboard roles contains the role, then get all the members and remove it
        if(leaderBoardRoles.some(lbRole => lbRole.name == role.name)) {
            interaction.guild.members.fetch().then(members => members.each(member => member.roles.remove(role)));
        }
    });
}


const GiveRolesFromLeaderboard = async (interaction, leaderboard) => {
    // so the leaderboard is an arry of objects with { 'locianus': 42 }
    const scoreGroups = {} 
    for (const personObj of leaderboard) {
        //get the persons score and their name 
        const [ person, score ] = Object.entries(personObj)
        // add them to the score group
        scoreGroups[score] = (scoreGroups[score] || []).push(person)
    }

    const scoreGroupKeysInOrder = Object.keys(scoreGroups).sort((a, b) => b - a)

    const personGroups = []
    for (const scoreGroupKey of scoreGroupKeysInOrder) {
        personGroups.push(scoreGroups[scoreGroupKey])
    }

    //TODO check that personGroups is actually in the write order and all that previous code worked
    await RemoveRoles(interaction)
    // create an embed message with all the roles created or something like that
    if(leaderBoardRoles.filter(lbRole => await CreateRole(interaction, lbRole)).length > 0) { console.log('role(s) were created') }
    
    for (const pgIndex in personGroups) {
       const personGroup = personGroups[pgIndex];

        if(pgIndex == 0 && personGroup.length == 1) {
            //they get the first role, which can only be give to a single person
            //giveRole(personname, roleIndex)
            // if the name isn't found they don't get the role, also add the result of this to an embed
        } 
        // if they are last place minus last place roles count, or more, give them one of the last place roles
        else if(pgIndex >= (personGroups.length - 1) - lastPlaceRolesCount) {
            // go reverse to give them their role
        }
    }
}

const GiveRole = async (interaction, personName, roleIndex) => {

    personName = UtilFunctions.NicknameToRealName(personName);
    const discordAcc = await interaction.guild.members.fetch().then(members => members.find(member => {
        return member.nickname == personName || member.nickname == personName.split(" ")[0]
    }))

    if(discordAcc) {
        const roleToGive = await interaction.guild.roles.cache.find(role => role.name == leaderBoardRoles[roleIndex])
        await discordAcc.roles.add(roleToGive)
    }
}
