const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder, resolveColor} = require('discord.js');
const { GetConfigById, GetConfigs } = require("./configSlash")
const { GetSelectMenuOverflowActionRows } = require("../util/functions");
const { primaryColour } = require("../util/constants");

//PUT THE BADGES HERE, URL is the icon for the badge (reccomended)
//* need the info for nested objects because thats how it checks
const badgeInfo = {
    quizzes: {
        info: 'Get these badges by completing quizzes (without autofill)',
        dutiful: { description: 'Completed 10 daily quizzes', test: 10, url: 'TODO'},
        dedicated: { description: 'Completed 50 daily quizzes!', test: 50, url: 'TODO'},
        devout: { description: 'Completed 100 daily quizzes', test: 100, url: 'TODO'},
        devoted: { description: 'Completed 365 daily quizzes!', test: 365, url: 'TODO'},
    },
    vip: { description: 'Part of vip group', url: 'VIP BADGE URL' },
    elder: { description: 'Account older than 6 months!', url: 'Meh'},
    donations: {
        info: 'Badges from donating and recieving donations from others. Run /donate to try get some of these!',
        likeable: { description: 'People donated $250 (or more) to you!', url: 'TODO'},
        kind: { description: 'Donated $30 moodle money to people', test: 30, url: 'TODO'},
        generous: { description: 'Donated at least $100', test: 100, url: 'TODO'},
        charitable: { description: 'Donated at least $250', test: 250, url: 'TODO'},
        simp: { description: 'Donated at least $1000', test: 1000, url: 'TODO'},
    },
    shop: { 
        info: 'Badges that you bought from the shop',
        collector: { description: 'Spend moodle money just to get a badge??', url: 'Something fancy'},
        opportunist: { description: 'Limited time badge, sometimes put in the shop', url: 'TODO'},
    },
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
            AddBadge('elder')
        }
    }

    if(!config.badges.includes('vip') && config.vip) {
        AddBadge('vip')
    }

    //quiz section
    for (const quizBadgeName of Object.keys(badgeInfo.quizzes)) {
        if(quizBadgeName != 'info' && !config.badges.includes(quizBadgeName)) {
            if(stats.DailyQuizzesCompleted >= badgeInfo.quizzes[quizBadgeName].test) {
                AddBadge(quizBadgeName)
            }
        }
    }

    //donation section
    if(!config.badges.includes('likeable') && stats.TokensRecieved > 250) {
        AddBadge('likeable')
    }
    for (const quizBadgeName of Object.keys(badgeInfo.donations)) {
        if(quizBadgeName == 'info' || quizBadgeName == 'likeable') continue;
        
        if(!config.badges.includes(quizBadgeName)) {
            if(stats.TokensDonated >= badgeInfo.donations[quizBadgeName].test) {
                AddBadge(quizBadgeName)
            }
        }
    }

    // only have to save once this way
    if(newBadges.length > 0) {
        await config.save();
    }
    return newBadges;

    function AddBadge(badgeName) {
        config.badges.push(badgeName)
        newBadges.push(badgeName)
    }
}

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

const DisplayBadgeOverviewEmbed = async (interaction, config, target, displayAll=false, pageNum=0) => {
    const badgeOverviewEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle(displayAll ? `All available badges` : `Badges for ${config.name ?? target?.username ?? (config.nicknames.length > 0 ? config.nicknames[0] : null) ?? config.discordId}`)
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
    
    const componentRows = []
    const buttonRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId('BackBadge') // doesn't matter
            .setLabel(displayAll ? 'back' : 'more info')
            .setStyle(ButtonStyle.Secondary) // red back 
    );
    componentRows.push(buttonRow)
    if(displayAll) {
            // peopleOptions = guildMembers.map(member => { return { label: `${member?.nickname ?? member.user.username}`, value: `${member.id}`, description:`They currently hold $${allConfigs.find(uConfig => uConfig.discordId == member.id)?.tokens || defaultTokens}` } });
        const badgeOptions = Object.entries(badgeInfo).map(([topLevelName, topLevelData]) => {
            //this means that it has no children but also needs to have info :/
            if(!topLevelData?.info) {
                return { label: topLevelName, value: topLevelName, description: 'badge to choose'}
            }
            else {
                return Object.entries(topLevelData).map(([lowerLevelBadge, lowerLevelData]) => {
                    if(lowerLevelBadge != 'info') {
                        return { label: lowerLevelBadge, value: lowerLevelBadge, description: 'badge to choose'}
                    }
                }).filter(b=>b)
            }
        }).flat()
        componentRows.push(...GetSelectMenuOverflowActionRows(pageNum, badgeOptions, 'Choose a badge to find other people that have it!'))
    }
    

    const reply = await interaction.editReply({ embeds: [badgeOverviewEmbed], components: componentRows })

    const filter = i => i.user.id === interaction.user.id;
    // create collector to handle when button is clicked using the reply
    const collector = await reply.createMessageComponentCollector({ filter, max: 1, time: 30000 });

    collector.on('collect', async (i) => {
        i.deferUpdate();
        if(i.customId == 'select') {
            await collector.stop();
            return await DisplayPeopleWithBadge(interaction, i.values[0])
        }
        else if(i.customId == 'next_page') {
            pageNum++;
            await interaction.editReply({ components: [ buttonRow, ...GetSelectMenuOverflowActionRows(page, peopleOptions, 'Choose a person to donate to!') ]})
        }
        else if(i.customId == 'previous_page') {
            pageNum--;
            await interaction.editReply({ components: [ buttonRow, ...GetSelectMenuOverflowActionRows(page, peopleOptions, 'Choose a person to donate to!') ]})
        }
        else {
            return await DisplayBadgeOverviewEmbed(interaction, config, target, !displayAll)
        }
    })
    collector.on('end', collected => {
        if (collected.size == 0) {
            // If they ran out of time just remove the back button
            interaction.editReply({ components: [] });
        }
    });
}

const DisplayPeopleWithBadge = async (interaction, badgeName) => {
    const peopleWithBadges = GetConfigs().filter(config => config.badges.includes(badgeName))
    const badgeOverviewEmbed = new EmbedBuilder()
    .setColor(primaryColour)
    .setTitle(`People with the badge ${badgeName}`)
    // .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription('Get badges through purchasing them through the shop or getting the right stats.')
    // .addFields({name: 'People:', value: peopleWithBadges.map(person => person.name ?? person.nicknames[0] ?? `<@${person.discordId}>`).join('\n') || 'Nobody with badge!'})
    // yeah this is better this way
    .addFields({name: 'People:', value: peopleWithBadges.map(person => `<@${person.discordId}>`).join('\n') || 'Nobody with badge!'})
        
    await interaction.editReply({content: '', embeds: [badgeOverviewEmbed], components: []})
}
