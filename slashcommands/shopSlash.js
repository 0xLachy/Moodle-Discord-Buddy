const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder} = require('discord.js');
const { GetConfigs } = require("./configSlash");
const UtilFunctions = require("../util/functions");

const data = new SlashCommandBuilder()
	.setName('shop')
	.setDescription('Open up a shop were you can buy stuff with your moodle tokens!');

module.exports = {
    category: "authorisation",
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
            { name: 'Donation', enabled: interaction.inGuild(), value: interaction.inGuild() ? 'Donate to another person in the server' : 'You must be in a server to donate to others'}
            // { name: 'Cookies', value: 'Buy some cookies, just cause!'},
        ]
        const ShopOverviewEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle('Shop')
            //TODO set thumbnail to Moodlecoin logo .setThumbnail(interaction.user.displayAvatarURL())
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
            if(i.customId.includes('Donation')) {
                await collector.stop()
                return resolve(await PromptForDonation(interaction, userConfig))
            }
            else if(i.customId == 'Vip Info') {
               //TODO open new embed thing with info and have just a back button 
            }
            if(i.customId.includes('Become vip!')) {
                if(await SendConfirmationMessage(interaction, 'Are You sure you want to buy vip?')) {
                    userConfig.tokens -= shopItems.find(item => item.name.includes('Become vip')).price;
                    userConfig.vip = true;
                    await userConfig.save();
                    console.log(`${interaction.user.id} purchased vip!`)
                    return resolve(await CreateShopEmbed(interaction, userConfig))
                }
            }
            else if(i.customId.includes('Nickname Potion')) {
                if(await SendConfirmationMessage(interaction, 'Do you want to buy ')) {
                    userConfig.tokens -= shopItems.find(item => item.name.includes('Nickname Potion')).price;
                    userConfig.vip = true;
                    await userConfig.save();
                    console.log(`${interaction.user.id} b!`)
                    return resolve(await CreateShopEmbed(interaction, userConfig))
                }
            }
            else if(i.customId == 'Quit') {
                await collector.Stop();
                await interaction.editReply({components: CreatePurchaseComponents(shopItems, userConfig.tokens, true)})
            }
            // else if(shopItems.some(item => item.includes(i.customId))) {
            //     if(await SendConfirmationMessage(interaction, `Are You sure you want to buy ${i.customId}?`)) {
            //         userConfig.tokens -= shopItems.find(item => item.name.includes(i.customId)).price;
            //         //WON"T WORK BECAUSE it doesn't know what to do when you purchase
            //         userConfig.vip = true;
            //         await userConfig.save();
            //         console.log(`${interaction.user.id} purchased vip!`)
            //         return resolve(await CreateShopEmbed(interaction, userConfig))
            //     }
            // }
            // else {
            //     await interaction.followUp(`You haven't coded for the item ${i.customId}`)
            // }
        })

        // function SendComfirmationMessage
    });
}
const SendConfirmationMessage = async (interaction, message, time=30000) => {
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const confirmationEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
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

    })
}

const PromptForDonation = (interaction, userConfig) => {
    return new Promise(async (resolve, reject) => {
        let donationAmount = userConfig.settings?.shop?.DonationAmount ?? 25;
        //TODO make a donation embed top banner
        //TODO make a badge for donating over 50 tt/mm to someone
        // also add to the stats thing
        const donationEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
        .setTitle('Donation Menu')
        .setDescription('Choose a person in the guild to donate your Moodle Money to!\nReset to set it to 0, change default donation amount in config.\nWhenever a button is clicked, adds that amount to donation amount')
        //TODO maybe the donate amounts can use percentage of your token amount so you can donate 50, 100, 200, 300, 50%, 75% 100% of your money
        // actually maybe buttons would be nicer, donate 1, 5, 50, 100, 150, 300, 500, 1000. reset, and it keeps adding up
        // in the select view you see the person, their moodle name I guess and their moodle money, if their config file doesn't exist say 200, and create config on donation
        const guildMembers = await interaction.guild.members.fetch();
        const guildMembersWithConfig = GetConfigs().filter(cachedConfig => cachedConfig.discordId != interaction.user.id && guildMembers.some(user => user.id == cachedConfig.discordId));
        //! IF THEY CLICK IT A SECOND TIME IT CREATES 2, then 3, etc!
        if(guildMembersWithConfig.length == 0) {
            //display temp message saying there is nobody to donate to, then return back to screen
            TemporaryResponse(interaction, 'There is nobody else in the guild who has a config set up!!!', 5000)
            return resolve(await CreateShopEmbed(interaction, userConfig))
        }
        const userSelectMenu = new ActionRowBuilder().addComponents(
            new SelectMenuBuilder()
                .setCustomId('select')
                .setPlaceholder('Choose person to donate to')
                .addOptions(guildMembersWithConfig.map(memberConfig => { return { label: `<@${memberConfig.discordId}>${memberConfig.name ? `(${memberConfig.name})` : ''}`, value: `${memberConfig.discordId}`, description:`They currently hold $${memberConfig.tokens}` } }))
        )
        const donateAmounts = [ 1, 5, 25, 50, 100, 300, 1000 ]
        const incrementButtons = SplayButtonsToActionRow(donateAmounts)
        // const incrementButtonsRow1 = new ActionRowBuilder()
        // .addComponents(
        //     new ButtonBuilder()
        //     .setCustomId('reset')
        //     .setLabel('reset')
        //     .setStyle(ButtonStyle.Danger),
        //     ...donateAmounts.split().map(amount => new ButtonBuilder().setCustomId(amount.toString()).setLabel(amount.toString()).setStyle(ButtonStyle.Primary))
        // );
        await interaction.followUp({content: ' ', embeds:[donationEmbed], components:[userSelectMenu, ...incrementButtons]})
        
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();

        const filter = i => i.user.id === interaction.user.id;
        const collector = await channel.createMessageComponentCollector({ filter, time: 180 * 1000 });

        collector.on('collect', async (i) => {
            if(i.customId == 'reset') {
                //reset the amount input they are about to send
            }
            else if(i.customId == 'select') {
                //if input amount == 0 then tell them oi, you need more than 0 to donate
                console.log(i.values[0])
            }
            else if(!isNaN(i.customId)) {
                //it means the custom id is a number, so just increment that :D
            }
            if(i.customId == 'yes') {
                reply.delete()
                return resolve(true)
            }
            else if(i.customId == 'no') {
                reply.delete()
                return resolve(false)
            }
        })

    })
}
const SplayButtonsToActionRow = (numbersArr) => {
    const firstRow = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('reset')
                .setLabel('reset')
                .setStyle(ButtonStyle.Danger)
        )
    ]
    let actionRowIndex = 0
    return numbersArr.reduce((actionRows, amount) => {
        //3 buttons per row, if you want less or more change that value
        // const actionRowIndex = Math.ceil(currentIndex / 3) + 1; // + 1 because quit and vip info are in the first row
        if(actionRows[actionRowIndex].components.length % 5 == 0) {
            actionRows.push(new ActionRowBuilder);
            actionRowIndex++;
        }
        actionRows[actionRowIndex].addComponents(
            new ButtonBuilder()
                .setCustomId(amount.toString())
                .setLabel(amount.toString()) 
                .setStyle(ButtonStyle.Primary)
        );
        return actionRows
    }, firstRow)
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
                .setLabel('Vip Info')
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

const CreateMoveRow = async (middleButtonName, disableBack=false, disableNext=false, disableRest=false) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('Quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disableRest),
            new ButtonBuilder()
                .setCustomId('Back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disableBack),
            new ButtonBuilder()
                .setCustomId(middleButtonName)
                .setLabel(middleButtonName)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableRest),
            new ButtonBuilder()
                .setCustomId('Next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableNext),
        ) 
    ;
}