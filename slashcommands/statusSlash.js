const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions");
const { ConvertName } = require('./configSlash')
const { primaryColour } = require("../util/constants");

//INFO:
/*
    Person is stored as Array
    person[0] = name of person
    person[1] = role of person (e.g student or teacher)
    person[2] = groups (e.g "no groups")
    person[3] = Last Online (e.g 2 days 22 hours)
    person[4] = profile pic of person
    if leaderboard:
    person[5] = Last Online in Seconds
*/

//Can't get addchoices to work :/ , the example on the docs gives an error
const durations = [
    { name: "60 seconds", value: 60},
    { name: "5 minutes", value: 5 * 60},
    { name: "10 minutes", value: 10 * 60},
    { name: "30 minutes", value: 30 * 60},
    { name: "1 hour", value: 60 * 60},
    { name: "1 day", value: 24 * 60 * 60},
    { name: "1 week", value: 7 * 24 * 60 * 60 }
]

//TODO implement code for the role options
//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('status')
	.setDescription('Get someones status from the Moodle course')
    .addSubcommand(subcommand =>
		subcommand /*person cause they can be the teacher too*/
			.setName('person')
			.setDescription('Use a filter to get assignments instead')
            .addStringOption(option =>
                option
                    .setName('person-name')
                    .setDescription("If there are 2 people with the name, also use last name")
                    .setRequired(true)
            )
            .addBooleanOption(option =>
                option
                    .setName('show-input-name')
                    .setDescription("Show the name that you input for this command in response (instead of full name)")
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('filter')
            .setDescription('Use a filter to get status instead of person name directly')
            //suport REGEX? probably not good for the raspberry pi (expensive AF!!) if people abuse it.... limits? regex the regex? nah.
            .addStringOption(option => option.setName('includes-string').setDescription('Name of person using substring e.g "matt" returns matthew and marietta').setRequired(false))

            //Have to do this crappy rewording because of discord restrictions on having the same options
            //And for some reason it still doesn't work
            .addNumberOption(option =>
                option
                    .setName('last-online')
                    .setDescription('filter by time since last online')
                    .setRequired(false)
                    // .addChoice("60 seconds", 60)
                    // .addChoice("5 minutes", 5 * 60)
                    // .addChoice("10 minutes", 10 * 60)
                    // .addChoice("30 minutes", 30 * 60)
                    // .addChoice("1 hour", 60 * 60)
                    // .addChoice("3 hours", 3 * 60 * 60)
                    // .addChoice("6 hours", 6 * 60 * 60)
                    // .addChoice("1 day", 24 * 60 * 60)
                    // .addChoice("1 week", 7 * 24 * 60)
                    .addChoices(...durations)
            )
            .addBooleanOption(option=>
                option
                    .setName("flip")
                    .setDescription("flips last online to be **over** the time")
                    .setRequired(false)
            )
    )
            
	.addSubcommand(subcommand =>
		subcommand
			.setName('leaderboard')
			.setDescription('Get a students missing assignments')
            .addBooleanOption(option =>
                option.setName('seconds')
                    .setDescription('Show Last online with seconds arg')
                    .setRequired(false)
            )

        );
 

module.exports = {
    category: "info",
    usage: "status 'person <personName>' OR 'leaderboard <secs:true/false>' OR 'filter <includes-string> and/or <last-online> and/or <flip:true/false>(flips last online)", 
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        const embedMessagesArr = [];
        await interaction.deferReply();
        // `${mainStaticUrl}/user/index.php?page=0&perpage=5000&contextid=${contextId}&id=${termId}&newcourse`

        // const browser = await puppeteer.launch({ headless: false })
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        //console.log(UtilFunctions.GetTermURLS("participants")[courseIDIndex])

        //log into the browser using url from functions, (only one in participants so 0 to get it)
        // await UtilFunctions.LoginToMoodle(page, interaction.user.id, UtilFunctions.GetTermURLS("participants")[0]).catch(error => console.log(error))

        try {
            await UtilFunctions.LoginToMoodle(page, config?.settings.general.LimitLogins ? undefined : interaction.user.id)
        } catch (error) {
            return await interaction.editReply("The Wifi is Too Slow and timed out on Navigation")
        }
        let chosenTerm = await UtilFunctions.AskForCourse(interaction, page).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })
        // if the user didn't select any in time just delete the reply, the browser should be closed anyways
        if(chosenTerm == null) return await interaction.deleteReply();
        // console.log(chosenTerm)
        // otherwise free to continue
        await page.goto(`${UtilFunctions.mainStaticUrl}/user/index.php?id=${chosenTerm.ID}&perpage=5000`)

        // if (interaction.options.getSubcommand() === 'person'){
        //     //do person / regular use stuff
        // } else if(interaction.options)
        switch (interaction.options.getSubcommand()) {
            case "person":
                let realInputName = await interaction.options.getString("person-name")
                //Getting name (which is required) and converting it from nickname, also converts to lower case
                let inputName = await ConvertName(realInputName);
                //console.log(await GetTableOfPeople(page));

                const tableOfPeople = await GetTableOfPeople(page);

               // for( personObj of Object.entries(tableOfPeople)){
                for (personIndex in tableOfPeople){
                   // let [ personName, personData ] = personObj;

                    let LCUserName = tableOfPeople[personIndex][0].toLowerCase()

                    if (LCUserName == inputName || LCUserName.split(" ")[0] == inputName) {
                        //CreateEmbedMessage(personObj, interaction);
                        //console.log(personObj)
                        if(await interaction.options.getBoolean("show-input-name")){
                            await CreateEmbedMessage(embedMessagesArr, tableOfPeople[personIndex], false, realInputName)
                        }
                        else{
                            await CreateEmbedMessage(embedMessagesArr, tableOfPeople[personIndex])
                        }
                        // console.log("SUCESS")
                        break;
                    }
                    else if(personIndex == tableOfPeople.length - 1){
                        //last person wasn't found
                        interaction.editReply(`"${realInputName}" is a ghost :ghost:`)
                    }
                }

                break;
            case "filter":
                let includesString = await interaction.options.getString("includes-string");
                let duration = await interaction.options.getNumber("last-online");
                let flipDuration = await interaction.options.getBoolean("flip");

                await ParticipantsFilter(page, interaction, embedMessagesArr, includesString, duration, flipDuration)
                break;
            case "leaderboard":
                let showSeconds = await interaction.options.getBoolean("seconds")
                await GetOnlineLeaderboard(page, embedMessagesArr, showSeconds);
                break;
            default:
                interaction.editReply(`Something went wrong with ${interaction.options.getSubcommand()}`)
                break;
        }
        SendEmbedsToDiscord(interaction, embedMessagesArr);
        return await browser.close();
    }
}


async function ParticipantsFilter(page, interaction, embedMessagesArr, includeString, duration, flipDuration=false){
    let foundPerson = false;
    let tableOfPeople = await GetTableOfPeople(page);

    // make sure the include string is lowercase
    includeString = includeString.toLowerCase();
    if(includeString != null){
        tableOfPeople = tableOfPeople.filter(personArr => personArr[0].toLowerCase().includes(includeString))
    }
    if(duration) {
        tableOfPeople = await tableOfPeople.filter(async (personArr) => {
            const personTimeSeconds = await UtilFunctions.ConvertTime(personArr[3])
            return (duration > personTimeSeconds || (flipDuration && duration < personTimeSeconds))
        })
    }

    for(const personArr of tableOfPeople){
        CreateEmbedMessage(embedMessagesArr, personArr)
    }

    if(tableOfPeople.length == 0){
        let replyString = 'Couldn\'t find anyone with:'
        if(includeString) replyString += ` include-string: "${includeString}"`
        if(duration) replyString +=  `duration: "${duration}"`
        interaction.editReply(replyString)
    }
}

async function GetTableOfPeople(page){
    await page.waitForSelector('tr[id*="user-index-participant"]')
    return await page.evaluate(() => {
        let arrOfEveryone = [];

        let tableRows = document.querySelectorAll('tr[id*="user-index-participant"]:not(.emptyrow)');
        for (trElem of tableRows){
            
            // Gets table data elems from rows, then assigns the name to the other data of row, and add profile pic lastly
            tdElems = trElem.querySelectorAll("td");//TODO SOMETHING WRONG WITH a.textcontent need to fix later
            // peopleObj[trElem.querySelector("a").textContent] =  [...Array.prototype.map.call(tdElems, function(t) { return t.textContent; }), trElem.querySelector("a > img").src]//.push(trElem.querySelector("a > img").src);
            arrOfEveryone.push([trElem.querySelector("a").textContent, ...Array.prototype.map.call(tdElems, function(t) { return t.textContent; }), trElem.querySelector("a > img").src])//.push(trElem.querySelector("a > img").src);
        }

        return arrOfEveryone;
    })
}

async function GetOnlineLeaderboard(page, embedMessagesArr, showSeconds=false){
    let leaderboardArr = []

    let tableOfPeople = await GetTableOfPeople(page);
    for (personIndex in tableOfPeople){
        personTime = tableOfPeople[personIndex][3]
        //this will be index 5, seconds time.
        convertedTime = await UtilFunctions.ConvertTime(personTime);
        tableOfPeople[personIndex].push(convertedTime)
        if(showSeconds){
            //This is their name
            tableOfPeople[personIndex][0] += ` (${convertedTime} seconds)` 
        }

    }
    // The sort() method accepts a comparator function. This function accepts two arguments (both presumably of the same type)
    // and it's job is to determine which of the two comes first.

    tableOfPeople.sort((a, b) => a[5] - b[5])
    CreateEmbedMessage(embedMessagesArr, tableOfPeople, true);

}

function CreateEmbedMessage(embedMessagesArr, personData, leaderboard=false, title="none", colour=primaryColour) {

    let embedCounter = Math.ceil((personData.length) / 25)
    let personIndex = 0;
    for (embedCounter; embedCounter > 0; embedCounter--) {
        let statusEmbed = new EmbedBuilder();
        //check if data is obj or array
        //console.log(participantData.constructor.name);
        if(!leaderboard){
            if(title != "none"){
                statusEmbed.setTitle(title)
            }
            else{
                statusEmbed.setTitle(personData[0]);
            }
            statusEmbed.addFields(
                { name: "Roles", value: personData[1] },
                { name: "Groups", value: personData[2] },
                { name: "Last Online", value: personData[3] }
            ); 
            statusEmbed.setThumbnail(personData[4])   
        }//if it isn't just one person
        else{
    
            if(title != "none"){
                statusEmbed.setTitle(title)
            }
            else{
                statusEmbed.setTitle("Last Online leaderboard");
            }
            // for(person of personData){
            do {
                if(personIndex >= personData.length) break;
                let person = personData[personIndex]
                //person 4 is thumbnail, 5 is the new seconds online section
                let infoString = `Roles: ${person[1]} Groups: ${person[2]} Last-Online: ${person[3]}`
                statusEmbed.addFields({ name: person[0], value: infoString })
                personIndex++;  
            } while ((personIndex + 1) % 25 != 0)
        }
        statusEmbed.setColor(primaryColour);
        embedMessagesArr.push(statusEmbed); 
    }
}

function SendEmbedsToDiscord(interaction, embedMessagesArr){
    // console.log(embedMessagesArr)
    // console.log("sent")
    if(embedMessagesArr.length >= 1 && embedMessagesArr.length <= 10){
        interaction.editReply({ embeds: embedMessagesArr });
    }
    else if(embedMessagesArr.length > 10){
        interaction.editReply("I did too good of a job! Discord can't handle more than 10 embed messages at a time! :nerd:")
    }
}

