const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlagsBitField, ComponentType, SlashCommandSubcommandBuilder, CommandInteractionOptionResolver } = require('discord.js');
const puppeteer = require('puppeteer');
const { GetSelectMenuOverflowActionRows, LoginToMoodle, AskForCourse, SendConfirmationMessage, TemporaryResponse, BrowserWithCache, mainStaticUrl, loginGroups } = require("../util/functions")
const { primaryColour, assignmentBorrowCost, assignmentSharedTokens, confirmationTokens, assignmentSubmissionTokens, fakeAssignmentPenalty, botOwners } = require("../util/constants");
const { ConvertName, GetConfigById } = require('./configSlash')
const mongoose = require('mongoose')
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios');
const { client } = require('..');

//TODO give them an extra reward for getting a grade
//TODO have a subcommand called diff, you compare the work done between two people, like what has both done, what has noone done, who did this, who did that.
//TODO give huge warning when they want to submit nothing
//? maybe I should make it so you can choose the price of your assignment, with default in constants.js
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
                    // .setRequired(true)
            )
        )
	.addSubcommand(subcommand =>
		subcommand
			.setName('submit')
			.setDescription('submit an assignment')
            .addStringOption(option =>
                option.setName('assignment-name')
                    .setDescription('The assignment that you are submitting to, if null select menu shown (you can use url if you want)')
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
        owner: { type: String }, // so having a second owner if they borrowed work from other people too
        price: { type: Number, default: 25 }, // for when other people borrow work and pay back
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
        // const browser = await BrowserWithCache();
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
                //putting in me if they don't provide a person name
                let studentName = ConvertName(await interaction.options.getString("studentname") ?? 'me')
                if(studentName == 'me') {
                    studentName = config.name;
                    if(studentName == null) {
                        await interaction.editReply({ content: `You don't have a name in your config, either run /login or /config and put your name in manually`})
                        return browser.close()
                    }
                }
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
        //Once its done, close the browser to stop the browsers stacking up
        await browser.close();
    }
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
            attachments: Array.from(mainDiv.querySelectorAll('div[id*="intro"] div[id*="assign_files"] div.fileuploadsubmission a'), (elem) => {
                if(elem.classList)
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
            }).filter(obj => obj.name && obj.value), // truthy falsy stuff, make sure stuff isn't n/a
            feedback: Array.from(document.querySelectorAll('div.feedback tbody tr'), (tr) => {
                return {
                    name: tr.querySelector('th')?.textContent.trim(),
                    value: tr.querySelector('td')?.textContent.trim() || 'n/a',
                    inline: true
                }
            })
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
    //*if title too long add it to the start of the description, if description is too long add it to the fields
    // fields too long add to a second embed
    const assignmentEmbed = new EmbedBuilder()
    .setColor(primaryColour)
    .setTitle(info.title.length <= 256 ? info.title : info.title.slice(0, 255))
    .setDescription(info.title.length <= 256 ? info.description : `**${info.title.slice(256)}**\n${info.description}`);
    // .setThumbnail() IDK maybe there is an image on the website :/

    // if they are logged into the website themself, limit logins uses the owner for this function so thats why the check is here
    // if they are just trying to view an assignment missing for another person, then they don't need to see it I guess, idk how I feel about this tbh
    const showingFullInfo = (!config.settings.general.LimitLogins && loginGroups.hasOwnProperty(interaction.user.id) && !(interaction.options.getSubcommand() == 'missing' && interaction.options.getString('studentname') != null));
    //(if they are submitting than they are obviously logged in!)
    if(submitting || showingFullInfo) {
        assignmentEmbed.addFields(...info.submissionData);
        //if they aren't hiding feedback show that too!
        if(!config.settings.assignments.HideFeedback) {
           assignmentEmbed.addFields(...info.feedback) 
        }
    }
    else {
        assignmentEmbed.addFields({ name: 'Submission and Comments', value: 'to see submission stuff and comments you must be logged in with limit logins off'})
    }

    if(info.attachments.length > 0) {
        assignmentEmbed.addFields({name: 'Attachments', value: info.attachments.map(atc => `[${atc.title}](${atc.url})`).join('\n')})
    }

    //if we aren't submitting finish here, else continue
    if (!submitting) {
        //Add button to make comments and put that on the embed,
        const commentRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('Add Comments')
                .setLabel('Add Comments')
                .setDisabled(false)
                .setStyle(ButtonStyle.Success),
            // new ButtonBuilder()
            //     .setCustomId('Remove Comments')
            //     .setLabel('Add Comments')
            //     .setDisabled(info.comments.length == 0)
            //     .setStyle(ButtonStyle.Danger),
        )
        // const commentAllowed = !config.settings.general.LimitLogins && loginGroups.hasOwnProperty(interaction.user.id)
        const reply = await interaction.editReply({ embeds: [assignmentEmbed], components: showingFullInfo ? [commentRow] : []});
        
        // if comments aren't allowed just return early
        if(!showingFullInfo) return;
        
        return new Promise(async (resolve, reject) => {
            const filter = i => i.user.id === interaction.user.id;
            const collector = await reply.createMessageComponentCollector({ filter, time: 30 * 1000 });

            let addingComments = false
            // get them to choose a recipient
            collector.on('collect', async (i) => {
                if(i.customId == 'Add Comments') {
                    i.deferUpdate()
                    // if they are already adding comments, don't duplicate them! Maybe in the future make it act like submitting where it turns off the collection or whatever :P
                    // it would be pretty easy, just have to use the nested collector again I think :/
                    if(addingComments) return;
                    //*extending the collector so that the page won't close!
                    collector.resetTimer({ time: 35 * 1000})
                    addingComments = true;
                    await WaitToMakeSubmissionComments(interaction, page, config, assignmentEmbed, info)
                    addingComments = false;
                }
            });
            
            collector.on('end', collected => {
                // just remove the comment option after 30 seconds
                return resolve(interaction.editReply({components: []}))
            });
        });
    }
    else {
        //TODO MAKE THIS A FUNCTION, BECAUSE IT IS WAYYY TOO NESTED
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
    
            // personalOnlyCheckBox.checked = true;
            //! I am pretty sure that checked needs set with a click because moodle changes stuff when check is clicked, but test this first
            await personalOnlyCheckBox.evaluate(node => node.setAttribute('checked', true))
            // personalOnlyCheckBox.setAttribute('value', 1);
            //! get attribute and set and all of that stopped working when they used to, so eval it is I guess
            // console.log(await personalOnlyCheckBox.evaluate(node => node.getAttribute('aria-invalid')))
            // if(await personalOnlyCheckBox.evaluate(node => node.getAttribute('aria-invalid')) == 'true') {
            //     //checkbox so making it true
            //     personalOnlyCheckBox.click();
            // }
            
    
            assignmentEmbed.addFields({ name: 'YOUR OWN WORK', value: `This assignment has to be all your own work, you will not get paid if submitting because it can't be shared!`})
            // await interaction.editReply({ embeds: [assignmentEmbed]})
        }
    
        //TODO add the prev sub files and submitting info to the embed
        //TODO convert that to maybe a function or something, because need to fetch this every time there is a change
        // const prevSubFiles = await page.$$('div.fp-thumbnail')
        //TODO maybe make this a new function instead?? it has a lot of moving parts, idk
        //* I do have access to config in here which is very nice
        return new Promise(async (resolve, reject) => {
            // creates action row
            // the max work you can upload is basically always 1 - 3 files at a time to the moodle website
            // sometimes you do need to upload 3 files, so that is why i did it like this
            const userWork = [ 
                await interaction.options.getAttachment('work1'), 
                await interaction.options.getAttachment('work2'), 
                await interaction.options.getAttachment('work3'),
            ].filter(w=>w)//get rid of the null / undefined ones (truthy statement)
            
            //this is what the max file size is: Maximum file size: 64MB, maximum number of files: 1
            //? this other method might work too, not sure which is nicer
            // const restrictionsString = (await page.$('div.fp-restrictions span')).textContent;
            const restrictionsString = await page.evaluate(() => document.querySelector('div.fp-restrictions span').textContent)
    
            //returns numbers or null I guess, if it isn't in mb then I'm just gonna set then max to be the discord limit of 100mb (but discord does it for me!)
            //*max file size in megabytes [1] to get the group and not the match, i so it isn't case sensitive
            const maxFileSize = restrictionsString.match(/Maximum file size: (\d+)mb/i)[1]
            const maxNumberOfFiles = restrictionsString.match(/maximum number of files: (\d+)/i)[1]
    
            //click on the file format icon so it is like the same for everyone
            await page.evaluate(() => document.querySelector('div.filemanager-toolbar a[title="Display folder with file icons"]').click())
    
            //returns in format of: '.pdf' , '.exe' etc
            const fileTypeAllowedStrings = await page.evaluate(() => Array.from(document.querySelectorAll('div.form-filetypes-descriptions li small'), elem => elem.textContent))
            
            //always have userWork stored, (so they can go back to using their own, use chosenWork for whatever work is currently in use)
            // let chosenWork = { attachments: userWork };
            //* chosen work is now an array that holds the work that is new being put on the assignment and submitted
            // that way it can track whether or not someone used shared work
            const chosenWork = [];
            //* owner is used for person identification
            const dbWork = await AssignmentModel.find({ name: info.title })
    
            //* the current work is in the submission info, but like yeah I guess this can be for when it isn't saved yet
            const curWorkOnAssignment = await GetWorkOnAssignment(page);
    
            // the configs of everyone that owns work and has added it to the shared list
            const submitterConfigs = dbWork.map(work => GetConfigById(work.owner))
            const sharedFullyDisabled = Boolean(personalOnlyCheckBox) || dbWork.length == 0;
    
            // create action row, disable work list, disable add work are args
            const buttonRow = CreateSubmitButtonsRow(sharedFullyDisabled, (userWork.length == 0 || curWorkOnAssignment.length >= maxNumberOfFiles));
    
            //get these out so I can modify them at times when needed, like the remove button right now!
            const addWorkButton = buttonRow.components.find(btn => btn.data.label == 'Add Work');
            const sharedWorkButton = buttonRow.components.find(btn => btn.data.label == 'Shared');
            const removeButton = buttonRow.components.find(btn => btn.data.label == 'Remove Work');
    
            //set the shared work button to have extra info because that way it is known if its fully disabled cause yeah
            sharedWorkButton.data.fullyDisabled = sharedFullyDisabled;
            // then just check if user work is different to other work and viola. thats how you know
            assignmentEmbed.addFields({ name: 'Work to Add', value: userWork.map(work => `[${work.name}](${work.attachment})`).join(', ') || 'none'})
    
            assignmentEmbed.addFields({ name: 'Current work on Assignment', value: curWorkOnAssignment.join(', ') || 'none' })
            
            //truthy falsy, anything greater than 0 is enabled
            removeButton.setDisabled(!curWorkOnAssignment.length)
    
            //todo show the cost that it will take to save e.g '$100 save', kinda ugly, maybe just add that to the confirmation embed after instead
            const reply = await interaction.editReply({content: ' ', embeds: [assignmentEmbed], components: [buttonRow], fetchReply: true})
            const filter = i => i.user.id === interaction.user.id;
            const collector = await reply.createMessageComponentCollector({ filter, time: 60 * 1000 });
    
            const nestedConfirmationCollector = {};
    
            // get them to choose a recipient
            collector.on('collect', async (i) => {
                if(i.customId == 'Quit') {
                    await i.deferUpdate();
                    collector.stop();
                    if(!config.settings.general.AutoSave) {
                        //? there might be better ways to click a button
                        await page.evaluate(() => document.querySelector('input[type="submit"][value="Cancel"]').click())
                    }
                    //just remove the components instead of disabling cause I'm lazy
                    //todo make them disabled instead
                    return resolve(await interaction.editReply({ components: []}))
                }
                else if(i.customId == 'Remove Work') {
                    //TODO make it prompt for all, or specific files
                    // await interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true, true,)]})
                    // await i.deferUpdate();
                    const removeCompRow = CreateSubmitButtonsRow(true, true, false, true);
                    
                    // calling this function but instead of adding we are removing stuff
                    await CheckToModifySubmittedFiles(interaction, i, page, nestedConfirmationCollector, chosenWork, userWork, assignmentEmbed, 
                        [removeCompRow], addWorkButton, sharedWorkButton, removeButton, [buttonRow], maxNumberOfFiles, true)
                    // // console.log(i.message.components[0], removeCompRow)
                    // // if currently in the removing work stage, close the adding work window
                    // // i.message.components[0].components.for
                    // if(i.message.components[0].components.every((btn, index) => btn.data.disabled ?? false == removeCompRow.components[index].data.disabled)) {
                    //     // await Promise.all([ i.deferUpdate(), nestedConfirmationCollector.stop() ])
                    //     await nestedConfirmationCollector.collector.stop();
                    //     i.deferUpdate();
                    //     return await interaction.editReply({ components: [buttonRow]})
                    //     // return await i.deferUpdate({ components: [buttonRow] });
                    // }
    
                    // //* can't edit components in defer update because they vanish back to normal in seconds, I swear that used to work
                    // await i.deferUpdate();
                    // await interaction.editReply({components: [removeCompRow]})
                    // // await i.deferUpdate({components: [removeCompRow]});
                    
                    // //this button should be disabled if the thing says none
    
                    // // let workOnAssignInfo = assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment')
                    // // const splitUpSubmittedAssignments = workOnAssignInfo.value.trim().split(', ');
    
                    // const splitUpSubmittedAssignments = await GetWorkOnAssignment(page);
    
                    // const filesToRemoveNames = await AmountConfirmationInput(interaction, nestedConfirmationCollector, splitUpSubmittedAssignments, 'Choose whether or not to remove all or just a certain file from the assignment', ButtonStyle.Danger)
    
                    // // await interaction.editReply({ components: [buttonRow]})
                    // for await (const submFile of await page.$$('div.fp-thumbnail')) {
                    //     const submFileName = await submFile.evaluate((node) => node.querySelector('img').title);
                    //     if(filesToRemoveNames.includes(submFileName)) {
                    //         //* for some reason when a thing is deleted, sometimes it stays on the page unfortunately
                    //         await submFile.click().catch();
                    //         await DeleteFileFromPage(page);
    
                    //         // remove it from the submitted assignments thing
                    //         splitUpSubmittedAssignments.splice(splitUpSubmittedAssignments.indexOf(submFileName), 1)
                    //     }
                    // }
    
                    // // const oldWorkOnAssign = assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment');
                    // //!!!! IF THERE IS A COMMA LIKE THAT, IT THINKS IT IS MORE THAN ONE ASSIGNMENT!
                    // // oldWorkOnAssign.value = oldWorkOnAssign.value.split(', ').filter(olWork => !filesToRemoveNames.includes(olWork)).join(', ') || 'none';
                    // assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment').value = splitUpSubmittedAssignments.length ? `'${splitUpSubmittedAssignments.join(`', '`)}'` : 'none';
    
                    // await interaction.editReply({ embeds: [assignmentEmbed], components: [buttonRow]})
                }
                else if(i.customId == 'Add Work') {
                    //* it should be disabled if they have no work, but just a precausion
                    if(userWork.length == 0) {
                        await i.deferUpdate();
                        return TemporaryResponse(interaction, 'You have no work to add!')
                    }
    
                    const addWorkOnlyRow = CreateSubmitButtonsRow(true, false, true, true);
                    
                    await CheckToModifySubmittedFiles(interaction, i, page, nestedConfirmationCollector, chosenWork, { owner: interaction.user.id, attachments: userWork }, assignmentEmbed, 
                        [addWorkOnlyRow], addWorkButton, sharedWorkButton, removeButton, [buttonRow], maxNumberOfFiles)
    
                    // await interaction.editReply({ embeds: [assignmentEmbed], components: [buttonRow]})
    
                }
                else if(i.customId == 'Save') {
                    await i.deferUpdate();
                    await collector.stop()
                    //* click the save button to finalise changes and wait for page to load
                    //? test this because maybe they can have more than one owner
                    // if the work has an owner and that owner is not the user they need to pay
                    // const UsingBorrowedWork = chosenWork?.owner && chosenWork?.owner != interaction.user.id;
                    const UsingBorrowedWork = chosenWork.some(work => work?.owner && work?.owner != interaction.user.id)
                    //* luckily that can be done by checking what they have submitted cause it shows what files are there so add or remove the files
                    // used to update work if they already have it (or delete it :/ )
                    const replacingSharedWork = dbWork.find(work => work.owner == interaction.user.id)
                    //So whilst the price thing is cool I don't know how I feel about it
                    //? Don't know if this works yet
                    if(UsingBorrowedWork) {
                        // basically ownerid: $100
                        const sharerCosts = chosenWork.reduce((sharerCosts, work) => {
                            if(work?.owner && work.owner != interaction.user.id) {
                                sharerCosts[work.owner] = (sharerCosts[work.owner] || 0) + work.price;
                            }
                        })
    
                        //array of configs that we need
                        const sharerConfigs = Object.keys(sharerCosts).map((owner) => GetConfigById(owner));
                        // const ownerConfig = GetConfigById(chosenWork.owner)
                        // if they have already submitted work through the bot they need to delete their old work
    
                        // if(await SendConfirmationMessage(interaction, `You are submitting work from another person, you will have to pay $${assignmentBorrowCost} to ${ownerConfig.name ?? ownerConfig.nicknames[0] ?? `<@${ownerConfig.discordID}>`}${replacingSharedWork ? `\nYou will be also removing your old work so it will take back $${assignmentBorrowCost}`:''}`)) {
                        if(await SendConfirmationMessage(interaction, `You are submitting work from other people, payouts below!\n${Object.entries(sharerCosts).map(([owner, cost]) => `${sharerConfigs.find(conf => conf.discordId == owner).name || `<@${owner}>`} - $${cost}`)}`)) {
                            for (const sharer of Object.entries(sharerCosts)) {
                                
                                const [owner, cost] = sharer;
    
                                config.tokens -= cost; // take away amount that it costs
    
                                //getting the correct config by the id
                                const ownerConfig = sharerConfigs.find(conf => conf.owner == owner);
                                ownerConfig.tokens += cost; // paying the owner
        
                                // add to their stats so they can get achievements
                                config.stats.AssignmentsBorrowed++;
                                ownerConfig.stats.AssignmentsShared++;
    
                                await ownerConfig.save();
                            }
    
                            // if they had got the earning already remove it, and remove their old work
                            //? see the thing with this is though, if they are adding someone elses pdf, then what happens, like that work belongs to x so I guess just add owner to work by defualt
                            // if(replacingSharedWork) {
                            //     config.tokens -= assignmentSubmissionTokens;
                            //     //delete the old work now no need to wait for it
                            //     replacingSharedWork.delete();
                            // }
                            // save the db stuff
                            // await Promise.all([config.save(), ownerConfig.save()]);
                            await config.save();
                        }
                        else {
                            //return early 
                            return resolve(await interaction.editReply({ components: [CreateSubmitButtonsRow(true, true, true, true,)]}))
                            // return resolve(await DisplayFullInfo(interaction, updatedInfo, config, page, false));
                        }
                    }
    
                    // comment out when testing
                    await Promise.all([
                        page.waitForNavigation(),
                        page.evaluate(() => document.querySelector('input[type="submit"][value="Save changes"]').click()),
                    ])
                    
                    // const updatedInfo = info; // for testing purposes
                    const submittedFiles = await GetWorkOnAssignment(page)
                    const updatedInfo = await GetFullAssignmentInfo(page)
                     
                    //TODO custom function to get the user to set the prices of all their newly submitted assignments default is just 25 per
                    // if they have donating set to true and it isn't personal only and they aren't using borrowed work
                    if(chosenWork.length > 0 && config.settings.assignments.Donating && !personalOnlyCheckBox) {
                        //send a confirmation message saying, do you want to donate this assignment?
                        console.log(updatedInfo)
                        //replacing shared work as in replacing something they already shared
                        if(replacingSharedWork) {
                            replacingSharedWork.modifyDate = updatedInfo.submissionData.find(subm => subm.name == 'Last modified').value;
                            //* if they have updated files, remove the same (old) ones before pushing (replacing them if they exist) and make sure it was actually part of the submit
                            // not all the user work may have been added so filter out the ones not added first
                            //! not sure what to do if people submit stuff with the same name I hope it doesn't cause errors, I think because of the replaceSameName variable it's fine
                            replacingSharedWork.attachments = replacingSharedWork.attachments.filter(attc => !userWork.filter(w => chosenWork.some(cw => cw.name == w)).some(userAttc => userAttc.name == attc.name) && submittedFiles.includes(attc.name))
                            replacingSharedWork.attachments.push(...chosenWork);
                            replacingSharedWork.save();
                            console.log(`${interaction.user.username} updated their work for the assignment ${info.title}`)
                        }
                        else {
                            const newAssignment = new AssignmentModel({ 
                                name: updatedInfo.title, 
                                owner: interaction.user.id,
                                modifyDate: updatedInfo.submissionData.find(subm => subm.name == 'Last modified').value,
                                attachments: chosenWork
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
                else if(i.customId == 'Shared') {
                    await i.deferUpdate();
                    //make it so that the collector will last longer than the submission list collector 
                    // if there was a way to pause it that would be nice :P
                    collector.resetTimer({ time: 185 * 1000 })
                    // await TemporaryResponse(interaction, 'Sorry Currently in development, feel free to PR on github!');
                    // chosenWork = await CreateSubmissionListEmbedAndButtons(interaction, page, chosenWork, dbWork, submitterConfigs, info.title, maxNumberOfFiles)
                    const quitEarly = await CreateSubmissionListEmbedAndButtons(interaction, page, chosenWork, dbWork, submitterConfigs, info.title, maxNumberOfFiles)
    
                    if(quitEarly) return resolve(interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true, true,)]}));
    
                    assignmentEmbed.data.fields.find(field => field.name == 'Current work on Assignment').value = (await GetWorkOnAssignment(page)).map(workName => {
                        const workFound = chosenWork.find(cWork => cWork.name == workName)
                        if(workFound) {
                            return workName + ` (<@${workFound.owner}>'s work)`
                        }
                        return workName
                    }).join(', ') || 'none';
                    await interaction.editReply({ embeds: [assignmentEmbed], components: [buttonRow]})
                }
            })
            
            collector.on('end', collected => {
                if(collected.size == 0) {
                    //disable all the buttons cause I think it looks nice
                    return resolve(interaction.editReply({components: [CreateSubmitButtonsRow(true, true, true, true,)]})) // resolve cause we done
                }
            });
        });
    } 
}

//TODO have a way to delete comments
const WaitToMakeSubmissionComments = async (interaction, page, config, mainEmbed, info, time=30000) => {
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const confirmationEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Follow up with any submission comments!')
        .setDescription('You have 30 seconds to make any comments on the assignment! Type stuff in here and it will be added as a comment to the website.')

        const confirmationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('Quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Danger),
        );
        //seperate to the intitial reply
        const reply = await interaction.followUp({content: ' ', embeds:[confirmationEmbed], components:[confirmationRow], fetchReply: true})
        
        const filter = i => i.user.id === interaction.user.id;
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
        // the only thing that it is collecting is quit so nothing needed here
        collector.on('collect', async (i) => {
            collector.stop()
            return resolve(true);
        })

        //resolve if they took too long
        collector.on('end', collected => {
            msgCollector.stop();
            reply.delete();
            if(collected.size == 0) {
                return resolve(false);
            }
        });
    })
}

const CreateSubmissionListEmbedAndButtons = async (interaction, page, chosenWork, dbWork, submitterConfigs, assignmentName, maxNumberOfFiles) => {
    //If this function is being called dbWork.length > 0 is true so iteration works
    //*now I doubt 25 people will submit assignments, but I should probably code for that
    // todo if admin, allow them to delete submissions, or if validity is false auto delete I guess

    // get all the configs of the people submitting 
    // I don't want to refresh this function heaps because yeah
    let workIndex = 0;
    // 256 - 32 = 224 (max for assignmentName / title to be)
    const listEmbed = new EmbedBuilder()
    .setColor(primaryColour)
    .setTitle(`List of Donated Assignments for ${assignmentName.length <= 224 ? assignmentName : assignmentName.slice(0, 224)}`)
    .setDescription(`${assignmentName.length > 224 ? assignmentName.slice(224) + '\n' : ''}Rotate through the submissions to use the buttons for that submission, like check validity (make sure they haven't unsubmitted and check for grade)` +
    `or set as work to submit. If you choose to borrow work you will have to pay the user ${assignmentBorrowCost} when you click save`)
    .setFields(await GetWorkFields());

    const buttonRow = GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1, undefined, undefined, dbWork[workIndex].owner == interaction.user.id);
                // await interaction.editReply({ components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1, false, addBorrowedButton.disabled, dbWork[workIndex].owner == interaction.user.id)})
    // in the second row
    const addBorrowedButton = buttonRow[1].components.find(btn => btn.data.label == 'Add Work')

    const reply = await interaction.editReply({ content: '', embeds: [listEmbed], components: buttonRow, fetchReply: true});

    const filter = i => i.user.id === interaction.user.id;

    const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000 });
    const nestedConfirmationCollector = {}
    // wait for the person to choose stuff and finish the thing
    return new Promise(async (resolve, reject) => {
        collector.on('collect', async (i) => {
            // await collector.stop();
            if(i.customId == 'Return') {
                await i.deferUpdate()
                await collector.stop()
                return resolve(false);
                // await interaction.editReply({ components: GetWorkButtonRows(false, false, false) });
                // return resolve(true);
            }
            // else if(i.customId == 'Reset') {
            //     await i.deferUpdate()
            //     //* change work choice back to userWork *it gets rid of the owner*
            //     chosenWork = { attachments: userWork };
            // }
            else if(i.customId == 'Next') {
                await i.deferUpdate()
                //next is disabled if it can't go any further, so this is safe
                workIndex++;
                await interaction.editReply({ components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1, false, addBorrowedButton.disabled, dbWork[workIndex].owner == interaction.user.id)})
            }
            else if(i.customId == 'Back') {
                await i.deferUpdate()
                workIndex--;
                await interaction.editReply({ components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1, false, addBorrowedButton.disabled, dbWork[workIndex].owner == interaction.user.id)})
            }
            else if(i.customId == 'Delete Shared') {
                i.deferUpdate();
                //send a confirmation message asking w
                if(await SendConfirmationMessage(interaction, `Are you sure that you want to delete the work containing \`${dbWork[workIndex].attachments.map(work => work.name).join(', ')}\` by <@${dbWork[workIndex].owner}>?`)) {
                    // pretty much should always take the money back, only bot owner can decide on that, because otherwise they get free money essentially!
                    if(!botOwners.includes(interaction.user.id) || await SendConfirmationMessage(interaction, `Do you want to take back the tokens that they earned for posting the assignment?`)) {
                        const deleteOwner = GetConfigById(dbWork[workIndex].owner);
                        deleteOwner.tokens -= assignmentSubmissionTokens;
                        if(deleteOwner.tokens < 0) deleteOwner.tokens = 0;
                        await deleteOwner.save();
                    }
                    //delete from the database, and then delete from the array
                    await dbWork[workIndex].delete();
                    dbWork.splice(workIndex, 1);
                }
            }
            else if(i.customId == 'Verify') {
                // if the person isn't logged in, we can't check!
                if(!loginGroups.hasOwnProperty(dbWork[workIndex].owner)) {
                    await i.deferUpdate();
                    return await interaction.followUp(`The user is logged out! I don't recommend using this work, but it *is* an option`)
                }
                await interaction.editReply({ components: GetWorkButtonRows(true, true, true)});
                await i.deferUpdate();
                // create a new browser with new cookies, log in as the owner id and go to the current quiz and get info
                const personToVerify = submitterConfigs.find(subConf => subConf.discordId == dbWork[workIndex].owner);
                // const verifyingBrowser = await puppeteer.launch();
                const verifyingBrowser = await BrowserWithCache();
                const verifyingPage = await verifyingBrowser.newPage();
                // go to the non editing version of the page to get the info
                // await verifyingPage.goto(page.url().replace('&action=editsubmission', ''))
                //login to moodle through new page, it automatically waits for navigation
                await LoginToMoodle(verifyingPage, dbWork[workIndex].owner, page.url().replace('&action=editsubmission', '')).catch((err) => {
                    console.log(err)
                    interaction.followUp({ content: 'An error occured while signing into moodle, they might have changed their password but not logged out and back in'})
                    // interaction.editReply({components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1)})
                    interaction.editReply({ components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1, false, addBorrowedButton.disabled, dbWork[workIndex].owner == interaction.user.id)})
                });
                await verifyingPage.waitForSelector('div.submissionstatustable tbody tr td')
                const veryPersonInfo = await GetFullAssignmentInfo(verifyingPage, false);
                await verifyingBrowser.close();

                // set their grade to the verified thing if it was marked
                const workGraded = veryPersonInfo.submissionData.find(sd => sd.name == 'Grading status').value;
                // dbWork[workIndex].grade = personToVerify.settings.assignments.HideSelfGrade ? 'disabled' : veryPersonInfo.submissionData.find(sd => sd.name == 'Grading status').value

                if(dbWork[workIndex].modifyDate != veryPersonInfo.submissionData.find(subm => subm.name == 'Last modified').value) {
                    //THEY CHANGED THEIR WORK WITHOUT THE BOT!!! DELETE THEIR WORK AND TAKE AWAY THEIR MONEY
                    // they can always resubmit again if they didn't mean to edit it so it is on purpose
                    const conclusionString = `<@${personToVerify.discordId}> had different dates! They submitted on ${dbWork[workIndex].modifyDate}, but it was ` +
                    `found that they had edited it on ${veryPersonInfo.submissionData.find(subm => subm.name == 'Last modified').value}! Their assignment work will now be deleted and they will pay a penalty of $${fakeAssignmentPenalty}! (As well as taking back their submission earnings of $${assignmentSubmissionTokens})`;
                    await interaction.followUp(conclusionString);
                    personToVerify.tokens -= assignmentSubmissionTokens;
                    personToVerify.tokens -= fakeAssignmentPenalty;

                    //Can't be negative so set it to zero if too low
                    if(personToVerify.tokens < 0) personToVerify.tokens = 0;
                    await personToVerify.save();
                    console.log(conclusionString)
                    //delete the file from the database
                    await dbWork[workIndex].delete();
                    // it won't be deleted from the array though, so delete it here to!
                    dbWork.splice(workIndex, 1);
                }
                else {
                    //it means that they didn't try exploit so give them a reward if it was graded
                    if(workGraded == 'Graded') {
                        //check that they haven't gotten a new grade or whatever
                        // basically, if the grade hasn't been changed then it means this is their first time and they can get the reward for verification
                        //TODO maybe send the recipient a direct message telling them that they have made the money and that can be a config setting
                        //TODO maybe also tell them if their work has been caught for cheating too?
                        if(dbWork[workIndex].grade == assignmentSchema.obj.grade.default) {
                            recipient = submitterConfigs.find(subConf => subConf.discordId == work.owner)
                            recipient.tokens += confirmationTokens;
                            await interaction.followUp(`<@${recipient.discordId}> has just earned $${confirmationTokens} for having their work being confirmed and graded!`)
                            // //! TEST THIS
                            // if(recipient.settings.general.SendDMS) {
                            //     // I don't know where I get the error but yeah
                            //     try {
                            //         // will not work because it needs to be a discord user
                            //         // const channel = await recipient.discordId.createDM();
                            //         const channel = await (await client.users.fetch(recipient.discordId)).createDM();
                            //         channel.send(`Congratulations! You just earned $${confirmationTokens} for the assignment \`${assignmentName}\` being verified!`)
                            //     } catch (error) {
                            //         console.log(`Couldn't send message to ${recipient.discordId}, their send messages setting will be disabled`)
                            //         recipient.settings.general.SendDMS = false;
                            //     }
                            // }
                            // lastly save all the changes made for them
                            await recipient.save()
                        }
                        dbWork[workIndex].grade = veryPersonInfo.feedback.find(fb => fb.name == 'Grade');
                        await dbWork[workIndex].save()
                    }
                    TemporaryResponse(interaction, 'They last modified it with the bot which means this is valid, you are good to go!')
                }
            }
            else if(i.customId == 'Add Borrowed Work') {
                const shareStuffRow = GetWorkButtonRows(true, true, true, false);

                // if someone has the same name file, it won't replace the file if it is already there idk if it is a good idea
                await CheckToModifySubmittedFiles(interaction, i, page, nestedConfirmationCollector, chosenWork, dbWork[workIndex], listEmbed, 
                    shareStuffRow, addBorrowedButton, undefined, undefined, buttonRow, maxNumberOfFiles, false, false)
            }
            listEmbed.setFields(await GetWorkFields());
            await interaction.editReply({embeds: [listEmbed], components: GetWorkButtonRows(workIndex == 0, workIndex == dbWork.length - 1)})
        })
        
        collector.on('end', collected => {
            if (collected.size == 0) {
                // If they ran out of time to choose just return nothing
                interaction.editReply({ content: "Interaction Timed Out (You didn't choose anything for 180 seconds), re-run the command again", components: GetWorkButtonRows(false, false, false) });
                return resolve(true);
            }
        });
    })
   

    async function GetWorkFields() {
        //return all the work submissions, as well as show what work has been chosen
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
        }),
        { name: 'Current Chosen Work: ', value: chosenWork.map(work => `${work.name} ${work?.owner != interaction.user.id ? `(<@${work.owner}>'s work)` : ''}`).join(', ') || 'none'},
        { name: 'Current Work on Assignment', value: (await GetWorkOnAssignment(page)).join(', ') || 'none'},
    ]

    }

    function GetWorkButtonRows(backDisabled=false, nextDisabled=false, disableAll=false, addWorkDisabled=false, deleteAllowed=false) {
        const mainActionRow = new ActionRowBuilder();
        //if the work belongs to the user themself, then let them delete it :P
        if(deleteAllowed || botOwners.includes(interaction.user.id) || interaction?.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            mainActionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('Delete Shared')
                    .setLabel('Delete')
                    .setStyle(ButtonStyle.Danger)  
                    .setDisabled(disableAll),
            )
        }
        return [ 
            new ActionRowBuilder().addComponents(
                // new ButtonBuilder()
                // .setCustomId('Reset')
                // .setLabel('Reset Work Choice')
                // .setDisabled(disableAll)
                // .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('Return')
                    .setLabel('Return')
                    .setDisabled(disableAll)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('Back')
                    .setLabel('Back')
                    .setDisabled(backDisabled)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('Next')
                    .setLabel('Next')
                    .setDisabled(nextDisabled)
                    .setStyle(ButtonStyle.Primary),
            ),
            mainActionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('Add Borrowed Work')
                    .setLabel('Add Work')
                    .setDisabled(addWorkDisabled)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('Verify')
                    .setLabel('Verify')
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
    // so the page actually accepts it wait for a little
    await page.waitForTimeout(50)
    await page.click('button.fp-upload-btn')
    //* need to wait for the upload button to finish before deleting the file, file thumbnail would have loaded
    await page.waitForSelector(`div.fp-thumbnail img[title="${work.name}"]`)

    //Delete the old file
    fs.unlinkSync(tmpfilePath, (err) => {
        if (err) throw err;
        console.log(`${tmpfilePath} was deleted`);
    })

}

const CheckToModifySubmittedFiles = async (interaction, i, page, nestedConfirmationCollector, chosenWork, workToAdd, mainEmbed, modifyWorkOnlyRows, addWorkButton, sharedWorkButton, removeButton, buttonRows, maxNumberOfFiles, deleting=false, replaceSameName=true) => {
    // if currently in the adding work stage, close the adding work window
    //? could use a second every here instead of just using zero but I am being lazy :/
    //* if all the other buttons are in disabled mode than remove this old message thing
    if(i.message.components[0].components.every((btn, index) => btn.data.disabled ?? false == modifyWorkOnlyRows[0].components[index].data.disabled)) {
        // old method, but if they spam click the modify buttons it causes problems, 
    // if(nestedConfirmationCollector.collector) {
        // await Promise.all([ i.deferUpdate(), nestedConfirmationCollector.stop() ])
        await nestedConfirmationCollector.collector.stop();
        i.deferUpdate();
        return await interaction.editReply({ components: buttonRows})
        // return await i.deferUpdate({ components: [buttonRow] });
    }
    

    await Promise.all([
        interaction.editReply({components: modifyWorkOnlyRows}),
        i.deferUpdate()
    ]);

    //* this one doesn't work though if you removed stuff from the page because the page doesn't actually remove them!!!!
    const splitUpSubmittedAssignments = await GetWorkOnAssignment(page);

    //? /////////////////////////////////////////////////////
    
    //basically check if added the max amount of assignments by getting the total and checking against limit
    const AddAllButtonDisabled = !deleting && CheckForMaxFilesIfAdding(workToAdd.attachments, splitUpSubmittedAssignments, maxNumberOfFiles, replaceSameName);


    // might be better to do a tertary deleting thing at the start idk what's better to be honest
    // tried out red for remove buttons but it looks really ugly
    const workToChangeNames = await AmountConfirmationInput(interaction, nestedConfirmationCollector, 
        deleting ? splitUpSubmittedAssignments : workToAdd.attachments.map(work => work.name), `Choose a choice of work that you want to ${deleting ? 'remove' : 'add'}, or all at once!`, 
        ButtonStyle.Primary, AddAllButtonDisabled)
    
    
    if(deleting) {
        for await (const submFile of await page.$$('div.fp-thumbnail')) {
            const submFileName = await submFile.evaluate((node) => node.querySelector('img').title);
            if(workToChangeNames.includes(submFileName)) {
                //* for some reason when a thing is deleted, sometimes it stays on the page unfortunately
                await submFile.click().catch();
                await DeleteFileFromPage(page);
                //if submfile wasn't removed, I'll have to do it myself ffs
                submFile.evaluate(file => {
                    if(file) file?.remove();
                })
                //remove it from chosen work, if it was on chosen work
                const chosenWorkIndex = chosenWork.map(work => work.name).indexOf(submFileName);
                //-1 if it doesn't exist
                if(chosenWorkIndex != -1) {
                    chosenWork.splice(chosenWorkIndex, 1)
                }
                // remove it from the submitted assignments thing (for display to user)
                splitUpSubmittedAssignments.splice(splitUpSubmittedAssignments.indexOf(submFileName), 1)
            }
        }

        // disabled if there isn't any work
        removeButton.setDisabled(!splitUpSubmittedAssignments.length)
    }
    else {
        for (const work of workToAdd.attachments) {
            if(workToChangeNames.includes(work.name)) {
                const alreadySubmittedFile = await page.$(`div.fp-thumbnail img[title="${work.name}"]`)
                
                //* deleting the old file, cause they are uploading a new one
                if(alreadySubmittedFile && replaceSameName) {
                    //await needed because this has to be done before the delete button is clicked
                    await alreadySubmittedFile.click().then(async () => {
                        //all the buttons are already loaded in the dom for some reason (before popup), so just click the delete, but waiting just in case
                        await DeleteFileFromPage(page)
                    }).catch();
                    // if not deleted from page fully
                    alreadySubmittedFile.evaluate(file => {
                        if(file) file?.remove();
                    })
                }
                else {
                    //add to the work information thing
                    chosenWork.push(work)
                    splitUpSubmittedAssignments.push(work.name)
                }
                await CreateTmpAndUpload(page, work)          
            }
        }

        // if they actually added work enable the remove button, otherwise leave how it was
        if(workToChangeNames.length > 0) removeButton?.setDisabled(false)
    }

    
    // for (const attc of chosenWork) {
    //     if(!workOnAssignInfo.value.includes(attc.name)) {
    //         workOnAssignInfo.value += `${workOnAssignInfo.value.length > 0 ? ', ' : ''}${attc.name}`;
    //     }
    // }

    const woaField = mainEmbed.data.fields.find(field => field.name == 'Current work on Assignment');
    if(woaField) woaField.value = splitUpSubmittedAssignments.length ? splitUpSubmittedAssignments.join(', ') : 'none';

    // doing greater than, just incase they added an extra one then they are supposed to!
    // const addingWorkDisabled = workOnAssignInfo.value.split(', ').length >= maxNumberOfFiles;
    // const addingWorkDisabled = splitUpSubmittedAssignments.length >= maxNumberOfFiles;
    // addWorkButton.setDisabled(workToAdd.length == 0 || CheckForMaxFilesIfAdding(workToAdd, splitUpSubmittedAssignments, maxNumberOfFiles));
    addWorkButton.setDisabled(workToAdd.length == 0 || splitUpSubmittedAssignments.length >= maxNumberOfFiles);
    //If shared work isn't already disabled change the disabled of this, 
    // if(!sharedWorkButton.data.disabled) sharedWorkButton.setDisabled(addingWorkDisabled);
    //If the shared work isn't fully disabled, they might be able to still add more work
    if(sharedWorkButton && !sharedWorkButton.data.fullyDisabled) sharedWorkButton.setDisabled(splitUpSubmittedAssignments.length >= maxNumberOfFiles);

    await interaction.editReply({ embeds: [mainEmbed], components: buttonRows})
}

//todo max is probably like three for btnChoices, so maybe account for that later
//returns array of the choices which are strings
const AmountConfirmationInput = async (interaction, nestedConfirmationCollector, btnChoices, message, btnStyle=ButtonStyle.Danger, allBtnDisabled=false, time=30000) => {
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const confirmationEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Confirmation')
        .setDescription(message)

        //? with this strategy All will appear, even when there is one option, I think it's fine because of consistancy
        const confirmationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('All')
                .setLabel('All')
                .setStyle(btnStyle)
                .setDisabled(allBtnDisabled),
            ...btnChoices.map(choiceName => {
                return new ButtonBuilder()
                    .setCustomId(choiceName)
                    .setLabel(choiceName)
                    .setStyle(btnStyle)
            })
        )

        const reply = await interaction.followUp({content: ' ', embeds:[confirmationEmbed], components:[confirmationRow], fetchReply: true})
        
        const filter = i => i.user.id === interaction.user.id;
        nestedConfirmationCollector.collector = await reply.createMessageComponentCollector({ filter, time });

        nestedConfirmationCollector.collector.on('collect', async (i) => {
            await i.deferUpdate();
            await nestedConfirmationCollector.collector.stop();
            if(i.customId == 'All') {
                //resolve every choice, so just return the choices!
                return resolve(btnChoices)
            }
            // only collecting on the reply itself, so it doesn't matter if I collect on else!
            else {
                return resolve([i.customId])
            }
            // else if(i.customId.) {
            //     return resolve(false)
            // }
        })
        
        nestedConfirmationCollector.collector.on('end', collected => {
            reply.delete();
            if(collected.size == 0) {
                // submitting ? interaction.deleteReply() : interaction.editReply({components: []})
                return resolve([]); //we finished the function
            }
        });

    })
}

const DeleteFileFromPage = async (page) => {
    await page.waitForSelector('button.fp-file-delete');
    await page.evaluate(() => document.querySelector('button.fp-file-delete').click());
    await page.waitForSelector('button.fp-dlg-butconfirm');
    await page.evaluate(() => document.querySelector('button.fp-dlg-butconfirm').click());
}

const CreateSubmitButtonsRow = (sharedWorkDisabled=false, addWorkDisabled=false, removeWorkDisabled=false, disableAll=false) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('Quit')
            .setLabel('Quit')
            .setDisabled(disableAll)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('Remove Work')
            .setLabel('Remove Work')
            .setDisabled(removeWorkDisabled)
            .setStyle(ButtonStyle.Danger), // clear removes files
        new ButtonBuilder()
            .setCustomId('Shared')
            .setLabel('Shared')
            .setDisabled(sharedWorkDisabled)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('Add Work')
            .setLabel('Add Work')
            .setDisabled(addWorkDisabled)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('Save')
            .setLabel('Save')
            .setDisabled(disableAll)
            .setStyle(ButtonStyle.Success),
    )
}

const GetWorkOnAssignment = async (page) => {
    return await page.evaluate(() => Array.from(document.querySelectorAll('div.fp-thumbnail img'), elem => elem.title));
}

function CheckForMaxFilesIfAdding(workToAdd, splitUpSubmittedAssignments, maxNumberOfFiles, replaceSameName) {
    return workToAdd.reduce((total, work) => {
        // if the name isn't in the submission already, then that is a new file so add it to the total
        if (!splitUpSubmittedAssignments.includes(work.name) || !replaceSameName) {
            total++;
        }
        return total;
    }, 0) + splitUpSubmittedAssignments.length > maxNumberOfFiles;
}

