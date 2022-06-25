const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { MessageEmbed } = require('discord.js');
const LismFunctions = require("../util/functions")

//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('assignments')
	.setDescription('Get assignments for the lismore course')
    //.setDefaultPermission()
	.addSubcommand(subcommand =>
		subcommand
			.setName('filter')
			.setDescription('Use a filter to get assignments instead')
            .addStringOption(option => option.setName('filterstring').setDescription('Substring of name, E.g "VB" to get all vb projects').setRequired(true))
            // .addStringOption(option => option.setName('iaernst').setDescription('Substring of name, Ennearsts'))

            //Have to do this crappy rewording because of discord restrictions on having the same options
            //And for some reason it still doesn't work
            .addIntegerOption(option =>
                option.setName('term-to-filter')
                    .setDescription('Optionally choose only 1 term filter')
                    .setRequired(false)
                    .addChoice("Term 1", 0)
                    .addChoice("Term 2", 1)
                    .addChoice("Term 3", 2)
            ))


			//.addUserOption(option => option.setName('target').setDescription('The user')))
	.addSubcommand(subcommand =>
		subcommand
			.setName('student')
			.setDescription('Get a students missing assignments')
            .addStringOption(option =>
                option.setName('studentname')
                    .setDescription('The name of student (doesn\'t need to be full name) e.g lachy')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('term')
                    .setDescription('Optionally choose only 1 term')
                    .setRequired(false)
                    //doesn't work because it expects array?
                    // .addChoices(
                    //     { name: 'Term 1', value: 0 },
                    //     { name: 'Term 2', value: 1 },
                    //     { name: 'Term 3', value: 2 },
                    // )
                    .addChoice("Term 1", 0)
                    .addChoice("Term 2", 1)
                    .addChoice("Term 3", 2)
            )
        );

module.exports = {
    ...data.toJSON(),
    run: async (client, interaction) => {

        await interaction.deferReply();

        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        var assignmentObject = {};
        var filter = false;
        
        //log into the browser
        await LismFunctions.LismLogin(page)

        if (interaction.options.getSubcommand() === 'student') {
            let studentName = await LismFunctions.NicknameToRealName(await interaction.options.getString("studentname"));
            let termInt = await interaction.options.getInteger("term");

            if(termInt != null){
                let currentTerm = LismFunctions.GetTermURLS()[termInt];
                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, [currentTerm]), studentName), interaction, studentName);
            }
            else{
                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page), studentName), interaction, studentName);
            }
        }
        else if (interaction.options.getSubcommand() === 'filter'){
            let filterString = await interaction.options.getString("filterstring")
            let termInt = await interaction.options.getInteger("term-to-filter");

            if(termInt != null){
                let currentTerm = LismFunctions.GetTermURLS()[termInt];
                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, [currentTerm], false), filterString, true), interaction, "malaga",
                `Assignments found with filter ${filterString}:`)
            }
            else{
                SendEmbedMessage(await GetWantedAssignments(await GetAllAssignments(page, LismFunctions.GetTermURLS(), false), filterString, true), interaction, "malaga",
                `Assignments found with filter ${filterString}:`)
            }
            

            // SendEmbedMessage(allAssignments.filter(assignment => assignment.toLowerCase().includes(args[i]?.toLowerCase())), 
            //     message, "null", "Filtered Assignments");
        }
        else {
            //can editReply or follow up
            interaction.editReply(`Didn't code the use of ${interaction.options.getSubcommand()} yet, sorry`)
        }
        //Once its done, close the browser to stop the browsers stacking up
        browser.close();
    }
}

async function GetAllAssignments(page, term_urlsArr=LismFunctions.GetTermURLS(), pushPeople=true, links=false){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    assignmentObject = {}
    for (term_url of term_urlsArr){
        //debug
        console.log(term_url)

        
        await page.goto(term_url)
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
        
        assignmentObject[`Term ${LismFunctions.GetTermURLS().indexOf(term_url) + 1}`] = await page.evaluate((pushPeople, assignmentObject) => {   
            let tempAssObj = {};
            for (elem of document.querySelectorAll('h3')){
                if(elem.querySelector('img[title="Assignment"]')){
                    //gets the title of the header if it is not a quiz and adds the url
                    titleString = `[${elem.querySelector("a").textContent}](${elem.querySelector("a").getAttribute("href")})`;
    
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
            
            // if(pushPeople){
            //     return AssignmentObject;
            // }
            // else{
            //     return AssignmentArray;
            // }
            return tempAssObj
        }, pushPeople);
    }
    return assignmentObject;
}

async function GetWantedAssignments(assignments, personName, filtering=false){
    missingAssignments = {};
    console.log(personName)
    for(term of Object.entries(assignments)){
        let [termName, assignmentsObj] = term;
        //sets { Term3: term3}
        //missingAssignments[termName] = term;
        missingAssignments[termName] = [];

        for(assignmentData of Object.entries(assignmentsObj)){
            let [assignment, people] = assignmentData;
            //If they can't be found then it pushes, meaning if you put ZZZZZ it will get all the assignments for the term
            if((!people.some(correctPerson => correctPerson.toLowerCase().includes(personName)) && !filtering) || 
            (filtering && assignment.toLowerCase().includes(personName.toLowerCase()))){
                missingAssignments[termName].push(assignment);
            }
        }
    }
    //console.log(missingAssignments)
    return missingAssignments;
}


function SendEmbedMessage(missingAssignments, interaction, personName, title="none", colour="#156385") {
    let embedMsg = new MessageEmbed();

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
        interaction.editReply({ embeds: [embedMsg] });

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

            chunks.forEach((biggerChunk, index) => embedMsg.addField(`${fieldName} part ${index+1}`, biggerChunk))
        }
        else{
            //Add the assignments that were done to the message
            embedMsg.addField(fieldName, msgString)
        }

    }
}