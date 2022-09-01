const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder} = require('discord.js');
const { GetConfigs } = require("./configSlash");
const { primaryColour, MoodleCoinImgURL } = require("../util/variables");

const data = new SlashCommandBuilder()
	.setName('shop')
	.setDescription('Open up a shop were you can buy stuff with your moodle tokens!');

module.exports = {
    category: "config",
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        //classic defer reply cause you only get 3 seconds to respond :/
        await interaction.deferReply();

        //Display Embed showing info, and then a list of items
        // either have a button to to choose or select menu to choose stuff :/
        //maybe a select menu to choose the item to you want, e.g choose from 
        await CreateShopEmbed(interaction, config)
        //atfer it is finished you can do anything like **badges**
    }
}

const CreateShopEmbed = (interaction, userConfig, lastI) => {
    return new Promise(async (resolve, reject) => {
        // TODO add the thing to increment
        const shopItems = [
            //* current max Nicknames might wanna change that later, but 10 seems like an insane amount!
            { name: '$150 - Nickname Potion', incrementable: userConfig.maxNicknames, price: 150, enabled: userConfig.maxNicknames != 10, value: userConfig.maxNicknames == 10 ? 'Out of Stock! You are at Max nicknames! ' : `Get an extra nickname (currently you are allowed ${userConfig.maxNicknames})`},
            { name: '$1000 - Become vip!', price: 1000, enabled: !userConfig.vip, value: userConfig.vip ? 'Out of Stock! Thanks for being vip and supporting the bot!' : 'Get exclusive benefits like quiz (full) autofill for free, automatic message spam, name priority etc!'},
            //TODO implement the badge thing the badge thing { name: '$300 - Shop Badge', price: 300, enabled: userConfig.badges != 10, value: userConfig.maxNicknames == 10 ? 'Out of Stock! You are at Max nicknames! ' : `Get an extra nickname (currently you are allowed ${userConfig.maxNicknames})`},
            // { name: 'Cookies', value: 'Buy some cookies, just cause!'},
        ]
        const ShopOverviewEmbed = new EmbedBuilder()
            .setColor(primaryColour)
            .setTitle('Shop')
            .setThumbnail(MoodleCoinImgURL)
            //TODO add a banner image to the shop like the boom guy in a tavern with a bunch of moodle coins on the floor
            .setDescription(`Welcome To the Shop, here you can purchase upgrades and stuff\nAll purchases made are in Moodle Money`)
            .addFields(
                { name: 'Vip Status', value: `${userConfig.vip ? 'true :partying_face:' : 'false'}`, inline: true},
                { name: 'Moodle Money', value: `${userConfig.tokens}`, inline: true},
                ...shopItems.map((itemObj, index) => { return { name: itemObj.name, value: `${itemObj.value}` }}), //* adds the rest of the items
            );

        // const selectRow = new ActionRowBuilder()
        //     .addComponents(
        //         new SelectMenuBuilder()
        //             .setCustomId('select')
        //             .setPlaceholder('Nothing selected')
        //             .addOptions(shopItems.map((itemObj, index) => { return { label: itemObj.name, description: itemObj.value, value: index }; }))
        //     );

        // const moveRow = CreateMoveRow(shopItems[selectedItemIndex].name, selectedItemIndex == 0, selectedItemIndex == shopItems.length - 1)
        const purchaseComponents = CreatePurchaseComponents(shopItems, userConfig.tokens)
        // console.log(purchaseComponents)
        const promises = lastI ? [lastI.deferUpdate()] : []
        promises.push(interaction.editReply({content: ' ', embeds: [ShopOverviewEmbed], components: purchaseComponents }))
        await Promise.all(promises)

        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();
        //make sure that it is the right person using the buttons and select menus
        const filter = i => i.user.id === interaction.user.id;

        const collector = await channel.createMessageComponentCollector({ filter, time: 180 * 1000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate().catch(() => {}); // interaction acknowledge thing error
            if(i.customId == 'Vip Info') {
                await collector.stop();
                return resolve(await CreateVIPInfoEmbed(interaction, userConfig));
            }
            if(i.customId.includes('Become vip!')) {
                if(await SendConfirmationMessage(interaction, 'Are You sure you want to buy vip?')) {
                    await collector.stop();
                    userConfig.tokens -= shopItems.find(item => item.name.includes('Become vip')).price;
                    userConfig.vip = true;
                    await userConfig.save();
                    console.log(`${interaction.user.id} purchased vip!`)
                    return resolve(await CreateShopEmbed(interaction, userConfig))
                }
            }
            else if(i.customId.includes('Nickname Potion')) {
                if(await SendConfirmationMessage(interaction, 'Do you want to buy Nickname Potions')) {
                    await collector.stop();
                    userConfig.tokens -= shopItems.find(item => item.name.includes('Nickname Potion')).price;
                    userConfig.maxNicknames++;
                    await userConfig.save();
                    console.log(`${interaction.user.id} bought a nickname potion!`)
                    TemporaryResponse(interaction, 'Go to /config, to add your nickname!', 2500) 
                    return resolve(await CreateShopEmbed(interaction, userConfig))
                }
            }
            else if(i.customId == 'Quit') {
                await collector.stop();
                return resolve(await interaction.editReply({components: CreatePurchaseComponents(shopItems, userConfig.tokens, true)}));
            }
        })

        collector.on('end', async collected => {
            if(collected.size == 0) {
                return resolve(await interaction.editReply({components: CreatePurchaseComponents(shopItems, userConfig.tokens, true)}));
            }
        });
    });
}
const CreateVIPInfoEmbed = async (interaction, userConfig) => {
    //display the info, and then when the back button is clicked, take them back to the shop menu
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const vipInfoEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('vip / general info')
        .setDescription('vip is a reward for people that use the bot enough to afford it!')
        .addFields(
            { name: 'How do I get vip?', value: 'Run the /shop command and click on buy vip option'},
            { name: `I don't have enough money, how do I get it?`, value: `Moodle money can be gained through donations, dailyQuizzes, but the easiest way is to submit an assignment (not an all my own work one) and allow people to *borrow* your work, then they pay you! `},
            { name: 'Benefits to vip:', value: 'Below are the benefits'},
            { name: 'Quizzes', value: 'Autofill (all) for free'},
            { name: 'Nicknames', value: 'Get double the nicknames!'},
            { name: 'Rig Leaderboards!', value: 'You can change the amounts people have in leaderboards'},
            { name: 'Messages', value: 'go from 100 => 200 messages in spamming! Also send messages periodically automatically afterwards.'},
            { name: 'Server Roles', value: 'Get the vip server role, you get a coloured name and access to any vip only chats'},
        )
        .setFooter({text: `Some benefits may not be implemented yet, pull requests are welcome (school is busy rn)`})
        //TODO setThumbnail(<vip badge url on imgur>)

        const backButtonRow = CreateBackButton()

        const reply = await interaction.editReply({ content: ' ', embeds: [vipInfoEmbed], components: [backButtonRow], fetchReply: true })

        const filter = i => i.user.id === interaction.user.id;

        const collector = await reply.createMessageComponentCollector({ filter, max: 1, time: 180 * 1000})

        collector.on('collect', async (i) => {
            if(i.customId == 'back') {
                await i.deferUpdate();
                return resolve(await CreateShopEmbed(interaction, userConfig))
            }
        })

        collector.on('end', async collected => {
            if(collected.size == 0) {
                return resolve(await interaction.editReply({content: 'timed out', components: [CreateBackButton(true)]}))
            }
        });
    });

    function CreateBackButton(disabled=false) {
        return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back')
                .setLabel('back')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
        );
    }
}
const SendConfirmationMessage = async (interaction, message, time=15000) => {
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const confirmationEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Confirmation')
        .setDescription(message)

        const confirmationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('no')
                .setLabel('no')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('yes')
                .setLabel('yes')
                .setStyle(ButtonStyle.Success),
        );
        const reply = await interaction.followUp({content: ' ', embeds:[confirmationEmbed], components:[confirmationRow], fetchReply: true})
        
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();

        const filter = i => i.user.id === interaction.user.id;
        const collector = await channel.createMessageComponentCollector({ filter, time });

        collector.on('collect', async (i) => {
            if(i.customId == 'yes') {
                reply.delete()
                return resolve(true)
            }
            else if(i.customId == 'no') {
                reply.delete()
                return resolve(false)
            }
        })

        collector.on('end', collected => {
            if(collected.size == 0) {
                return resolve(false)
            }
        });
    })
}

const CreatePurchaseComponents = (items, userTokens, disableAll=false) => {
    //need a quit button, add the vip info thing to that row too
    const actionRows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('Quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disableAll),
            new ButtonBuilder()
                .setCustomId('Vip Info')
                .setLabel('Vip / General Info')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableAll),
        )
    ]
    let actionRowIndex = 0
    return items.reduce((actionRows, currentItem, currentIndex) => {
        //3 buttons per row, if you want less or more change that value
        // const actionRowIndex = Math.ceil(currentIndex / 3) + 1; // + 1 because quit and vip info are in the first row
        if(currentIndex % 3 == 0) {
            actionRows.push(new ActionRowBuilder);
            actionRowIndex++;
        }
        const nameWithoutCost = currentItem.price ? currentItem.name.split(' - ')[1] : currentItem.name
        actionRows[actionRowIndex].addComponents(
            new ButtonBuilder()
                .setCustomId(nameWithoutCost)
                .setLabel(nameWithoutCost) // if price doesn't exist it defaults to null, which makes the statement false cause it is free
                .setStyle(currentItem.price > userTokens ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled((disableAll || currentItem.price > userTokens || !currentItem.enabled) ?? false),
        );
        return actionRows
    }, actionRows)
}

const TemporaryResponse = async (interaction, message, time=1000) => {
    const reply = await interaction.followUp({content: message, fetchReply: true})
    setTimeout(() => reply.delete(), time);
}
