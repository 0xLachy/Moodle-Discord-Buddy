
const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { MessageEmbed, MessageActionRow, MessageButton, Util } = require('discord.js');
const UtilFunctions = require("../util/functions");
// const wait = require('node:timers/promises').setTimeout;

//INFO:
/*
    Add info about this script here
*/

//TODO implement code for the role options
//.setRequired(true));
const data = new SlashCommandBuilder()
	.setName('moodleprofile')
	.setDescription('Slash command to handle moodle users, to get their profile data')
    .addStringOption(option =>
        option
            .setName('name-or-id')
            .setDescription("If there are 2 people with the name, also use last name")
            .setRequired(true)
    )
    // .addSubcommand(subcommand =>
	// 	subcommand /*person cause they can be the teacher too*/
	// 		.setName('info')
	// 		.setDescription('Get A persons interests, bio, profile pic, courses etc (need to be in the same course)')
    //         .addStringOption(option =>
    //             option
    //                 .setName('name-or-id')
    //                 .setDescription("If there are 2 people with the name, also use last name")
    //                 .setRequired(true)
    //         )
    // )
    // .addSubcommand(subcommand =>
    //     subcommand
    //         .setName('message')
    //         .setDescription('Message a user, you need to be logged in')
    //         .addStringOption(option =>
    //             option
    //                 .setName('recipientname-or-id')
    //                 .setDescription("If there are 2 people with the name, also use last name")
    //                 .setRequired(true)
    //         )
    //         .addStringOption(option =>
    //             option
    //                 .setName('message-text')
    //                 .setDescription("Send something like 'hello', you can use html, like <p color=red>hi</p>")
    //                 .setRequired(true)
    //         )
    // )

module.exports = {
    category: "utility",
    usage: "first /login in DM's with the bot if you want to message someone (or if you are in a different course to the bot owner)", 
    permissions: [],
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {
        await interaction.deferReply(/*{ephemeral: true}*/);

        // const browser = await puppeteer.launch({ headless: false })
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        //console.log(UtilFunctions.GetTermURLS("participants")[courseIDIndex])

        //log into the browser using url from functions, (only one in participants so 0 to get it)
        await UtilFunctions.LoginToMoodle(page, interaction.user.id)
        // console.log(await UtilFunctions.GetCourseUrls(page))
        let chosenTerm = await UtilFunctions.AskForCourse(interaction, page).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            interaction.deleteReply();
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })
        if(chosenTerm == null) return;
        // if it isn't an array with 2 values, it isn't the term data, update this if more term data
        // if(chosenTerm.length != 2) return;
        // console.log(testingThing)
        let inputNameOrId = interaction.options.getString("name-or-id")
        interaction.editReply({ content: `Going to the url ${chosenTerm.URL} to get ${inputNameOrId}'s info!`, embeds: []})
        // if it isn't a number then the person needs to be found
        if(isNaN(inputNameOrId)){
            // use zero because it returns an array for no reason
            await page.goto(await UtilFunctions.GetTermURLS("participants", chosenTerm.ID)[0])
            let userUrl = await getUserUrl(page, inputNameOrId)
            if(userUrl == null) {
                // If no username found, I should say that and then quit
                await interaction.editReply({content: "No Person Found", embeds: []})
                browser.close()
                return;
            }
            await page.goto(userUrl)
        }
        else {
            try {//&course=897https://moodle.oeclism.catholic.edu.au/user/view.php?id=3092&course=897
                await page.goto(`${UtilFunctions.mainStaticUrl}user/view.php?id=${inputNameOrId}course=${chosenTerm.ID}`)
            } catch (error) {
                console.log("Webpage doesn't exist in moodleprofile script ScrapeProfileData the url needs to be changed")
            }
            // https://moodle.oeclism.catholic.edu.au/user/profile.php?id=3062
        }
        SendProfileToDiscord(interaction, await ScrapeProfileData(page))
        browser.close()
        // switch (interaction.options.getSubcommand()) {
        //     case "info":
        //         let realInputName = await interaction.options.getString("name-or-id")
        //         //check if it is number or not int.tryparse or something
        //         //Getting name (which is required) and converting it from nickname, also converts to lower case
        //         let inputName = await UtilFunctions.NicknameToRealName(realInputName);
        //         break;
        //     case "message":
        //         //DO A CHECK FOR DISCORD ID IF THEY ARE LOGGED IN, IF THEY ARENT REGECT THEM
        //         let recipientName = await interaction.options.getString("recipientname-or-id");
        //         //DO the check for Id again, make function for this
        //         let moodleMessageToSend = await interaction.options.getString("message-text");


        //         break;
        //     default:
        //         interaction.editReply(`Something went wrong with ${interaction.options.getSubcommand()}`)
        //         break;
        // }
        // SendEmbedsToDiscord(interaction);
        // browser.close();
    }
}
//Maybe add this to main functions so that it can be changed easier
const ScrapeProfileData = async (page) => {
    // interaction.editReply("MADE IT TO THE SCRAPING STAGE")
    await page.waitForSelector('section > ul > li.contentnode.interests')
    await page.waitForSelector('img.userpicture')
    await page.waitForSelector('#coursedetails')
    let profileDataObject = await page.evaluate(() => {
        let tmpDataObject = {}
        tmpDataObject.fullName = document.querySelector('[class="contentnode fullname"]').querySelector('span').textContent //works :D
        //#adaptable-message-user-button
        tmpDataObject.userId = document.querySelector('#adaptable-message-user-button').getAttribute('data-userid')
        tmpDataObject.email = document.querySelector('[class="contentnode email"]').querySelector('span').textContent //email link can use this mailto:someone@yoursite.com?subject=Mail from Our Site
        // console.log(document.querySelectorAll('section > ul > li.contentnode.interests > dl > dd > div > ul > li > a'))//#adaptable-tab-aboutme > section > ul > li.contentnode.interests
        tmpDataObject.interests = Array.from(document.querySelectorAll('section > ul > li.contentnode.interests > dl > dd > div > ul > li > a'), interest => interest.textContent)//?.map(interest => `[${interest.textContent.trim()}](${interest.href})`)
        if(tmpDataObject.fullName == "Harrison Baird") tmpDataObject.interests.push("\n**Men without shirts on**,\n**Watching men kiss**,\n**My Little Pony**")
        tmpDataObject.description = document.querySelector('section > ul > li.contentnode.description > dl > dd').textContent //TODO get the image urls and include them
        tmpDataObject.profilePic = document.querySelector('li.adaptableuserpicture > a > img.userpicture').src //#adaptable_profile_tree > div.ucol1.col-md-4 > div > div > section > ul > li.adaptableuserpicture > a > img

        tmpDataObject.courses = Array.from(document.querySelectorAll('section > ul > li.contentnode.courseprofiles > dl > dd > ul > li'), course => course.textContent)//]?.map(course => course.textContent)
        tmpDataObject.roles = Array.from(document.querySelectorAll('section > ul > li.contentnode.roles > dl > dd > a'), role => role.textContent)//]?.map(role => role.textContent)

        tmpDataObject.lastAccess = document.querySelector('section > ul > li.contentnode.lastaccess > dl > dd').textContent
        tmpDataObject.miscellaneous = Array.from(document.querySelectorAll('section.node_category.miscellaneous > ul > li > * > a'), miscItem => `[${miscItem.textContent}](${miscItem.href})`) //#adaptable-tab-more > div > div.col-12.miscellaneous > section > ul > li:nth-child(1) > span > a
        return tmpDataObject
    })
    profileDataObject.profileUrl = page.url()
    // await page.waitForSelector('section > ul > li.contentnode.courseprofiles > dl > dd > ul > li')
    // await page.waitForSelector('section > ul > li.contentnode.roles > dl > dd > a')
    // profileDataObject = await page.evaluate((dataObject) => {

    //     return dataObject
    // }, profileDataObject)
    // page.click()
    // console.log(await profileDataObject)
    return profileDataObject;
}
const getUserUrl = async (page, inputName) => {
    return await page.evaluate((cleanedName) => {
        let tableRows = document.querySelectorAll('tr[id*="user-index-participant"]');
        console.log(cleanedName)
        for (trElem of tableRows){
            // Gets table data elems from rows, then assigns the name to the other data of row, and add profile pic lastly
            // tdElems = trElem.querySelectorAll("td");
            let personNodes = trElem.querySelectorAll("a")
            for (person of personNodes){
                // console.log(person.textContent)
                if (person.textContent.toLowerCase().includes(cleanedName)) return person.href
            }
            //console.log(personNode)
            // if (personNode.textContent.includes(UtilFunctions.NicknameToRealName(inputName))) return personNode.href
            // peopleObj[trElem.querySelector("a").textContent] =  [...Array.prototype.map.call(tdElems, function(t) { return t.textContent; }), trElem.querySelector("a > img").src]//.push(trElem.querySelector("a > img").src);
            //arrOfEveryone.push([trElem.querySelector("a").textContent, ...Array.prototype.map.call(tdElems, function(t) { return t.textContent; }), trElem.querySelector("a > img").src])//.push(trElem.querySelector("a > img").src);
        }
        //if it failed return null
        return null;
    }, await UtilFunctions.NicknameToRealName(inputName))
}

    //Not async because send message to discord, but maybe it can be?
const SendProfileToDiscord = (interaction, profileDataObject) => {
    let profileEmbed = new MessageEmbed()
    .setColor(UtilFunctions.primaryColour)
    .setTitle(`${profileDataObject.fullName} (${profileDataObject.userId})`)
    .setURL(profileDataObject.profileUrl) // replace this with their url
    .setDescription(profileDataObject.description)
    .setThumbnail(profileDataObject.profilePic)
    //mailto dosen't make it an actual link :/
    // .addField("Email", `[${profileDataObject.email}](mailto:${profileDataObject.email}?subject=Hello, I was sent from the discord bot!)`)
    .addField("Email", profileDataObject.email)
    .addField("Interests", profileDataObject.interests.length != 0 ? profileDataObject.interests.join(", ") : "none")
    .addField("Courses", profileDataObject.courses.length != 0 ? profileDataObject.courses.join(", ") : "none? :confused:")
    .addField("Roles", profileDataObject.roles.length != 0 ? profileDataObject.roles.join(", ") : "No Roles")
    .addField('Last Access', profileDataObject.lastAccess)
    .addField("Miscellaneous", profileDataObject.miscellaneous.join(", ")) // should always have these
    //footer doesn't allow linked text
    // .setFooter({ text: profileDataObject.miscellaneous.join(",")/*, iconURL: 'https://i.imgur.com/AfFp7pu.png'*/ }) // change icon

    //TODO find a way to make the content empty (leaving it out just leaves old text, and blank string gives error)
    interaction.editReply({content: " ", embeds: [profileEmbed]})
}