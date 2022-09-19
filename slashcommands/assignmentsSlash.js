const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlagsBitField, ComponentType, SlashCommandSubcommandBuilder, CommandInteractionOptionResolver } = require('discord.js');
const puppeteer = require('puppeteer');
const { GetSelectMenuOverflowActionRows, LoginToMoodle, AskForCourse, SendConfirmationMessage, TemporaryResponse, mainStaticUrl, loginGroups } = require("../util/functions")
const { primaryColour, assignmentBorrowCost, assignmentSharedTokens, assignmentSubmissionTokens, fakeAssignmentPenalty } = require("../util/variables");
const { ConvertName, GetConfigById } = require('./configSlash')
const mongoose = require('mongoose')
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios');

//TODO give them an extra reward for getting a grade
//TODO give huge warning when they want to submit nothing
//TODO maybe I should make it so you can choose the price of your assignment, with default in constants.js
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
			.setName('submit')
			.setDescription('submit an assignment')
            .addStringOption(option =>
                option.setName('assignment-name')
                    .setDescription('The assignment that you are submitting to, if null select menu shown')
                    .setRequired(false)
            )
            .addAttachmentOption(option =>
                option.setName('work1')
                    .setDescription('upload as a pdf or zip or whatever (or even nothing)')
                    .setRequired(false)
            )
            .addAttachmentOption(option =>
                option.setName('work2')
                    .setDescription('upload as a pdf or zip or whatever (or even nothing)')
                    .setRequired(false)
            )
            .addAttachmentOption(option =>
                option.setName('work3')
                    .setDescription('upload as a pdf or zip or whatever (or even nothing)')
                    .setRequired(false)
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

const assignmentSchema = new mongoose.Schema({
    name: { type: String, lowercase: true, trim: true }, // the name of the assignment
    owner: { type: String }, // their discord id
    grade: {type: String, default: 'Not graded'}, // n/a if they hide grades
    modifyDate: { type: String }, // used to compare that they haven't changed anything surreptitiously
    // array of discord attachments, (not storing all of the data that discord gives, just what is needed)
    attachments: [{
        name: { type: String }, // the name of the work, e.g 'functions.pdf'
        contentType: { type: String}, // what kind of file is it (used for axios)
        attachment: { type: String}, // the url to the discord attachment
    }], 
})

const assignment_db = mongoose.createConnection(process.env.MONGO_URI, {
    dbName: 'Assignments'
});

// using 'Assignment' doesn't really work like it does for other models :P
// saving them to the section 'submissions' on mongodb because might store other assignment type info
const AssignmentModel = assignment_db.model('Submissions', assignmentSchema, 'Submissions')

module.exports = {
    category: "info",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        await interaction.deferReply()
        // const browser = await puppeteer.launch();
        const browser = await puppeteer.launch({headless: false});
        const page = await browser.newPage();
        
        const assignmentNameInput = await interaction.options.getString('assignment-name')?.toLowerCase()?.replace('&action=editsubmission', '');// if they start at the editing quiz (not wanted)
        const wentStraightToAssignment = assignmentNameInput?.startsWith('https://');

        //log into the browser, if assignmentName input is a url, just go straight to it.
        await LoginToMoodle(page, config?.settings.general.LimitLogins ? undefined : interaction.user.id, wentStraightToAssignment ? assignmentNameInput : undefined) 
        
        if(wentStraightToAssignment) {
            // can't find a better way of doing this, .then wasn't working
            let foundErr = false;
            await Promise.all([page.goto(assignmentNameInput), page.waitForNavigation({ waitUntil: 'networkidle2' })]).catch(err => {
                interaction.editReply('An error has occured, did you put in an invalid url?');
                foundErr = true;
            })
            if(!foundErr) await DisplayFullInfo(interaction, await GetFullAssignmentInfo(page), config, page, true);
            return browser.close();
        }

        const chosenTerms = await AskForCourse(interaction, page, true).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            interaction.deleteReply();
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })//).map(term => term.ID)

        if(chosenTerms == null) return;
        
        let filteredAssignments;
        switch (await interaction.options.getSubcommand()) {
            case 'missing':
                let studentName = ConvertName(await interaction.options.getString("studentname"))
                filteredAssignments = await GetWantedAssignments(await GetAllAssignments(page, chosenTerms), studentName)
                SendEmbedMessage(filteredAssignments, interaction, studentName);

                await AddAndWaitForMoreSelect(interaction, page, config, Object.entries(filteredAssignments).reduce((selectOptions, [term, assignments]) => { 
                    for (const assignment of assignments) {
                        selectOptions.push({ label: assignment.name, value: assignment.link, description: term }) 
                    }
                    return selectOptions;
                }, []))
                break;
            case 'filter':
                let filterString = await interaction.options.getString("filterstring")
                filteredAssignments = await GetWantedAssignments(await GetAllAssignments(page, chosenTerms, false), filterString, true)
                SendEmbedMessage(filteredAssignments, interaction, "malaga",
                `Assignments found with filter ${filterString}:`)

                await AddAndWaitForMoreSelect(interaction, page, config, Object.entries(filteredAssignments).reduce((selectOptions, [term, assignments]) => { 
                    for (const assignment of assignments) {
                        selectOptions.push({ label: assignment.name, value: assignment.link, description: term }) 
                    }
                    return selectOptions
                }, []))
                break;
            case 'submissions':
                //an array of names of assignments, splitting at double comma because it might have single comma in name
                let subNames = await interaction.options.getString("assignment-names").split(',,').map(name => name.trim().toLowerCase())
                filteredAssignments = await GetWantedAssignments(await GetAllAssignments(page, chosenTerms, true), 'malaga', false, subNames);
                SendEmbedMessage(filteredAssignments, interaction, "malaga",
                `People Who did Assignments:`)
                await AddAndWaitForMoreSelect(interaction, page, config, Object.entries(filteredAssignments).reduce((selectOptions, [term, assignments]) => { 
                    for (const assignment of assignments) {
                        selectOptions.push({ label: assignment.name, value: assignment.link, description: term }) 
                    }
                    return selectOptions
                }, []))
                break;
            case 'submit':
                const allAssignments = await GetAllAssignments(page, chosenTerms, false);
                // filteredAssignments = await GetWantedAssignments(await GetAllAssignments(page, chosenTerms, false), 'malaga', true, [ assignmentName ])
                filteredAssignments = GetWantedAssignments(allAssignments, assignmentNameInput ?? 'any', true);

                const assignChoiceEmbed = new EmbedBuilder()
                    .setTitle('Assignment Choice')
                    .setColor(primaryColour)
                    .setDescription('Choose an assignment from the list, make sure you choose the right term/s');

                await interaction.editReply({ content: '', embeds: [assignChoiceEmbed] });

                await AddAndWaitForMoreSelect(interaction, page, config, Object.entries(filteredAssignments).reduce((selectOptions, [term, assignments]) => {
                    for (const assignment of assignments) {
                        selectOptions.push({ label: assignment.name, value: assignment.link, description: term });
                    }
                    return selectOptions;
                }, []), 'Choose the assignment you want to submit / get more info on', true);
                break;
            default:
                //can editReply or follow up
                interaction.editReply(`Didn't code the use of ${interaction.options.getSubcommand()} yet, sorry`)
                break;
        }
    }
    //TODO Once its done, close the browser to stop the browsers stacking up
    // await browser.close();
}

async function GetAllAssignments(page, chosenTerms, pushPeople=true){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    assignmentObject = {}
    for (termName in chosenTerms){

        await page.goto(`${mainStaticUrl}/course/recent.php?id=${chosenTerms[termName].ID}`)
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
        
        assignmentObject[`Term ${termName}`] = await page.evaluate((pushPeople) => {   
            let tempAssObj = {};
            for (elem of document.querySelectorAll('h3')){
                if(elem.querySelector('img[title="Assignment"]')){
                    //* this one is broken on the moodle webpage, skip it for now
                    if(elem.querySelector('a').textContent == 'T1W6 Assignment System Modelling Tools') continue;
                    
                    //gets the title of the header if it is not a quiz and adds the url
                    // titleString = links ? `[${elem.querySelector("a").textContent}](${elem.querySelector("a").getAttribute("href")})` : elem.querySelector("a").textContent;
                    titleString = elem.querySelector("a").textContent;
                    const link = elem.querySelector("a").getAttribute("href"); 
                    let peopleNames = [];
                    let nextElem = elem;
    
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
                    tempAssObj[titleString] =  { link, people: peopleNames }
                    //AssignmentObject[titleString] = sibs;                               
                }
            }
            return tempAssObj
        }, pushPeople);
    }
    return assignmentObject;
}

function GetWantedAssignments(assignments, personName, filtering=false, assignmentNames=[]){
    missingAssignments = {};
    for(term of Object.entries(assignments)){
        const [termName, assignmentsObj] = term;
        //sets { Term3: term3}
        //missingAssignments[termName] = term;
        if(assignmentNames.length == 0) missingAssignments[termName] = [];

        for(assignmentData of Object.entries(assignmentsObj)){
            const [assignment, LinkAndPeople] = assignmentData;
            const [ link, people ] = Object.values(LinkAndPeople);
            if(assignmentNames.length > 0) {
                if(assignmentNames.some(name => assignment.toLowerCase().includes(name))){
                    //* use the assignment as a term essentially
                    //* which changes the message send function
                    missingAssignments[assignment] = LinkAndPeople
                }
            }
            else {
                //If they can't be found then it pushes, meaning if you put ZZZZZ it will get all the assignments for the term
                if(personName == 'any' || (!people.some(correctPerson => correctPerson.toLowerCase().includes(personName)) && !filtering) || 
                (filtering && assignment.toLowerCase().includes(personName.toLowerCase()))){
                    // missingAssignments[termName].push(`[${assignment}](${link})`);
                    missingAssignments[termName].push({name: assignment, link});
                }
            }
        }
    }
    return missingAssignments;
}


function SendEmbedMessage(missingAssignments, interaction, personName, title=`Missing Assignments for ${personName}`, colour=primaryColour) {
    const assignmentEmbeds = [];
    const fields = [];
    for(term of Object.entries(missingAssignments)){
        //* if submissions then assignments is really linkAndPeople
        let [termName, assignments] = term;
        //won't work because the second one will be the only one that matters
        fields.push(...MakeFieldsForTerm(termName, assignments))
        // AddToMsgString(assignments.people ?? assignments, termName)
    }

    // amount of embeds needed to display the thing
    const embedCount =  Math.ceil((fields.length) / 25); 
    let fieldIndex = 0;
    
    // make sure if there is more than 25, make some more, honestly though, very unlikely :P
    for (let embedIndex = 0; embedIndex < embedCount; embedIndex++) {
        const aEmbed = new EmbedBuilder()
            .setTitle(embedIndex == 0 ? title : `${title} part ${embedIndex + 1}`)
            .setColor(colour);
            // .setDescription('Get more stuff')
        do {
            aEmbed.addFields(fields[fieldIndex])
            fieldIndex++;
        } while (fieldIndex < fields.length && fieldIndex % 25) // truthy falsy statement here  

        assignmentEmbeds.push(aEmbed);
    }

    try{
        interaction.editReply({ embeds: assignmentEmbeds, components: [] });

    }
    catch(DiscordAPIError){
        interaction.editReply("Too many assignments missing, the string is too long to send in a discord message")
        
    }

    function MakeFieldsForTerm(term, assignmentArray) {
        //Loop through each one and update the string accordingly
        let fullAssignmentString = assignmentArray.reduce((assignmentString, assignment) => {
            assignmentString += `${assignment.name ? `[${assignment.name}](${assignment.link})` : assignment}\n`; 
            return assignmentString;
        }, '') 
       //if it is empty then no assignments were found
        fullAssignmentString ||= personName ? 'No Assignments Missing, Congrats :partying_face:' : 'No Assignments Found';
        
        const assignmentLinesArray = fullAssignmentString.match(/.{1,1024}(\s|$)/g);

        const assignmentFieldChunks = []
        let accumulatorString = ''
        for (const assignmentLine of assignmentLinesArray) {
            // while there is room for another line, add that line, otherwise just leave the space
            if(accumulatorString.length < (1024 - assignmentLine.length)) {
               accumulatorString += assignmentLine; 
            }
            else {
                assignmentFieldChunks.push(accumulatorString);
                accumulatorString = '';
            }
        }
        if(accumulatorString != '') {
            assignmentFieldChunks.push(accumulatorString)
        }
        //Returning it in field format
        return assignmentFieldChunks.map((value, index) => { return { name: `${term}${index > 0 ? ` part ${index + 1}` : ''}`, value }})
    }
} 

const GetFullAssignmentInfo = async (page, getComments=true) => {
    //visable is not needed probably, but can be passed as an option, just in case (I've had problems with this one)
    if(getComments) {
        await page.waitForSelector('div[role="main"] a.comment-link span', {
            visible: true,
        })
    }
   
    // if there is more than 1 comment, click the comments and return true
    const commentsFound = getComments && await page.evaluate(() => {
        // the span can be used as a link
        const spanLink = document.querySelector('div[role="main"] a.comment-link span')
        // get only the number from the comment
        const moreThanOneComment = Number(spanLink.textContent.replace('Comments (', '').replace(')', '')) > 0
        if(moreThanOneComment) spanLink.click();
        return moreThanOneComment
    })
    
    if(commentsFound) {
        //* wait for the comments to load
        await page.waitForSelector(/*div[role="main"] */'ul div.text_to_html')
    }

    return await page.evaluate(() => {
        const mainDiv = document.querySelector('div[role="main"]');
        // mainDiv.querySelector('a.comment-link').click();
        return {
            title: mainDiv.querySelector('h2').textContent,
            description: mainDiv.querySelector('div.no-overflow').textContent,
            attachments: Array.from(mainDiv.querySelectorAll('div.fileuploadsubmission a'), (elem) => {
                //returning the name of the file, and then the url to that file so that people can download it
                return { 
                    title: elem.title || elem.textContent, // I think some have a title attribute idk
                    url: elem.href.replace('forcedownload=1', 'forcedownload=0'), //stop it autodownloading!!! can't just remove it entirely, it defaults to 1
                }
            }),
            //? make a new embed for the submission data maybe
            submissionData: Array.from(document.querySelectorAll('div.submissionstatustable tbody tr'), (tr) => {
                const name = tr.querySelector('th')?.textContent?.trim();
                return {
                    name, // can't get comments without clicking comment button
                    value: name == 'Submission comments' ? Array.from(tr.querySelectorAll('td ul div.text_to_html'), (elem) => elem.textContent).join('\n') || 'none' : tr.querySelector('td')?.textContent.trim() || 'n/a',
                }
            }).filter(obj => obj.name && obj.value) // truthy falsy stuff, make sure stuff isn't n/a
        }
    })
}

const AddAndWaitForMoreSelect = async (interaction, page, config, assignmentOptions, placeholder='Choose a quiz for more info about it', submitting=false) => {
    return new Promise(async (resolve, reject) => {
        if(assignmentOptions.length == 0) return resolve();
        selectMenuPage = 0;
        const reply = await interaction.editReply({content: ' ', components: GetSelectMenuOverflowActionRows(selectMenuPage, assignmentOptions, placeholder), fetchReply: true})
        const filter = i => i.user.id === interaction.user.id;
        //TODO extend collector when they click next idk, 20 seconds to choose from big list? having the page still open seems expensive though
        collector = await reply.createMessageComponentCollector({ filter, time: submitting ? 60 * 1000 : 20 * 1000 });

        // get them to choose a recipient
        collector.on('collect', async (i) => {
            await i.deferUpdate();
            if(i.customId == 'select') {
                await collector.stop();
                //go to the url
                await Promise.all([page.goto(i.values[0]), page.waitForNavigation({ waitUntil: 'networkidle2' })])
                return resolve(await DisplayFullInfo(interaction, await GetFullAssignmentInfo(page), config, page, submitting))
                // return resolve(await PromptForDonation(interaction, userConfig, guildMembers.find(member => member.id == i.values[0]), amount))
            }
            else if(i.customId == 'next_page') {
                selectMenuPage++;
                await interaction.editReply({ components: GetSelectMenuOverflowActionRows(selectMenuPage, assignmentOptions, placeholder)})
            }
            else if(i.customId == 'previous_page') {
                selectMenuPage--;
                await interaction.editReply({ components: GetSelectMenuOverflowActionRows(selectMenuPage, assignmentOptions, placeholder)})
            }
        })
        
        collector.on('end', collected => {
            if(collected.size == 0) {
                //if not submitting just remove the components because they didn't want to see any more info
                submitting ? interaction.deleteReply() : interaction.editReply({components: []})
                return resolve(); //we finished the function
            }
        });
    });
}

const DisplayFullInfo = async (interaction, info, config, page, submitting=false) => {
    //TODO if title too long add it to the start of the description, if description is too long add it to the fields
    // fields too long add to a second embed
    const assignmentEmbed = new EmbedBuilder()
    .setColor(primaryColour)
    .setTitle(info.title.length <= 256 ? info.title : info.title.slice(0, 255))
    .setDescription(info.title.length <= 256 ? info.description : `**${info.title.slice(256)}**\n${info.description}`);
    // .setThumbnail() IDK maybe there is an image on the website :/

    // if they are logged into the website themself, limit logins uses the owner for this function so thats why the check is here
    if(submitting || (!config.settings.general.LimitLogins && loginGroups.hasOwnProperty(interaction.user.id))) {
        assignmentEmbed.addFields(...info.submissionData);
    }
    else {
        assignmentEmbed.addFields({ name: 'Submission and Comments', value: 'to see submission stuff and comments you must be logged in with limit logins off'})
    }

    if(info.attachments.length > 0) {
        assignmentEmbed.addFields({name: 'Attachments', value: info.attachments.map(atc => `[${atc.title}](${atc.url})`).join('\n')})
    }

    await interaction.editReply({ embeds: [assignmentEmbed], components: []});

    //if we aren't submitting finish here, else continue
    if (!submitting) return; 
    //* to check whether or not we can donate through the bot on the submit screen
    // page.waitForSelector('div#intro div.form-check', { timeout : 5000 })
    //* edit submit and just submit are the same
    const submitButton = await page.$('input[value="editsubmission"] + button[type="submit"]')
    
    if(!submitButton) {
        return await interaction.followUp({content: `couldn't find a submit or edit button, maybe you only had one submit allowed`})
    }
    // element.click();
    // await page.evaluate(ele => ele.click(), element);

    //*I don't need to wait for selector cause page.waitfornavigation networkidle2
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), /*submitButton.evaluate(ele => ele.click())*/submitButton.click() ])
    
    const personalOnlyCheckBox = await page.$('div.form-check input[name="submissionstatement"]')
    // CommandInteractionOptionResolver.log
    if(personalOnlyCheckBox) {
        //checkbox so making it true
        personalOnlyCheckBox.setAttribute('value', 1);
        assignmentEmbed.addFields({ name: 'YOUR OWN WORK', value: `This assignment has to be all your own work, you will not get paid if submitting because it can't be shared!`})
        await interaction.editReply({ embeds: [assignmentEmbed]})
    }

    //TODO add the prev sub files and submitting info to the embed
    //TODO convert that to maybe a function or something, because need to fetch this every time there is a change
    // const prevSubFiles = await page.$$('div.fp-thumbnail')
    //TODO maybe make this a new function instead?? it has a lot of moving parts, idk
    //* I do have access to config in here which is very nice
    return new Promise(async (resolve, reject) => {
        // creates action row
        // the max work you can upload is 3 files at a time to the moodle website
        // sometimes you do need to upload 3 files, so that is why i did it like this
        const userWork = [ 
            await interaction.options.getAttachment('work1'), 
            await interaction.options.getAttachment('work2'), 
            await interaction.options.getAttachment('work3'),
        ].filter(w=>w)//get rid of the null / undefined ones (truthy statement)
        
        //always have userWork stored, (so they can go back to using their own, use chosenWork for whatever work is currently in use)
        let chosenWork = { attachments: userWork };
        
        //* owner is used for person identification
        const dbWork = await AssignmentModel.find({ name: info.title })

        const submitterConfigs = dbWork.map(work => GetConfigById(work.owner))

        // create action row, disable work list, disable add work are args
        const buttonRow = CreateSubmitButtonsRow(Boolean(personalOnlyCheckBox) || dbWork.length == 0, chosenWork.attachments.length == 0);
        // then just check if user work is different to other work and viola. thats how you know
        assignmentEmbed.addFields({ name: 'Work to Add', value: userWork.map(work => `[${work.name}](${work.attachment})`).join(', ') || 'none'})
        //* the current work is in the submission info, but like yeah I guess this can be for when it isn't saved yet
        assignmentEmbed.addFields({ name: 'Current work on Assignment', value: (await page.evaluate(() => Array.from(document.querySelectorAll('div.fp-thumbnail img'), elem => elem.title))).join(', ') || 'none' })

        //TODO add quit, view all submissions, submit (if borrowing, -50, if donating +75)
        const reply = await interaction.editReply({content: ' ', embeds: [assignmentEmbed], components: [buttonRow], fetchReply: true})
        const filter = i => i.user.id === interaction.user.id;
        collector = await reply.createMessageComponentCollector({ filter, time: 60 * 1000 });

        const clearButton = buttonRow.components.find(btn => btn.data.label == 'Clear')

        // get them to choose a recipient
        collector.on('collect', async (i) => {
            if(i.customId == 'quit') {
                await i.deferUpdate();
                collector.stop();
                if(!config.settings.general.AutoSave) {
                    //? there might be better ways to click a button
                    await page.evaluate(() => document.querySelector('input[type="submit"][value="Cancel"]').click())
                }
                //just remove the components instead of disabling cause I'm lazy
                return resolve(await interaction.editReply({ components: []}))
            }
            else if(i.customId == 'clear') {
                await interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true)]})
                await i.deferUpdate();
                clearButton.setDisabled(true)
                await interaction.editReply({ components: [buttonRow]})
                for await (const submFile of await page.$$('div.fp-thumbnail')) {
                    //* for some reason when a thing is deleted, sometimes it stays on the page unfortunately
                    await submFile.click().catch();
                    await DeleteFileFromPage(page);
                }
                assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment').value = 'none'
                await interaction.editReply({ embeds: [assignmentEmbed], components: [buttonRow]})
            }
            else if(i.customId == 'add work') {
                //* it should be disabled if they have no work, but just a precausion
                if(chosenWork.attachments.length == 0) {
                    await i.deferUpdate();
                    return TemporaryResponse(interaction, 'You have no work to add!')
                }
                // const addWorkButton = buttonRow.components.find((button) => button.data.label == 'add work')
                //don't let them try add work at the same time
                // await addWorkButton.setDisabled(true)
                // CreateSubmitButtonsRow(Boolean(personalOnlyCheckBox) || dbWork.length == 0, chosenWork.attachments.length == 0);
                await interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true)]})
                await i.deferUpdate();
                
                //if donating and not all my own work, add to the database. also add attachments if provided
                await page.waitForSelector('div.filemanager-toolbar a[title="Add..."]')
                if(chosenWork.attachments.length > 0) {
                    for (const work of chosenWork.attachments) {
                        if(!clearButton.data.disabled) {
                            const alreadySubmittedFile = await page.$(`div.fp-thumbnail img[title="${work.name}"]`)
                            
                            //* deleting the old file, cause they are uploading a new one
                            if(alreadySubmittedFile) {
                                //await needed because this has to be done before the delete button is clicked
                                await alreadySubmittedFile.click().then(async () => {
                                    //all the buttons are already loaded in the dom for some reason (before popup), so just click the delete, but waiting just in case
                                    await DeleteFileFromPage(page)
                                }).catch();
                            }
                        }
                        await CreateTmpAndUpload(page, work)          
                    }
                    clearButton.setDisabled(false); // now it isn't empty they can click it once it's shown
                    let workOnAssignInfo = assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment')
                    // set the value to be the new values added, if it was already added it won't duplicate
                    // workOnAssignInfo.value = new Set([...workOnAssignInfo.value.split(', '), ...chosenWork.attachments.map(work => work.name)]).join(', ');
                    //? probably a better quicker algorithm for this, but at least it is a one liner which I like
                    // adds the new assignment, if it wasn't already in the list 
                    workOnAssignInfo.value = workOnAssignInfo.value.trim().replace('none', '');
                    console.log(workOnAssignInfo.value)
                    for (const attc of chosenWork.attachments) {
                        if(!workOnAssignInfo.value.includes(attc.name)) {
                            workOnAssignInfo.value += `${workOnAssignInfo.value.length > 0 ? ', ' : ''}${attc.name}`;
                        }
                    }
                    // workOnAssignSplit = workOnAssignInfo.value.split(', ');
                    // workOnAssignInfo.value = workOnAssignSplit.push(...(chosenWork.attachments.map(work => work.name).filter(name => !workOnAssignSplit.includes(name)))).join(', ');
                    // if(workOnAssignInfo.includes(chosenWork.attachworkOnAssignInfo+= chosenWork.attachments.map(work => work.name).join(', ')
                    await interaction.editReply({ embeds: [assignmentEmbed]})
                }
                //after it is finished enable it
                // await addWorkButton.setDisabled(false)
                await interaction.editReply({components: [buttonRow]})
                // I think I don't need this because button row has the default stuff already
                // await interaction.editReply({components: [CreateSubmitButtonsRow(Boolean(personalOnlyCheckBox) || dbWork.length == 0, chosenWork.attachments.length == 0)]})
            }
            else if(i.customId == 'save') {
                await i.deferUpdate();
                await collector.stop()
                //* click the save button to finalise changes and wait for page to load
                // if the work has an owner and that owner is not the user they need to pay
                const UsingBorrowedWork = chosenWork?.owner && chosenWork?.owner != interaction.user.id;
                //! If they just add like an extra file to the work account for that and just add it too the attachments
                //* luckily that can be done by checking what they have submitted cause it shows what files are there so add or remove the files
                // used to update work if they already have it (or delete it :/ )
                const replacingSharedWork = dbWork.find(work => work.owner == interaction.user.id)
                if(UsingBorrowedWork) {
                    const ownerConfig = GetConfigById(chosenWork.owner)
                    // if they have already submitted work through the bot they need to delete their old work

                    if(await SendConfirmationMessage(interaction, `You are submitting work from another person, you will have to pay $${assignmentBorrowCost} to ${ownerConfig.name ?? ownerConfig.nicknames[0] ?? `<@${ownerConfig.discordID}>`}${replacingSharedWork ? `\nYou will be also removing your old work so it will take back $${assignmentBorrowCost}`:''}`)) {
                        //
                        config.tokens -= assignmentBorrowCost; // take away amount that it costs
                        ownerConfig.tokens += assignmentSharedTokens; // paying the owner

                        // add to their stats so they can get achievements
                        config.stats.AssignmentsBorrowed++;
                        ownerConfig.stats.AssignmentsShared++;

                        // if they had got the earning already remove it, and remove their old work
                        if(replacingSharedWork) {
                            config.tokens -= assignmentSubmissionTokens;
                            //delete the old work now no need to wait for it
                            replacingSharedWork.delete();
                        }
                        // save the db stuff
                        await Promise.all([config.save(), ownerConfig.save()]);
                    }
                    else {
                        //return early 
                        return resolve(await interaction.editReply({ components: [CreateSubmitButtonsRow(true, true, true)]}))
                        // return resolve(await DisplayFullInfo(interaction, updatedInfo, config, page, false));
                    }
                }
                // await Promise.all([
                //     page.waitForNavigation(),
                //     page.evaluate(() => document.querySelector('input[type="submit"][value="Save changes"]').click()),
                // ])
                
                //TODO fix the comment here after testing and enable the save button again
                const updatedInfo = info;
                // const updatedInfo = await GetFullAssignmentInfo(page)

                // if they have donating set to true and it isn't personal only and they aren't using borrowed work
                if(!UsingBorrowedWork && userWork.length > 0 && config.settings.assignments.Donating && !personalOnlyCheckBox) {
                    //send a confirmation message saying, do you want to donate this assignment?
                    console.log(updatedInfo)
                    if(replacingSharedWork) {
                        replacingSharedWork.modifyDate = updatedInfo.submissionData.find(subm => subm.name == 'Last modified').value;
                        const submittedFiles = assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment').value.split(', ');
                        //if they have updated files, remove the same ones before pushing (replacing them if they exist) and make sure it was actually part of the submit
                        replacingSharedWork.attachments = replacingSharedWork.attachments.filter(attc => !userWork.attachments.some(userAttc => userAttc.name == attc.name) && submittedFiles.includes(attc.name))
                        replacingSharedWork.attachments.push(...userWork);
                        replacingSharedWork.save();
                        console.log(`${interaction.user.username} updated their work for the assignment ${info.title}`)
                    }
                    else {
                        const newAssignment = new AssignmentModel({ 
                            name: updatedInfo.title, 
                            owner: interaction.user.id,
                            modifyDate: updatedInfo.submissionData.find(subm => subm.name == 'Last modified').value,
                            attachments: userWork
                        })
                        newAssignment.save();
                        config.stats.AssignmentNames.push(info.title);
                        config.tokens += assignmentSubmissionTokens;
                        config.save();
                        console.log(`${interaction.user.username} donated their work to the assignment ${info.title}`)
                    }
                }
                //finally update the embed to have the new submitted stats
                return resolve(await DisplayFullInfo(interaction, updatedInfo, config, page, false));
            } // submission list
            else if(i.customId == 'shared work') {
                await i.deferUpdate();
                //make it so that the collector will last longer than the submission list collector 
                // if there was a way to pause it that would be nice :P
                collector.resetTimer({ time: 185 * 1000 })
                // await TemporaryResponse(interaction, 'Sorry Currently in development, feel free to PR on github!');
                chosenWork = await CreateSubmissionListEmbedAndButtons(interaction, page, chosenWork, dbWork, userWork, submitterConfigs, info.title)

                if(chosenWork) {
                    //TODO update the embed to show that they are using the new work edit the chosen word field not this
                // assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment').value = 'none'
        // assignmentEmbed.addFields({ name: 'Work to Add', value: userWork.map(work => `[${work.name}](${work.attachment})`).join(', ') || 'none'})
                    //TODO add if its their or someone elses work to this section of the thing
                    assignmentEmbed.data.fields.find(field => field.name == 'Work to Add').value =`${chosenWork?.owner ? `(<@${chosenWork.owner}>'s work)` : '(Your work)'} ${chosenWork.attachments.map(work => `[${work.name}](${work.attachment})`).join(', ') || 'none'}`;
                    //TODo and then edit the interaction embed to have the proper buttons and stuff
        // const clearButton = buttonRow.components.find(btn => btn.data.la/bel == 'Clear')
                    buttonRow.components.find(btn => btn.data.label == 'Add Work').setDisabled(chosenWork.attachments.length == 0)
                    // addWorkButton.setDisabled(chosenWork.attachments.length == 0)
                    // console.log(addWorkButton)
                    await interaction.editReply({ embeds: [assignmentEmbed], components: [buttonRow]})
                }
                else {
                    return resolve(interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true)]}))
                }
            }
        })
        
        collector.on('end', collected => {
            if(collected.size == 0) {
                //disable all the buttons cause I think it looks nice
                return resolve(interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true)]})) // resolve cause we done
            }
        });
    });
}

const CreateSubmissionListEmbedAndButtons = async (interaction, page, chosenWork, dbWork, userWork, submitterConfigs, assignmentName) => {
    //If this function is being called dbWork.length > 0 is true so iteration works
    //*now I doubt 25 people will submit assignments, but I should probably code for that
    // todo if admin, allow them to delete submissions, or if validy is false auto delete I guess

    // get all the configs of the people submitting 
    // I don't want to refresh this function heaps because yeah
    let workIndex = 0;
    // 256 - 32 = 224 (max for assignmentName / title to be)
    const listEmbed = new EmbedBuilder()
    .setColor(primaryColour)
    .setTitle(`List of Donated Assignments for ${assignmentName.length <= 224 ? assignmentName : assignmentName.slice(0, 224)}`)
    .setDescription(`${assignmentName.length > 224 ? assignmentName.slice(224) + '\n' : ''}Rotate through the submissions to use the buttons for that submission, like check validity (make sure they haven't unsubmitted and check for grade)` +
    `or set as work to submit. If you choose to borrow work you will have to pay the user ${assignmentBorrowCost} when you click save`)
    .setFields(GetWorkFields());

    const reply = await interaction.editReply({ content: '', embeds: [listEmbed], components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1), fetchReply: true});

    const filter = i => i.user.id === interaction.user.id;

    const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000 });
    // wait for the person to choose stuff and finish the thing
    return new Promise(async (resolve, reject) => {
        collector.on('collect', async (i) => {
            // await collector.stop();
            if(i.customId == 'return') {
                await i.deferUpdate()
                return resolve(chosenWork);
                // await interaction.editReply({ components: GetWorkButtonRows(false, false, false) });
                // return resolve(true);
            }
            else if(i.customId == 'reset') {
                await i.deferUpdate()
                //* change work choice back to userWork *it gets rid of the owner*
                chosenWork = { attachments: userWork };
            }
            else if(i.customId == 'next') {
                await i.deferUpdate()
                //next is disabled if it can't go any further, so this is safe
                workIndex++;
            }
            else if(i.customId == 'back') {
                await i.deferUpdate()
                workIndex--;
            }
            else if(i.customId == 'verify') {
                // if the person isn't logged in, we can't check!
                if(!loginGroups.hasOwnProperty(dbWork[workIndex].owner)) {
                    await i.deferUpdate();
                    return await interaction.followUp(`The user is logged out! I don't reccomend using this work, but it's an option`)
                }
                await interaction.editReply({ components: GetWorkButtonRows(true, true, true)});
                await i.deferUpdate();
                // create a new browser with new cookies, log in as the owner id and go to the current quiz and get info
                const personToVerify = submitterConfigs.find(subConf => subConf.discordId == dbWork[workIndex].owner);
                const verifyingBrowser = await puppeteer.launch();
                const verifyingPage = await verifyingBrowser.newPage();
                // go to the non editing version of the page to get the info
                // await verifyingPage.goto(page.url().replace('&action=editsubmission', ''))
                //login to moodle through new page, it automatically waits for navigation
                LoginToMoodle(verifyingPage, dbWork[workIndex].owner, page.url().replace('&action=editsubmission', '')).catch((err) => {
                    console.log(err)
                    interaction.followUp({ content: 'An error occured while signing into moodle, they might have changed their password but not logged out and back in'})
                    interaction.editReply({components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1)})
                });
                await verifyingPage.waitForSelector('div.submissionstatustable tbody tr td')
                const veryPersonInfo = await GetFullAssignmentInfo(verifyingPage, false);
                verifyingBrowser.close();

                dbWork[workIndex].grade = personToVerify.settings.assignments.HideSelfGrade ? 'disabled' : veryPersonInfo.submissionData['Grading status']

                if(dbWork[workIndex].modifyDate != veryPersonInfo.submissionData.find(subm => subm.name == 'Last modified').value) {
                    //THEY CHANGED THEIR WORK WITHOUT THE BOT!!! DELETE THEIR WORK AND TAKE AWAY THEIR MONEY
                    // they can always resubmit again if they didn't mean to edit it so it is on purpose
                    await interaction.followUp(`<@${personToVerify.discordId}> had different dates! They submitted on ${dbWork[workIndex].modifyDate}, but it was ` +
                    `found that they had edited it on ${veryPersonInfo.submissionData.find(subm => subm.name == 'Last modified').value}! Their assignment work will now be deleted and they will pay a penalty of $${fakeAssignmentPenalty}! (As well as taking back their submission earnings of $${assignmentSubmissionTokens})`);
                    personToVerify.tokens -= assignmentSubmissionTokens;
                    personToVerify.tokens -= fakeAssignmentPenalty;

                    //delete the file from the database
                    await dbWork[workIndex].delete();
                    // it won't be deleted from the array though, so delete it here to!
                    dbWork.splice(workIndex, 1);
                }
                else {
                    TemporaryResponse(interaction, 'They have not modified the assignment without the bot, you are good to go!')
                }
                // don't need these as it is run for every function that doesn't return
                // listEmbed.setFields(GetWorkFields())
                // await interaction.editReply({ components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1) });
            }
            else if(i.customId == 'use work') {
                await i.deferUpdate();
                chosenWork = { owner: dbWork[workIndex].owner, attachments: dbWork[workIndex].attachments };
            }
            listEmbed.setFields(GetWorkFields());
            await interaction.editReply({embeds: [listEmbed], components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1)})
        })
        
        collector.on('end', collected => {
            if (collected.size == 0) {
                // If they ran out of time to choose just return nothing
                interaction.editReply({ content: "Interaction Timed Out (You didn't choose anything for 180 seconds), re-run the command again", components: GetWorkButtonRows(false, false, false) });
                return resolve(false);
            }
        });
    })
   

    function GetWorkFields() {
        return [ ...dbWork.map((work, index) => {
            currentPerson = submitterConfigs.find(subConf => subConf.discordId == work.owner)
            return {
                //if they don't have a name, use their first nickname, otherwise just put it in discord format
                // I think because it is an embed it actually shows account so that by default
                // name: `${currentPerson.name ?? currentPerson.nicknames[0] ?? `<@${currentPerson.discordId}>`}`
                name: `${currentPerson.name ?? currentPerson.nicknames[0] ?? currentPerson.discordId}${index == workIndex ? '【 SELECTED 】' : ''}`,
                //Not using (name)[url] for attachments because they could submit for free (and without the bot)
                value: `Grade: ${work.grade}\nSubmitted on ${work.modifyDate}\nAttachments: ${work.attachments.map(att => att.name).join(', ')}`
            }
        }), { name: 'Current Chosen Work: ', value: `${chosenWork?.owner ? `(<@${chosenWork.owner}>'s Work) ` : '(Your Work) '}${chosenWork.attachments.map(att => att.name).join(', ') || 'none' }`}]
    }

    function GetWorkButtonRows(backDisabled=false, nextDisabled=false, disableAll=false) {
        return [ 
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                .setCustomId('reset')
                .setLabel('Reset Work Choice')
                .setDisabled(disableAll)
                .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('return')
                    .setLabel('Return')
                    .setDisabled(disableAll)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('back')
                    .setLabel('Back')
                    .setDisabled(backDisabled || disableAll)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setDisabled(nextDisabled || disableAll)
                    .setStyle(ButtonStyle.Primary),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify')
                    .setLabel('Verify')
                    .setDisabled(disableAll)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('use work')
                    .setLabel('Use Work')
                    .setDisabled(disableAll)
                    .setStyle(ButtonStyle.Primary),
            )
            ]
    }
}

const CreateTmpAndUpload = async (page, work) => {

    
    const tmpfilePath = path.join(os.tmpdir(), work.name)
    
    await page.evaluate(() => document.querySelector('div.filemanager-toolbar a[title="Add..."]').click())
    await page.waitForSelector('input[type="file"]')

    //* the work is work.attachment for the url to the download item
    const fileBufferResponse = await axios({
        url: work.attachment,
        contentType: work.contentType,
        encoding: null,
        method: 'GET',
        responseType: 'stream'
        // responseType: 'arraybuffer'
    })

    await fileBufferResponse.data.pipe(fs.createWriteStream(tmpfilePath));
    // console.log(fileBuffer)
    // fs.writeFileSync(tmpfilePath, fileBuffer, function(err) {
    //     if(err) {
    //         console.log(err);
    //     } else {
    //         console.log("The file was saved!");
    //     }
    // })
    // await fs.writeFile(tmpfilePath, fileBuffer);
    const [filechooser] = await Promise.all([
        page.waitForFileChooser(),
        page.click('input[type="file"]')
        // page.evaluate(() => document.querySelector('input[type="file"]').click())
    ])

    await filechooser.accept([tmpfilePath])
    await page.click('button.fp-upload-btn')
    //* need to wait for the upload button to finish before deleting the file, file thumbnail would have loaded
    await page.waitForSelector(`div.fp-thumbnail img[title="${work.name}"]`)

    //Delete the old file
    fs.unlink(tmpfilePath, (err) => {
        if (err) throw err;
        console.log(`${tmpfilePath} was deleted`);
    })

}

const DeleteFileFromPage = async (page) => {
    await page.waitForSelector('button.fp-file-delete');
    await page.evaluate(() => document.querySelector('button.fp-file-delete').click());
    await page.waitForSelector('button.fp-dlg-butconfirm');
    await page.evaluate(() => document.querySelector('button.fp-dlg-butconfirm').click());
}

const CreateSubmitButtonsRow = (sharedWorkDisabled=false, addWorkDisabled=false, disableAll=false) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('quit')
            .setLabel('Quit')
            .setDisabled(disableAll)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('clear')
            .setLabel('Clear')
            .setDisabled(disableAll)
            .setStyle(ButtonStyle.Danger), // clear removes files
        new ButtonBuilder()
            .setCustomId('shared work')
            .setLabel('Shared Work')
            .setDisabled(sharedWorkDisabled || disableAll)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('add work')
            .setLabel('Add Work')
            .setDisabled(addWorkDisabled || disableAll)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('save')
            .setLabel('Save')
            .setDisabled(disableAll)
            .setStyle(ButtonStyle.Success),
    )
}