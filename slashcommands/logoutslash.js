const { SlashCommandBuilder } = require('@discordjs/builders');
const UtilFunctions = require("../util/functions");


const data = new SlashCommandBuilder()
	.setName('logout')
	.setDescription('logout of the discord bot moodle sign in');

module.exports = {
    category: "authorisation",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {
        //defering because it might take some time to log you out, also I should return something like a name or a error saying you weren't logged in
        await interaction.deferReply();
        await UtilFunctions.LogoutOfMoodle(interaction)
    }
}



