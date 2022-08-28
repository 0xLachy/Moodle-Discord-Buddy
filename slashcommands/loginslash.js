// const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions");
const { CreateOrUpdateConfig } = require("./configSlash")

//TODO have an option to parse in cookies instead of password, or even provide a custom link that gets the cookies
//* There is a link that works, but it is only with web services enabled unfortunately
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
    category: "authorisation",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {
        // if(interaction.inGuild()){
        //     let channel = await interaction.user.createDM(); 
        //     await channel.send('Login here, not in the Guild')
        //     await interaction.reply({content: "Only login through DMS", ephemeral: true})
        //     return;
        // }
        // const channel = await interaction.user.createDM();

        await interaction.deferReply({ephemeral: true});
        if (UtilFunctions.loginGroups.hasOwnProperty(interaction.user.id)) {
            return interaction.editReply('Your Discord Id is already associated with a logged in account, use /logout to logout')
            
            // quit the login process early
            // return await channel.send('Your Discord Id is already associated with a logged in account, use /logout to logout');
        }
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
            const loginEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle(`Your discord ID (${interaction.user.id}) is now associated with the moodle account: ${loggedInName}`)
            .setDescription('When a command is run the bot will check the discord ID of the user and unencrypt and log in as you instead of the bot owners credentials, giving you access to more commands')
            .setThumbnail(await page.evaluate(() => document.querySelector('#usermenu > img').src))
            
            // await channel.send({ embeds: [loginEmbed] })
            await interaction.editReply({embeds:[loginEmbed]});
            
            await CreateOrUpdateConfig({name: loggedInName.toLowerCase(), discordId: interaction.user.id})
            await browser.close();

            //if there is an error, tell them what went wrong
        }).catch(async (reason) => {
            console.log(reason);
            // await channel.send({content: reason})
            await interaction.editReply({content: reason});
            await browser.close();
        })
    }
}



