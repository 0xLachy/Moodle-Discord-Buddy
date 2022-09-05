const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder} = require('discord.js');
const { GetConfigById } = require("./configSlash")
const { primaryColour } = require("../util/variables");

//PUT THE BADGES HERE, URL is the icon for the badge (reccomended)
//* need the info for nested objects because thats how it checks
const badgeInfo = {
    quizzes: {
        info: 'Get these badges by completing quizzes (without autofill)',
        dutiful: { description: 'completed 10 daily quizzes', test: 10, url: 'TODO'},
        dedicated: { description: 'Completed 50 daily quizzes!', test: 50, url: 'TODO'},
        devout: { description: 'Completed 100 daily quizzes', test: 100, url: 'TODO'},
        devoted: { description: 'Completed 365 daily quizzes!', test: 365, url: 'TODO'},
    },
    vip: { description: 'Part of vip group', url: 'VIP BADGE URL' },
    elder: { description: 'Account older than 6 months!', url: 'Meh'},
    shop: { 
        info: 'Badges that you bought from the shop',
        collector: { description: 'Spend moodle money just to get a badge??', url: 'Something fancy'},
        opportunist: { description: 'Limited time badge, sometimes put in the shop'},
    }
}

const CheckForNewBadges = async (config) => {
    const stats = config.stats;
    const newBadges = []
    // if they aren't an elder yet
    if(!config.badges.includes('elder')) {
        //Check that it has been at least 6 months
        const d = new Date(); // today date
        d.setMonth(d.getMonth() - 6);  //subtract 6 month from current date 
        if(stats.CreationDate < d) {
            config.badges.push('elder')
            newBadges.push('elder')
        }
    }

    if(!config.badges.includes('vip')) {
        if(config.vip) {
            config.badges.push('vip')
            newBadges.push('vip')
        }
    }

    for (const quizBadgeName of Object.keys(badgeInfo.quizzes)) {
        if(quizBadgeName != 'info' && !config.badges.includes(quizBadgeName)) {
            if(stats.DailyQuizzesCompleted >= badgeInfo.quizzes[quizBadgeName].test) {
                config.badges.push(quizBadgeName)
                newBadges.push(quizBadgeName)
            }
        }
    }

    if(newBadges.length > 0) {
        await config.save();
    }
    return newBadges;
}

//TODO add an option to view all people with <badgeName> 
//TODO add a see all button to see all the badges that you can possibly get
const data = new SlashCommandBuilder()
	.setName('badges')
	.setDescription('View your badges or somebody elses')
    .addUserOption(option => 
        option
            .setName('target')
            .setDescription('The person who you want to check')
    );

module.exports = {
    category: "config",
    permissions: [],
    idLinked: false,
    devOnly: false,
    CheckForNewBadges,
    ...data.toJSON(),
    run: async (client, interaction, config) => {
        await interaction.deferReply();
        
        const target = await interaction.options.getUser('target');
        if(target && target?.id != interaction.user.id) {
            const targetConfig = GetConfigById(target.id)
            if(targetConfig) {
                DisplayBadgeOverviewEmbed(interaction, targetConfig, target)
            }
            else {
                return await interaction.editReply(`The user ${target} doesn't have a config file yet, so they have no badges!`) 
            }
            //get badge by id, if not found interaction.dity reply telling them that the person couldn't be found
        } 
        else {
            DisplayBadgeOverviewEmbed(interaction, config)
        }
    }
}

const DisplayBadgeOverviewEmbed = async (interaction, config, target, displayAll=false) => {
    const badgeOverviewEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle(displayAll ? `All available badges` : `Badges for ${config.name ?? target?.username ?? config.nicknames[0]}`)
        .setThumbnail(target ? target.displayAvatarURL() : interaction.user.displayAvatarURL())
        .setDescription('Get badges through purchasing them through the shop or getting the right stats.')
        .addFields(
            //! if there are more than 25 categories it gets an error (shouldn't really ever be an issue though)
            Object.entries(badgeInfo).map(([badgeCategory, badgeData]) => {
                if(badgeData?.info) {
                    //* there can't be an 'info' badge name
                    if(!displayAll && !Object.keys(badgeData).some(name => config.badges.includes(name))) return undefined;
                    //it's nested so have to do more stuff
                    return { name: `${badgeCategory}:`, value: Object.entries(badgeData).filter(([n, obj]) => typeof obj != 'string' && (displayAll || config.badges.includes(n))).map(([n, obj]) => `**${n}**\n　${obj.description}`).join('\n')}
                }
                else {
                    if(!displayAll && !config.badges.includes(badgeCategory)) return;
                    return { name: badgeCategory, value: badgeData.description}
                }
            }).filter(n=>n)
            // { name: 'Vip Status', value: `${userConfig.vip ? 'true :partying_face:' : 'false'}`, inline: true},
        );
    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('BackBadge') // doesn't matter
                .setLabel(displayAll ? 'back' : 'more info')
                .setStyle(ButtonStyle.Secondary) // red back 
        );

    const reply = await interaction.editReply({ embeds: [badgeOverviewEmbed], components: [buttonRow] })

    const filter = i => i.user.id === interaction.user.id;
    // create collector to handle when button is clicked using the reply
    const collector = await reply.createMessageComponentCollector({ filter, max: 1, time: 30000 });

    collector.on('collect', async (i) => {
        i.deferUpdate();
        return await DisplayBadgeOverviewEmbed(interaction, config, target, !displayAll)
    })
    collector.on('end', collected => {
        if (collected.size == 0) {
            // If they ran out of time just remove the back button
            interaction.editReply({ components: [] });
        }
    });
}
