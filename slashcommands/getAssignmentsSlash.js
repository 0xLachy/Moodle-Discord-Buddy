const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions")
const { primaryColour } = require("../util/variables");
const { ConvertName } = require('./configSlash')

//TODO fix error with too many assignments showing up if bad name is passed (it breaks the program)
const data = new SlashCommandBuilder()
	.setName('assignments')
	.setDescription('Get assignments for the Moodle course')
    //.setDefaultPermission()
	.addSubcommand(subcommand =>
		subcommand
			.setName('filter')
			.setDescription('Use a filter to get assignments instead')
            .addStringOption(option => option.setName('filterstring').setDescription('Substring of name, E.g "VB" to get all vb projects').setRequired(true))
            // .addStringOption(option => option.setName('iaernst').setDescription('Substring of name, Ennearsts'))
        )
	.addSubcommand(subcommand =>
		subcommand
			.setName('missing')
			.setDescription('Get a students missing assignments')
            .addStringOption(option =>
                option.setName('studentname')
                    .setDescription('The name of student (doesn\'t need to be full name) e.g rita')
                    .setRequired(true)
            )
        )
	.addSubcommand(subcommand =>
		subcommand
			.setName('submissions')
			.setDescription('see who has submitted the assignment!')
            .addStringOption(option =>
                option.setName('assignment-names')
                    .setDescription('The names of the assignments split at ",," , it uses substring so you don\'t have to be too specific')
                    .setRequired(true)
            )
        );
module.exports = {
    category: "info",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        await interaction.deferReply()
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        //log into the browser
        await UtilFunctions.LoginToMoodle(page, config?.settings.general.LimitLogins ? undefined : interaction.user.id)

        const chosenTerms = await UtilFunctions.AskForCourse(interaction, page, true).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            interaction.deleteReply();
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })//).map(term => term.ID)

        if(chosenTerms == null) return;
        switch (await interaction.options.getSubcommand()) {
            case 'missing':
                let studentName = ConvertName(await interaction.options.getString("studentname"))
                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, chosenTerms), studentName), interaction, studentName);
                break;
            case 'filter':
                let filterString = await interaction.options.getString("filterstring")
                
                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, chosenTerms, false), filterString, true), interaction, "malaga",
                `Assignments found with filter ${filterString}:`)
                break;
            case 'submissions':
                //an array of names of assignments, splitting at double comma because it might have single comma in name
                let subNames = await interaction.options.getString("assignment-names").split(',,').map(name => name.trim().toLowerCase())

                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, chosenTerms, true, false), 'malaga', false, subNames), interaction, "malaga",
                `People Who did Assignments:`)
                
                break;
            default:
                //can editReply or follow up
                interaction.editReply(`Didn't code the use of ${interaction.options.getSubcommand()} yet, sorry`)
                break;
        }
        //Once its done, close the browser to stop the browsers stacking up
        await browser.close();
    }
}

async function GetAllAssignments(page, chosenTerms, pushPeople=true, links=true){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    assignmentObject = {}
    for (termName in chosenTerms){

        await page.goto(`${UtilFunctions.mainStaticUrl}/course/recent.php?id=${chosenTerms[termName].ID}`)
        // console.log(await page.content())
    
        try {
            await page.click('#id_date_enabled');
        } catch(err){
            console.log("term doesn't exist yet")
            //return what we got so far
            return assignmentObject;
        }
        // submit form amd wait for navigation to a new page
        await Promise.all([
            page.click('#id_submitbutton'),
            page.waitForNavigation(),
        ]);
    
        //Debuging Purposes
        page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
        
        assignmentObject[`Term ${termName}`] = await page.evaluate((pushPeople, links) => {   
            let tempAssObj = {};
            for (elem of document.querySelectorAll('h3')){
                if(elem.querySelector('img[title="Assignment"]')){
                    //* this one is broken on the moodle webpage, skip it for now
                    if(elem.querySelector('a').textContent == 'T1W6 Assignment System Modelling Tools') continue;
                    
                    //gets the title of the header if it is not a quiz and adds the url
                    titleString = links ? `[${elem.querySelector("a").textContent}](${elem.querySelector("a").getAttribute("href")})` : elem.querySelector("a").textContent;
    
                    var peopleNames = [];
                    var nextElem = elem;
    
                    while(nextElem = nextElem.nextSibling){
                       // console.log(Selem.nodeName)
                        if (!pushPeople) break;
                        if (nextElem.nodeName == "H3") break; // if H3 that is end of next siblings
                        if (nextElem.nodeType === 3) continue; // ignore text nodes
                        //if (nextElem === elem) continue; // ignore elem of target
                        // console.log(nextElem)
                        peopleNames.push(nextElem.querySelector('div > a').textContent);
                        elem = nextElem;
                    }
                    //Key is titlestring, value is array of people's names, if pushpeople is false than it just pushes titlestring
                    //pushPeople ? AssignmentObject[titleString] = peopleNames : AssignmentArray.push(titleString)
                    //TODO Need to test this with push people false, cause people names is empty
                    tempAssObj[titleString] = peopleNames
                    //AssignmentObject[titleString] = sibs;                               
                }
            }
            return tempAssObj
        }, pushPeople, links);
    }
    return assignmentObject;
}

async function GetWantedAssignments(assignments, personName, filtering=false, assignmentNames=[]){
    missingAssignments = {};
    for(term of Object.entries(assignments)){
        let [termName, assignmentsObj] = term;
        //sets { Term3: term3}
        //missingAssignments[termName] = term;
        if(assignmentNames.length == 0) missingAssignments[termName] = [];

        for(assignmentData of Object.entries(assignmentsObj)){
            let [assignment, people] = assignmentData;
            if(assignmentNames.length > 0) {
                if(assignmentNames.some(name => assignment.toLowerCase().includes(name))){
                    missingAssignments[assignment] = people
                }
            }
            else {
                //If they can't be found then it pushes, meaning if you put ZZZZZ it will get all the assignments for the term
                if((!people.some(correctPerson => correctPerson.toLowerCase().includes(personName)) && !filtering) || 
                (filtering && assignment.toLowerCase().includes(personName.toLowerCase()))){
                    missingAssignments[termName].push(assignment);
                }
            }
        }
    }
    //console.log(missingAssignments)
    return missingAssignments;
}


function SendEmbedMessage(missingAssignments, interaction, personName, title="none", colour=primaryColour) {
    let embedMsg = new EmbedBuilder();

    if(title != "none"){
        embedMsg.setTitle(title)
    }
    else{
        embedMsg.setTitle(`Missing Assignments for ${personName}`);
    }

    for(term of Object.entries(missingAssignments)){
        //console.log(assignmentData)
        let [termName, assignments] = term;
        //won't work because the second one will be the only one that matters
        AddToMsgString(assignments, termName)
    }

    embedMsg.setColor(colour);

    try{
        interaction.editReply({ embeds: [embedMsg], components: [] });

    }
    catch(DiscordAPIError){
        interaction.editReply("Too many assignments missing, the string is too long to send in a discord message")
        
    }
    // if(!messageTooLong){
    // }
    // else{
        //Send the assignments, but not as an embed, maybe check the stringss before adding the embed feilds
    // }

    function AddToMsgString(assignmentArray, fieldName) {
        let msgString = "";
        
        for (assignment of assignmentArray) {
            //for some reason undefined shows up in this for of thing. don't know why
            if (assignment != undefined) {
                msgString += `${assignment}\n`;
            }
        }

        if (msgString == ""){
            if(personName == "null"){
                msgString = "No Assignments Found"
            }
            else{
                msgString = "No Assignments Missing, Congrats :partying_face:"   
            }
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

            chunks.forEach((biggerChunk, index) => embedMsg.addFields({ name:`${fieldName} part ${index+1}`, value: biggerChunk}))
        }
        else{
            //Add the assignments that were done to the message
            embedMsg.addFields({ name: fieldName, value: msgString})
        }

    }
}