
const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, Util } = require('discord.js');
const UtilFunctions = require("../util/functions");
const { primaryColour } = require("../util/constants");
// const wait = require('node:timers/promises').setTimeout;

//INFO:
/*
    Add info about this script here
*/

//TODO implement code for editing moodle profile
// so that would mean there would be find and edit subcommands
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
    .addBooleanOption(option =>
        option
            .setName('context')
            .setDescription("View the persons profile with course id context (default is true)")
            .setRequired(false)
    )
    


module.exports = {
    category: "utility",
    usage: "first /login in DM's with the bot if you want to message someone (or if you are in a different course to the bot owner)", 
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        await interaction.deferReply(/*{ephemeral: true}*/);

        // const browser = await puppeteer.launch({ headless: false })
        const browser = await UtilFunctions.BrowserWithCache();
        const page = await browser.newPage();
        //console.log(UtilFunctions.GetTermURLS("participants")[courseIDIndex])

        //Login to moodle and catch any errors that occur
        await UtilFunctions.LoginToMoodle(page, config?.settings.general.LimitLogins ? undefined : await interaction.user.id).catch(reason => {
            console.log(reason);
            interaction.editReply({content: reason});
            browser.close();
        })

        // nullish operator assigns true to it if it is null by default
        const courseContext = await interaction.options.getBoolean('context') ?? true;
        const nameOrId = await interaction.options.getString('name-or-id');

        //outer scope so it can be used later
        let chosenTerm = null;
        //If it needs course context
        if(courseContext || isNaN(nameOrId)) {
            //Get the term to use as context id (IT is needed unfortunately)
            chosenTerm = await UtilFunctions.AskForCourse(interaction, page).catch(reason => {
                //If no button was pressed, then just quit
                console.log(reason)
                // interaction.editReply({content: reason, embeds: []})
                browser.close()
                return null;
            })
            
            if(chosenTerm == null) return await interaction.deleteReply();
        }
        //Get their id
        let userProfileID = await UtilFunctions.NameToID(interaction, page, nameOrId, chosenTerm)
        if (userProfileID == null) { 
            await interaction.editReply('Recipient ID could not be found')
            await browser.close(); 
            return;
        };
        try {
            let urlString = `${UtilFunctions.mainStaticUrl}/user/view.php?id=${userProfileID}`
            if(courseContext) urlString += `&course=${chosenTerm.ID}`
            await page.goto(urlString)
        } catch (error) {
            console.log("Webpage doesn't exist in moodleprofile script ScrapeProfileData the url needs to be changed")
        }


        SendProfileToDiscord(interaction, await ScrapeProfileData(page))
        await browser.close()
    }
}

const WaitForUserDetailsOrError = (page) => {
    return new Promise((resolve, reject) => {
        //It's a race to see what loads first lol
        page.waitForSelector('section > ul > li.contentnode.interests').then(() => { resolve(true); return; }).catch(() => { resolve(false); return; })
        page.waitForSelector('#region-main > div > div.box.errorbox.alert.alert-danger').then(() => { resolve(false); return; }).catch(() => { resolve(false); return; }) //RJECTING cause user not found
    })
}
//Maybe add this to main functions so that it can be changed easier
const ScrapeProfileData = async (page) => {
    // interaction.editReply("MADE IT TO THE SCRAPING STAGE")
    let interestsLoaded = await WaitForUserDetailsOrError(page)
    //If they didn't load return null
    if (!interestsLoaded) return null;
    await page.waitForSelector('img.userpicture')
    await page.waitForSelector('#coursedetails')
    let profileDataObject = await page.evaluate(() => {
        let tmpDataObject = {}
        //if the name is not accessable, undefined
        tmpDataObject.fullName = document.querySelector('[class="contentnode fullname"]')?.querySelector('span').textContent //works :D
        //#adaptable-message-user-button
        tmpDataObject.userId = document.querySelector('#adaptable-message-user-button').getAttribute('data-userid')
        //if not accessable, undefined
        tmpDataObject.email = document.querySelector('[class="contentnode email"]')?.querySelector('span').textContent //email link can use this mailto:someone@yoursite.com?subject=Mail from Our Site
        // console.log(document.querySelectorAll('section > ul > li.contentnode.interests > dl > dd > div > ul > li > a'))//#adaptable-tab-aboutme > section > ul > li.contentnode.interests
        tmpDataObject.interests = Array.from(document.querySelectorAll('section > ul > li.contentnode.interests > dl > dd > div > ul > li > a'), interest => interest.textContent)//?.map(interest => `[${interest.textContent.trim()}](${interest.href})`)
        if(tmpDataObject.fullName == "Harrison Baird") tmpDataObject.interests.push("\n**Men without shirts on**,\n**Watching men kiss**,\n**My Little Pony**")
        tmpDataObject.description = document.querySelector('section > ul > li.contentnode.description > dl > dd').textContent //TODO get the image urls and include them
        
        tmpDataObject.profilePic = document.querySelector('li.adaptableuserpicture > a > img.userpicture').src 

        tmpDataObject.courses = Array.from(document.querySelectorAll('section > ul > li.contentnode.courseprofiles > dl > dd > ul > li'), course => course.textContent)//]?.map(course => course.textContent)
        tmpDataObject.roles = Array.from(document.querySelectorAll('section > ul > li.contentnode.roles > dl > dd > a'), role => role.textContent)//]?.map(role => role.textContent)

        tmpDataObject.lastAccess = document.querySelector('section > ul > li.contentnode.lastaccess > dl > dd').textContent
        tmpDataObject.miscellaneous = Array.from(document.querySelectorAll('section.node_category.miscellaneous > ul > li > * > a'), miscItem => `[${miscItem.textContent}](${miscItem.href})`) //#adaptable-tab-more > div > div.col-12.miscellaneous > section > ul > li:nth-child(1) > span > a
        return tmpDataObject
    })
    profileDataObject.profileUrl = page.url()

    return profileDataObject;
}
    //Not async because send message to discord, but maybe it can be?
const SendProfileToDiscord = (interaction, profileDataObject) => {
    if (profileDataObject == null) {
        interaction.editReply("Content Couldn't be loaded, you may not have access to this user, are you sure you chose the right person?")
    }
    let profileEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle(`${profileDataObject.fullName || ''} (${profileDataObject.userId})`.trim())
        .setURL(profileDataObject.profileUrl) // replace this with their url
        .setDescription(profileDataObject.description)
        .setThumbnail(profileDataObject.profilePic)
        .addFields(
            { name: 'Email', value: profileDataObject.email || 'ʰ̶̳͎̔̄ⁱ̷͉̲̠̈́̽ᵈ̵̼͖͝ᵈ̵̥͙͎͒ᵉ̸̯̖̈́̒͜ⁿ̷̢͚̦͐̉'},
            { name: 'Interests', value: profileDataObject.interests.length != 0 ? profileDataObject.interests.join(", ") : "none" },
            { name: 'Courses', value: profileDataObject.courses.length != 0 ? profileDataObject.courses.join(', ') : 'none? :confused:', inline: true },
            { name: 'Roles', value: profileDataObject.roles.length != 0 ? profileDataObject.roles.join(', ') : 'No Roles', inline: true },
            { name: 'last Access', value: profileDataObject.lastAccess, inline: true },
            { name: 'Miscellaneous', value: profileDataObject.miscellaneous.join(', ') },
            )
        //.addField("Email", profileDataObject.email)
        //.addField("Interests", profileDataObject.interests.length != 0 ? profileDataObject.interests.join(", ") : "none")
        //.addField("Courses", profileDataObject.courses.length != 0 ? profileDataObject.courses.join(", ") : "none? :confused:")
        //.addField("Roles", profileDataObject.roles.length != 0 ? profileDataObject.roles.join(", ") : "No Roles")
        //.addField('Last Access', profileDataObject.lastAccess)
        //.addField("Miscellaneous", profileDataObject.miscellaneous.join(", ")) // should always have these
    //footer doesn't allow linked text
    // .setFooter({ text: profileDataObject.miscellaneous.join(",")/*, iconURL: 'https://i.imgur.com/AfFp7pu.png'*/ }) // change icon

    interaction.editReply({content: " ", embeds: [profileEmbed]})
}