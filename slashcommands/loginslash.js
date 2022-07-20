const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { MessageEmbed } = require('discord.js');
const UtilFunctions = require("../util/functions");




//TODO have an option to parse in cookies instead of password, or even provide a custom link that gets the cookies
const data = new SlashCommandBuilder()
	.setName('login')
	.setDescription('Login to moodle so you can message people and do other stuff')
    .addStringOption(option => 
        option
            .setName('username')
            .setDescription('username you use to login to moodle')
            .setRequired(true)
    )
    .addStringOption(option => 
        option
            .setName('password')
            .setDescription('password you use to login to moodle')
            .setRequired(true)
    )

module.exports = {
    category: "login",
    permissions: [],
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {

        await interaction.deferReply();
        // const browser = await puppeteer.launch({ headless: false })
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        let loginDetails = {}
        loginDetails["username"] = await interaction.options.getString('username');
        loginDetails["password"] = await interaction.options.getString('password');
        //log into the browser todo find a better way to do this
        await UtilFunctions.LoginToMoodle(page, await interaction.user.id, undefined, loginDetails).then(async (result) => {
            // console.log(result);
            loggedInName = await page.evaluate(() => document.querySelector('#usermenu > span').textContent)
            const loginEmbed = new MessageEmbed()
	            .setColor(UtilFunctions.primaryColour)
	            .setTitle(`Your discord ID (${interaction.user.id}) is now associated with moodle account ${loggedInName}`)
	            .setDescription('When a command is run the bot will check the discord ID of the user and unencrypt and log in as you instead of the bot owners credentials, giving you access to more commands')
	            .setThumbnail(await page.evaluate(() => document.querySelector('#usermenu > img').src))
	// .addFields(
	// 	{ name: 'Regular field title', value: 'Some value here' },
	// 	{ name: '\u200B', value: '\u200B' },
	// 	{ name: 'Inline field title', value: 'Some value here', inline: true },
	// 	{ name: 'Inline field title', value: 'Some value here', inline: true },
	// )
	// .addField('Inline field title', 'Some value here', true)


            await interaction.editReply({embeds:[loginEmbed]});
            //TODO use the page to get their full name and do fullname => discordname (userid)
            await browser.close();
            //ADD TO LOGIN PEOPLE
        }).catch(reason => {
            console.log(reason);
            interaction.editReply({content: reason});
            browser.close();
        })
        // console.log("got past retrn")
        //TODO if I add a logged in role, in logged out I would have to remove that
    }
}



