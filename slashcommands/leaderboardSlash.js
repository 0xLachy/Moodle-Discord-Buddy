const puppeteer = require('puppeteer');
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const UtilFunctions = require("../util/functions");
const { primaryColour } = require("../util/colors");
const { ConvertName } = require('./configSlash')

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
//* you can add custom perms with perms: <their perms>
//* if the role was already created in the server, the colors here won't matter
const leaderBoardRoles = [
    { name: 'SDD KING', color: "#F83E0C"/*, perms: [PermissionsBitField.Flags.PrioritySpeaker] */},  
    { name: 'SDD ELDER', color: "#D9540B"}, 
    { name: 'SDD KNIGHT', color: "#F07900"}, 
    { name: 'SDD SOLDIER', color: "#D98C0B"},
    { name: 'SDD SLACKER', color: "#4A412A"},
    { name: 'SDD SNOOZER', color: "#464441"}
]

// taken from the end, in this case only sdd slacker will be the last place role
const lastPlaceRolesCount = 2;

//TODO when doing add roles, check that interaction.InGuild()
module.exports = {
    category: "info",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {

        await interaction.deferReply();

        // const browser = await puppeteer.launch({headless: false});
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        //log into the browser
        try {
            if(config?.settings.general.LimitLogins){
                await UtilFunctions.LoginToMoodle(page)
            }
            else {
                await UtilFunctions.LoginToMoodle(page, interaction.user.id)
            }
        } catch (error) {
            console.log(error)
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
        const finalLeaderboard = await FasterLeaderboard(page, chosenTerms, riggedTerm, mergeResults);
        SendEmbedMessage(finalLeaderboard, interaction, mergeResults, leaderboardTitle)
        
        const addRoles = await interaction.options.getBoolean('add-roles')
        //if we aren't adding roles (because adding roles calls remove roles)
        if(await interaction.options.getBoolean('remove-roles') && !addRoles && interaction.inGuild()) {
            await RemoveRoles(interaction)
            await interaction.followUp('Removed roles from people (it takes some time for discord api to remove them)')
        }

        if(addRoles && !riggedTerm && interaction.inGuild()) { 
            if(!mergeResults) {
                await interaction.followUp('The Leaderboard needs to be merged to add roles!')
            }
            else {
                await GiveRolesFromLeaderboard(interaction, finalLeaderboard) 
            }
        }
        // }
        //Once its done, close the browser to stop the browsers stacking up
        await browser.close();
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

function SendEmbedMessage(leaderboardResults, interaction, mergeResults=true, title, colour=primaryColour) {
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
        return true;
    }
    return false;
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
    // so the leaderboard is an arry of objects with { 'locianus': 42, '}
    const scoreGroups = {} 
    for (const person in leaderboard) {
        const score = leaderboard[person]
        // add them to the score group, this syntax doesn't work :/
        // scoreGroups[score] = (scoreGroups[score] || []).push(person)
        if(!scoreGroups[score]) {
            scoreGroups[score] = []
        }

        scoreGroups[score].push(person)
        // scoreGroups[score] = Array.isArray(scoreGroups[score]) ? scoreGroups.push('')
    }

    const scoreGroupKeysInOrder = Object.keys(scoreGroups).sort((a, b) => b - a)

    const personGroups = []
    for (const scoreGroupKey of scoreGroupKeysInOrder) {
        personGroups.push(scoreGroups[scoreGroupKey])
    }
    
    // removing roles from the people, (not deleting them though)
    await RemoveRoles(interaction)

    //create the role if the role doesn't exist yet in the discord server
    const createdRoleNames = []
    for (const lbRole of leaderBoardRoles) {
        if(await CreateRole(interaction, lbRole)) {
            createdRoleNames.push(`name: \`${lbRole.name}\` color: \`${lbRole.color}\``)
        }
    }
    
    if(createdRoleNames.length > 0) {
        interaction.followUp(`The Following Roles Were Created: \n${createdRoleNames.join('\n')}`)
    }

    const RolesGivenInfo = {}
    const beginningOfLastPlace = personGroups.length - lastPlaceRolesCount;
    const positiveRoleAmount = (leaderBoardRoles.length - 1 ) - lastPlaceRolesCount; // - 1 because of zero indexing

    //If you are reading this, you're a king!
    let king = false;

    //todo rewrite this, so there can be multiple kings, like what is done for last place 
    for (let pgIndex = 0; pgIndex < personGroups.length; pgIndex++) {
        const personGroup = personGroups[pgIndex];
        const roleIndex = king ? pgIndex : pgIndex + 1
        if(pgIndex == 0 && personGroup.length == 1) {
            //they get the first role, which can only be give to a single person
            await GiveRoleAndAddToInfo(personGroup, 0)
            king = true;
        } 
        else if(roleIndex <= positiveRoleAmount){
            await GiveRoleAndAddToInfo(personGroup, roleIndex)
        }
        // if they are last place minus last place roles count, or more, give them one of the last place roles
        else if(roleIndex >= beginningOfLastPlace) {
            // Using the Reverse Index to give them their roll
            await GiveRoleAndAddToInfo(personGroup, (leaderBoardRoles.length - 1) - ((personGroups.length - 1) - roleIndex))
            //leaderBoardRoles.length - 1 is the very last index, take away the current index thing
        }
    }
    // create the embed to send
    const roleSummaryEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Roles Given:')
        .setDescription('Takes the names from the leaderboard and tries to find the equivalent discord accounts to give the roles to.')
        .addFields(Object.entries(RolesGivenInfo).map(([name, roleData]) => {
            return {
                name,
                // basically returns Given => `Astaroth, Dagan, Mammon, Azazel` Unfound => `Maloch`
                value: Object.entries(roleData).map(([success, people]) => `${success} => \`${people.join(', ')}\``).join(', ')
            }
        }))
    return await interaction.followUp({embeds: [roleSummaryEmbed]})

    async function GiveRoleAndAddToInfo(personGroup, roleIndex) {
        const currentRoleInfo = (RolesGivenInfo[leaderBoardRoles[roleIndex].name] = {})
        for (const personName of personGroup) {
            // convert their name to their nickname
            //straight to discord id instead of having to find the person in the guild
            // const nicknames = await UtilFunctions.NicknameToRealName(personName, true);
            //it is good that it doesn't return an id if not found, that way we know it didn't work
            discordId = await ConvertName(personName, false, true)
            const discordName = await GiveRole(interaction, discordId, roleIndex);
            if(discordName) {
                if(!currentRoleInfo['Given']) currentRoleInfo['Given'] = [];
                currentRoleInfo['Given'].push(discordName)
            }
            else {
                if(!currentRoleInfo['Unfound']) currentRoleInfo['Unfound'] = [];
                // if they have a different nickname, add that to the string
                currentRoleInfo['Unfound'].push(personName)
            }
        }
    }
}

const GiveRole = async (interaction, discordId, roleIndex) => {
    if(isNaN(discordId)) return null;
    const discordAcc = await interaction.guild.members.fetch(discordId)
    if(discordAcc) {
        const roleToGive = await interaction.guild.roles.cache.find(role => role.name == leaderBoardRoles[roleIndex].name)
        //not awaiting because it takes some time to give the actual role and it can be done in the background
        discordAcc.roles.add(roleToGive)
        return discordAcc?.nickname ?? discordAcc.user.username
    }
    //if it didn't return true already
    return null;
}
