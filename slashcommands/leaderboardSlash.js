const puppeteer = require('puppeteer');
const { EmbedBuilder, SlashCommandBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions");
// const { GetSelectMenuOverflowActionRows, SendConfirmationMessage } = require("../util/functions");
const { primaryColour } = require("../util/constants");
const { ConvertName, GetConfigs } = require('./configSlash')

//TODO implement code for the role options and also todo, when those roles are added make sure not in dm
//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('Get leaderboard for the lismore course')
    // .addBooleanOption(option =>
    //     option
    //         .setName("add-roles")
    //         .setDescription("Add Roles to students in discord based off ranking")
    //         .setRequired(false)
    // )
    // .addBooleanOption(option =>
    //     option
    //         .setName("remove-roles")
    //         .setDescription("Removes all the ranking roles given to everyone")
    //         .setRequired(false)
    // )
    .addBooleanOption(option =>
        option
            .setName('config-priority')
            .setDescription('Place people with configs (people who have used the bot) above everyone else')
            .setRequired(false)
    )

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

module.exports = {
    category: "info",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        await interaction.deferReply()
        // const browser = await puppeteer.launch({headless: false});
        const browser = await UtilFunctions.BrowserWithCache();
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
            return await interaction.editReply(`The Wifi is Too Slow and timed out on Navigation or maybe your login details are wrong, the error is: \n\`${error.toString()}\``);
        }

        let chosenTerms = await UtilFunctions.AskForCourse(interaction, page, true).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            interaction.deleteReply();
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })

        //The leaderboard is being sent in from fasterleaderboard return. then just add the other stuff
        const finalLeaderboard = await FasterLeaderboard(page, chosenTerms);
        SendEmbedMessage(finalLeaderboard, interaction, config, 'Leaderboard For Selected Terms')
        
        //ROLES SECTION BASICALLY
        // const addRoles = await interaction.options.getBoolean('add-roles')
        //if we aren't adding roles (because adding roles calls remove roles)
        // if(await interaction.options.getBoolean('remove-roles') && !addRoles && interaction.inGuild()) {
        //     await RemoveRoles(interaction)
        //     await interaction.followUp('Removed roles from people (it takes some time for discord api to remove them)')
        // }

        // if(addRoles && interaction.inGuild()) { 
        //     await GiveRolesFromLeaderboard(interaction, finalLeaderboard) 
        // }
        // }
        //Once its done, close the browser to stop the browsers stacking up
        await browser.close();
    }
}

async function FasterLeaderboard(page, chosenTerms){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    let leaderboardResults = {};

    //* the .URL of chosen terms is just the general course url, not the assignment listing url unfortunately
    for (termName of Object.keys(chosenTerms)){
        const termData = chosenTerms[termName]
        const termUrl = `${UtilFunctions.mainStaticUrl}/course/recent.php?id=${termData.ID}`

        await page.goto(termUrl)
    
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
        
        leaderboardResults = await page.evaluate((leaderboardResults) => {             
            for (elem of document.querySelectorAll('table.assignment-recent > tbody > tr > td:nth-child(2) > div > a')){
                //sets the leaderboardresultsObj at username 1 or increase it (if undefined it is 0 + 1)
                leaderboardResults[elem.textContent] = (leaderboardResults[elem.textContent] || 0) + 1;
            }
            return leaderboardResults;
        }, leaderboardResults);

    }
    return leaderboardResults;
}

async function SendEmbedMessage(leaderboardResults, interaction, config, title='Leaderboard Results', colour=primaryColour) {
    // Create the Message Embed to send to the channel
    const leaderboardEmbed = new EmbedBuilder()
        .setTitle(title)
        .setColor(colour)
    // used to display that people with configs
    const configPriority = interaction.options.getBoolean('config-priority') ?? false
    const allConfigs = GetConfigs();
    
    //using the configs because that way they can display their icons
    let sortedLeaderboardResults = Object.entries(leaderboardResults).map(([name, tally]) => {
        return {
            name,
            tally,
            config: allConfigs.find(fig => fig.name == name.toLowerCase()) // alot null but thats fine
        }
    })

    //now properly sorting it
    SortLeaderboardResults();

    AddToLeaderboardResultToEmbed(sortedLeaderboardResults, "All Terms / Courses")

    try{
        await interaction.editReply({ embeds: [leaderboardEmbed] });
    }
    catch(DiscordAPIError){
        interaction.editReply("The result is too long to send in a discord (embed) message")    
    }

    // if the user isn't vip or not merging (bec)
    if(!config.vip || !config.settings.vip.DisplayLeaderboardEdit || sortedLeaderboardResults.length == 0) return;

    // if the person doesn't have a name, or that name can't be found in the leaderboard then just use the first place person
    let personBeingEdited = (config.name != null ? sortedLeaderboardResults.find(slr => slr.name.toLowerCase() == config.name)?.name : null) ?? sortedLeaderboardResults[0].name
    const cheatEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Vip leaderboard modifications')
        .setDescription(`As a vip member you are allowed to edit the leaderboard!\nYou have 60 seconds before it auto quits :sweat_smile:\nType in a number to edit the selected persons score\n**Person being edited: ${personBeingEdited}**`)
    
    
    let pageNumber = 0;
    
    let optionsToEdit = GetRigOptions();
    // const cheatActionRows = UtilFunctions.GetSelectMenuOverflowActionRows(pageNumber, optionsToEdit, 'Choose someone to change their score!')
    // const reply = await interaction.editReply({content: ' ', embeds:[donationEmbed], components: GetSelectMenuOverflowActionRows(page, peopleOptions, 'Choose a person to donate to!'), fetchReply: true})
    //* Can't be ephemeral because you lose the ability to edit the message!!!!
    const reply = await interaction.followUp({ embeds: [cheatEmbed], components: UtilFunctions.GetSelectMenuOverflowActionRows(pageNumber, optionsToEdit, 'Choose someone to change their score!', true), ephemeral: false, fetchReply: true})
    const filter = i => i.user.id === interaction.user.id;
    const msgFilter = m => m.author.id === interaction.user.id
    
    const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();
    
    const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000 });
    const msgCollector = await channel.createMessageCollector({ filter: msgFilter, time: 180 * 1000 });

    msgCollector.on('collect', async m => {
        const commentToAdd = m.content;
        if(commentToAdd.toLowerCase() == 'quit') return await collector.stop();
        if(interaction.inGuild() && config.settings.config.DeleteSettingMessages) { m.delete() };
        if(isNaN(commentToAdd)) return UtilFunctions.TemporaryResponse(interaction, 'Not a Number, so no edit was made', 1000);
        if(commentToAdd > 99999999 || commentToAdd < -99999999) return UtilFunctions.TemporaryResponse(interaction, 'Number was wayyy to big/small, chill out a little!', 1000)

        sortedLeaderboardResults.find(slr => slr.name == personBeingEdited).tally = commentToAdd;
        //I don't have to sort the whole array so this is a bit slow, but it's fine for now
        SortLeaderboardResults();
        //I hope this resets the fields
        leaderboardEmbed.setFields()
        AddToLeaderboardResultToEmbed(sortedLeaderboardResults, 'All Terms / Courses')
        // also update the the optionsToEdit

        optionsToEdit = GetRigOptions();
        await Promise.all([
            reply.edit({ components: UtilFunctions.GetSelectMenuOverflowActionRows(pageNumber, optionsToEdit, 'Choose someone to change their score!', true)}),
            interaction.editReply({ embeds: [leaderboardEmbed]})
        ])
    })

    // get them to choose a recipient
    collector.on('collect', async (i) => {
        await i.deferUpdate();
        if(i.customId == 'Quit') {
            await collector.stop();
        }
        if(i.customId == 'select') {
            personBeingEdited = i.values[0]
        }
        else if(i.customId == 'next_page') {
            pageNumber++;
            await reply.edit({ components: UtilFunctions.GetSelectMenuOverflowActionRows(pageNumber, optionsToEdit, 'Choose someone to change their score!', true)})
        }
        else if(i.customId == 'previous_page') {
            pageNumber--;
            await reply.edit({ components: UtilFunctions.GetSelectMenuOverflowActionRows(pageNumber, optionsToEdit, 'Choose someone to change their score!', true)})
        }
    })

    // tell them that they have timed out
    collector.on('end', collected => {
        msgCollector.stop();
        return interaction.webhook.deleteMessage(reply)
    });

    function GetRigOptions() {
    //! if two people have the same name this is gonna cause some mad errors
        return sortedLeaderboardResults.map(res => {
            return { label: `${res.name}: ${res.tally}`, value: res.name, description: 'edit person'}
        })
    }

    function SortLeaderboardResults() {
        sortedLeaderboardResults = sortedLeaderboardResults.sort((a, b) => {
            // sorting in reverse order kinda if they have a config
            if (configPriority && a.config && !b.config) {
                return -1;
            }
            else if (configPriority && b.config && !a.config) {
                return 1;
            }
            else {
                return b.tally - a.tally;
            }
        });
    }

    function AddToLeaderboardResultToEmbed(sortedLeaderboardResults, fieldName) {
        let msgString = "";

        for(person of sortedLeaderboardResults){
            msgString += `${person?.config?.icon ?? ''} ${person.name} : ${person.tally}\n`
        }

        if (msgString == ""){
            msgString = "Uhhhhh Nobody is here?? :face_with_raised_eyebrow:"  
        }

        if(msgString.length > 1024){

            const assignmentStrings = msgString.match(/.{1,1023}(\s|$)/g);
            // gotta be less that 1025 or whatever... the only problem with this is that if it doesn't complete the \n then it cuts off stuff hmm
            // ? in the future figure out a way to do with with regex so it can go back to last \n if it goes over (?=...) lookahead might be handy
            // const assignmentStrings = msgString.match(/.{1,1023}(\s|$)/gms);
            // console.log(msgString.match(/.{1,1024}(\s|$)/gms))

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

           chunks.forEach((biggerChunk, index) => leaderboardEmbed.addFields({ name: `${fieldName} part ${index + 1}`, value: biggerChunk }))
        }
        else{
            //Add the assignments that were done to the message
            leaderboardEmbed.addFields( { name: fieldName, value: msgString } )
        }

    }
}

async function WaitForNewUserValue(interaction, sortedLeaderboardResults, userName) {
    const msgFilter = m => m.author.id === interaction.user.id

    const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();

    const collector = await reply.createMessageComponentCollector({ filter, time });
    const msgCollector = await channel.createMessageCollector({ filter: msgFilter, time: 180 * 1000 });

    let stillConfirming = false;
    msgCollector.on('collect', async m => {
        const commentToAdd = m.content;
        if(interaction.inGuild() && config.settings.config.DeleteSettingMessages) { m.delete() };
        if(stillConfirming) return;
        let confirmationMessageString = 'Are you sure you want to send the coment: ';
        if(commentToAdd.length >= 1024 - confirmationMessageString.length) return TemporaryResponse(interaction, `Your comment is too long, chop it up into parts less than ${1024 - confirmationMessageString.length} characters`);

        // if they got past these hurdles, set still confirming to true!
        stillConfirming = true;
        //* I think the max description you can send is 1024 characters
        if(await SendConfirmationMessage(interaction, `Are you sure you want to send the comment: ${commentToAdd}`)) {
            //if they do want to send the message
            await page.evaluate((commentToAdd) => {
                // as long as it's clicked once, the text area loads, I can close and but the text area stays so this is fine for multi comments lol
                document.querySelector('div[role="main"] a.comment-link span').click();
                document.querySelector('div.comment-area textarea').value = commentToAdd;
                document.querySelector('div.comment-area a[id*="comment-action-post"]').click();
            }, commentToAdd)
            //update the comments on the embed to show that stuff
            // this is a string set to none sometimes, there might be an easier way of doing this :/
            // split at \n, that might break some comments though if I implement a deleting feature :(
            //! if they have 2 comments of 900 or whatever which is allowed, it will break this display thing :/
            const commentData = info.submissionData.find(sd => sd.name == 'Submission comments')
            commentData.value = commentData.value == 'none' ? commentToAdd : commentData.value + '\n' + commentToAdd;
            const commentField = mainEmbed.data.fields.find(field => field.name == 'Submission comments');
            if(commentField) commentField.value = commentData.value;

            await interaction.editReply({ embeds: [mainEmbed]})
        }
        stillConfirming = false;
    })
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
