const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, CategoryChannel, ComponentBuilder} = require('discord.js');
const { primaryColour } = require("../util/constants");
const { GetConfigById, statsInfo } = require("./configSlash")

const data = new SlashCommandBuilder()
	.setName('stats')
	.setDescription('View your statistics like commands ran, creation date, donations, recieved, etc.')
    .addUserOption(option => 
        option
            .setName('person')
            .setDescription('OPTIONAL!!! Select a different person to view their stats instead of yours!')
        )

module.exports = {
    category: 'config',
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        await interaction.deferReply()
        const otherPerson = await interaction.options.getUser('person');
        if(otherPerson?.bot) return interaction.editReply(`Bot's don't have moodle stats!`)
        if(otherPerson) config = GetConfigById(otherPerson.id);

        // just display the stats!
        return await CreateStatDisplayEmbed(interaction, otherPerson ?? interaction.user, config)
    }
}

const CreateStatDisplayEmbed = async (interaction, user, config) => {
    if(config == null) return await interaction.editReply(`The user <@${user.id}> doesn't have a config, meaning they have no stats!`);

    //TODO if there are more than 25 stats than make part 2 stuff, but for now it isn't needed
    const statEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle(`Statistic view for ${user.username}`)
        .setDescription('These statistics are stored in MongoDB and can always be updated to have more stuff, feel free to PR on github!')
        .setThumbnail(user.displayAvatarURL())
        .addFields(Object.entries(config.stats).map(([name, statValue]) => {
            return {
                name,
                value: `info: ${statsInfo[name].info}\n\nValue: ${statValue}\n`
            }
        }))

    await interaction.editReply({ embeds: [statEmbed]})
}