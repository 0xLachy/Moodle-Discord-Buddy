
const { SlashCommandBuilder } = require('@discordjs/builders');
const UtilFunctions = require("../util/functions");


const data = new SlashCommandBuilder()
	.setName('logout')
	.setDescription('logout of the discord bot moodle sign in');

module.exports = {
    category: "logout",
    permissions: [],
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {

        await interaction.deferReply();
        UtilFunctions.LogoutOfMoodle(interaction.user.id)
        interaction.editReply("If you were logged in, you have been logged out")
    }
}



