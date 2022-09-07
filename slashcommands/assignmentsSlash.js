const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder, SelectMenuBuilder } = require('discord.js');
const { GetSelectMenuOverflowActionRows, LoginToMoodle, AskForCourse, mainStaticUrl, loginGroups } = require("../util/functions")
const { primaryColour } = require("../util/variables");
const { ConvertName } = require('./configSlash')

//TODO fix error with too many assignments showing up if bad name is passed (it breaks the program)
//TODO create groups, so one is for getting assignments, another for submitting assignments
//TODO submit command where you have optional stuff to parse
//TODO give huge warning when they want to submit nothing
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
                option.setName('work')
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
        await LoginToMoodle(page, config?.settings.general.LimitLogins ? undefined : interaction.user.id)

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
                
                await AddAndWaitForMoreSelect(interaction, page, config, Object.entries(filteredAssignments).map(([label, data]) => { return { label, url: data.link, description: 'more info on assignment'}}));
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
                if((!people.some(correctPerson => correctPerson.toLowerCase().includes(personName)) && !filtering) || 
                (filtering && assignment.toLowerCase().includes(personName.toLowerCase()))){
                    // missingAssignments[termName].push(`[${assignment}](${link})`);
                    missingAssignments[termName].push({name: assignment, link});
                }
            }
        }
    }
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
        //* if submissions then assignments is really linkAndPeople
        let [termName, assignments] = term;
        //won't work because the second one will be the only one that matters
        AddToMsgString(assignments.people ?? assignments, termName)
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
                msgString += `${assignment.name ? `[${assignment.name}](${assignment.link})` : assignment}\n`;
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

const GetFullAssignmentInfo = async (page) => {
    //visable is not needed probably, but can be passed as an option, just in case (I've had problems with this one)
    await page.waitForSelector('div[role="main"] a.comment-link span', {
        visible: true,
    })
   
    // if there is more than 1 comment, click the comments and return true
    const commentsFound = await page.evaluate(() => {
        // the span can be used as a link
        const spanLink = document.querySelector('div[role="main"] a.comment-link span')
        // get only the number from the comment
        const moreThanOneComment = Number(spanLink.textContent.replace('Comments (', '').replace(')', '')) > 0
        if(moreThanOneComment) spanLink.click();
        return moreThanOneComment
    })
    
    if(commentsFound) {
        //* wait for the comments to load
        await page.waitForSelector('div[role="main"] ul div.text_to_html')
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

const AddAndWaitForMoreSelect = async (interaction, page, config, assignmentOptions) => {
    return new Promise(async (resolve, reject) => {
        //edit the interaction to add the select menu embed that gives them the choice of having more info of the assignment 
        // when the select menu used, chose the assignment, hopefully still have the page, and then get the info for the assignment 
        //go to the url from the selected assignment, then pass in the page
        selectMenuPage = 0;
        const placeholder = 'Choose a quiz for more info about it'
        // const selectOptions = assignments.map(assignment => { return { label: assignment.name, value: assignment.link, description: 'Assignment to get more info on'}})
        //opleOptions = guildMembers.map(member => { return { label: `${member?.nickname ?? member.user.username}`, value: `${member.id}`, description:`They currently hold $${allConfigs.find(uConfig => uConfig.discordId == member.id)?.tokens || defaultTokens}` } });
        const reply = await interaction.editReply({content: ' ', components: GetSelectMenuOverflowActionRows(selectMenuPage, assignmentOptions, placeholder), fetchReply: true})
        const filter = i => i.user.id === interaction.user.id;
        //TODO extend collector when they click next idk, 20 seconds to choose from big list? having the page still open seems expensive though
        collector = await reply.createMessageComponentCollector({ filter, time: 20 * 1000 });

        // get them to choose a recipient
        collector.on('collect', async (i) => {
            await i.deferUpdate();
            if(i.customId == 'select') {
                await collector.stop();
                //go to the url
                await Promise.all([page.goto(i.values[0]), page.waitForNavigation({ waitUntil: 'networkidle2' })])
                return resolve(await DisplayFullInfo(interaction, await GetFullAssignmentInfo(page), config))
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
                //just remove the components because they didn't want to see any more info
                interaction.editReply({components: []})
                return resolve(); //we finished the function
            }
        });
    });
}

const DisplayFullInfo = async (interaction, info, config) => {
    //TODO if title too long add it to the start of the description, if description is too long add it to the fields
    // fields too long add to a second embed
    const assignmentEmbed = new EmbedBuilder()
    .setColor(primaryColour)
    .setTitle(info.title.length <= 256 ? info.title : info.title.slice(0, 255))
    .setDescription(info.title.length <= 256 ? info.description : `**${info.title.slice(256)}**\n${info.description}`);

    // if they are logged into the website themself, limit logins uses the owner for this function so thats why the check is here
    if(!config.settings.general.LimitLogins && loginGroups.hasOwnProperty(interaction.user.id)) {
        assignmentEmbed.addFields(...info.submissionData);
    }
    else {
        assignmentEmbed.addFields({ name: 'Submission and Comments', value: 'to see submission stuff and comments you must be logged in with limit logins off'})
    }

    if(info.attachments.length > 0) {
        assignmentEmbed.addFields({name: 'Attachments', value: info.attachments.map(atc => `[${atc.title}](${atc.url})`).join('\n')})
    }

    // .setThumbnail() IDK maybe there is an image on the website :/
    await interaction.editReply({ embeds: [assignmentEmbed], components: []})
}