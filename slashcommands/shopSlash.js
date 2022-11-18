const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder} = require('discord.js');
const { GetConfigs } = require("./configSlash");
const { primaryColour, MoodleCoinImgURL } = require("../util/constants");

const data = new SlashCommandBuilder()
	.setName('shop')
	.setDescription('Open up a shop were you can buy stuff with your moodle tokens!');

// icons are just discord emojis that appear before a persons name
// if you have custom discord emojis you can actually use them!
//TODO add the ultimate badge... with this power than can have any icon that they put as a string or whatever, like they send in an emoji and boom
// the good thing about having the name thing is that if you want to change something like vip emoji you don't have to change its name, but apart from that :/
//* I could link up badges to icons, once you get the badge, you can equip the icon, maybe differnet section 
const icons = [ 
    { name: 'vip', emoji: ':shield:', noPurchase: true }, // could call it purchaseable and set to false but using booleans this way is better imo
    { name: 'party', emoji: ':partying_face:', price: 0 }, // they can get this one for free if they bother to look at icons
    { name: 'salute', emoji: ':saluting_face:', price: 50 },
    { name: 'skull', emoji: ':skull:', price: 100 },
    { name: 'foot', emoji: ':foot:', price: 200 },
    { name: 'fire', emoji: ':fire:', price: 500 },
    
]

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

//TODO sell icons that people can have next to their name for the leaderboards (special one will only be allowed for vip)
const CreateShopEmbed = (interaction, userConfig, lastI) => {
    return new Promise(async (resolve, reject) => {
        // TODO add the thing to increment
        const shopItems = [
            //* current max Nicknames might wanna change that later, but 10 seems like an insane amount!
            { name: '$150 - Nickname Potion', incrementable: userConfig.maxNicknames, price: 150, disabled: userConfig.maxNicknames >= 10, value: userConfig.maxNicknames == 10 ? 'Out of Stock! You are at Max nicknames! ' : `Get an extra nickname (currently you are allowed ${userConfig.maxNicknames})`},
            { name: '$1000 - Become vip!', price: 1000, disabled: userConfig.vip, value: userConfig.vip ? 'Out of Stock! Thanks for being vip and supporting the bot!' : 'Get exclusive benefits like quiz (full) autofill for free, automatic message spam, name priority etc!'},
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
                { name: 'Icon', value: `${userConfig.icon || 'none'}`, inline: true},
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
        const purchaseComponents = CreatePurchaseComponents(shopItems, userConfig)
        // console.log(purchaseComponents)
        const promises = lastI ? [lastI.deferUpdate()] : []
        promises.push(interaction.editReply({content: ' ', embeds: [ShopOverviewEmbed], components: purchaseComponents, fetchReply: true }))
        const returnedPromises = await Promise.all(promises)
        // getting the reply to collect, if both last I was added length is 2, we only want the reply
        const reply = returnedPromises.length == 2 ? returnedPromises[1] : returnedPromises[0]
        //make sure that it is the right person using the buttons and select menus
        const filter = i => i.user.id === interaction.user.id;

        const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate().catch(() => {}); // interaction acknowledge thing error
            if(i.customId == 'Vip Info') {
                await collector.stop();
                return resolve(await CreateVIPInfoEmbed(interaction, userConfig));
            }
            if(i.customId == 'Icons') {
                await collector.stop();
                return resolve(await CreateIconEmbed(interaction, userConfig));
            }
            if(i.customId.includes('Become vip!')) {
                if(await SendConfirmationMessage(interaction, 'Are You sure you want to buy vip?')) {
                    await collector.stop();
                    userConfig.tokens -= shopItems.find(item => item.name.includes('Become vip')).price;
                    userConfig.vip = true;
                    //give them whatever the vip icon is
                    userConfig.icons.push('vip')
                    //if they don't have an icon, they can use the vip one!
                    if(userConfig.icon == null) userConfig.icon = icons.find(ic => ic.name == 'vip').emoji;
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
                return resolve(await interaction.editReply({components: CreatePurchaseComponents(shopItems, userConfig, true)}));
            }
        })

        collector.on('end', async collected => {
            if(collected.size == 0) {
                return resolve(await interaction.editReply({components: CreatePurchaseComponents(shopItems, userConfig, true)}));
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

}
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

const CreateIconEmbed = async (interaction, userConfig, lastI) => {
    //display the info, and then when the back button is clicked, take them back to the shop menu
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const iconEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Icon Stuff')
        .setDescription(`Purchase Icons and once purchased, you can equip them any time you want just by running /shop again\nCurrently equipped icon: ${userConfig.icon}`)
        .setFooter({text: `I haven't implemented a custom icon yet but it should be possible, feel free to PR on github`})

        // const iconRows = [ //back button and then also other stu3ff on next linesCreatePurchaseComponents(icons, userConfig.tokens, false, false) ]

        const iconRows =  [ CreateBackButton(false), ...CreatePurchaseComponents(icons, userConfig, false, true)]

        if(lastI) lastI.deferUpdate();
        const reply = await interaction.editReply({ content: ' ', embeds: [iconEmbed], components: iconRows, fetchReply: true })

        const filter = i => i.user.id === interaction.user.id;

        const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000})

        let stoppedOnPurpose = false;
        collector.on('collect', async (i) => {
            if(i.customId == 'back') {
                await i.deferUpdate();
                stoppedOnPurpose = true;
                collector.stop();
                return resolve(await CreateShopEmbed(interaction, userConfig))
            }
            else {
                await i.deferUpdate()
                //if the user has already purchased the icon just equip it
                const iconWanted = icons.find(ic => ic.name == i.customId);
                if(userConfig.icons.includes(i.customId)) {
                    userConfig.icon = iconWanted.emoji == userConfig.icon ? null : iconWanted.emoji;
                }
                else {
                    if(iconWanted.price == 0 || await SendConfirmationMessage(interaction, `Do you want to buy the icon ${iconWanted.emoji} (${iconWanted.name}) for (${iconWanted.price})`)) {
                        userConfig.tokens -= iconWanted.price;
                        interaction.followUp({ content: ` You purchased the icon ${iconWanted.name} congratulations! it has been equipped! :partying_face:`, ephemeral: true})
                        userConfig.icons.push(iconWanted.name)
                        userConfig.icon = iconWanted.emoji

                    }
                    // if nothing changed at all leave early
                    else {
                        return;
                    }
                }
                await userConfig.save();
                stoppedOnPurpose = true;
                collector.stop()
                return resolve(await CreateIconEmbed(interaction, userConfig))
            }
        })

        collector.on('end', async collected => {
            // if it timed out just return this
            if(!stoppedOnPurpose) {
                return resolve(await interaction.editReply({content: 'timed out', components: [CreateBackButton(true), ...CreatePurchaseComponents(icons, userConfig, true, true)]}))
            }
        });
    });

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
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = await reply.createMessageComponentCollector({ filter, time });

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

const CreatePurchaseComponents = (items, userConfig, disableAll=false, iconButtons=false) => {
    //need a quit button, add the vip info thing to that row too
    const actionRows = !iconButtons ? [
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
            new ButtonBuilder()
                .setCustomId('Icons')
                .setLabel('Icons')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll),
        )
    ] : [ new ActionRowBuilder]
    let actionRowIndex = 0
    return items.reduce((actionRows, currentItem, currentIndex) => {
        //3 buttons per row, if you want less or more change that value
        // const actionRowIndex = Math.ceil(currentIndex / 3) + 1; // + 1 because quit and vip info are in the first row
        if(currentIndex % 3 == 0 && !(iconButtons && currentIndex == 0)) {
            actionRows.push(new ActionRowBuilder);
            actionRowIndex++;
        }
        // if icon buttons it's actually gonna be the name **with** the cost
        const nameWithoutCost = iconButtons ? `${currentItem.emoji} (${currentItem.name})${userConfig.icons.includes(currentItem.name) || currentItem.price == null || currentItem.price == 0 ? '' : ` - $${currentItem.price}`}` : currentItem.price != null ? currentItem.name.split(' - ')[1] : currentItem.name
        actionRows[actionRowIndex].addComponents(
            new ButtonBuilder()
                .setCustomId(iconButtons ? currentItem.name : nameWithoutCost)
                .setLabel(nameWithoutCost) // if price doesn't exist it defaults to null, which makes the statement false cause it is free
                // if doing this for icons then make it green if they already bought it
                .setStyle((iconButtons && userConfig.icons.includes(currentItem.name)) ? ButtonStyle.Success : currentItem.price > userConfig.tokens ? ButtonStyle.Secondary : ButtonStyle.Primary)
                // if its vip, but they have the icon, they should be able to equip it
                .setDisabled(((currentItem.noPurchase && iconButtons && !userConfig.icons.includes(currentItem.name)) || disableAll || currentItem.price > userConfig.tokens || currentItem.disabled) ?? false),
        );
        return actionRows
    }, actionRows)
}

const TemporaryResponse = async (interaction, message, time=1000) => {
    const reply = await interaction.followUp({content: message, fetchReply: true})
    setTimeout(() => reply.delete(), time);
}
