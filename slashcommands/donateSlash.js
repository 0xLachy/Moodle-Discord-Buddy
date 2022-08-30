const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder} = require('discord.js');
const UtilFunctions = require("../util/functions");
const { CreateOrUpdateConfig, GetConfigById, GetConfigs, GetDefaults } = require("./configSlash")

//* You actually can put in any valid id for the user id, which means it can be sent from dms
const data = new SlashCommandBuilder()
	.setName('donate')
	.setDescription('Donate Moodle Money to other people!')
    .addUserOption(option => 
        option
            .setName('recipient')
            .setDescription('Select a user to get the moodle money')
        )
    .addIntegerOption(option => 
        option
            .setName('amount')
            .setDescription('Amount you want to donate to person')
            .setMinValue(1)
    )

module.exports = {
    category: 'config',
    permissions: [],
    idLinked: false,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction, config) => {
        let recipient = await interaction.options.getUser('recipient');
        //TODO if amount if greater than amount they can give warn them, you don't have enough money for that
        let amount = await interaction.options.getInteger('amount')
        // make sure the person isn't a bot
        if(!recipient && !interaction.inGuild()) {
            return interaction.reply('if you are using dms, get the users id and use that as recipient role')
        }
        else if(recipient?.id == interaction.user.id) {
            return interaction.reply('You can\'t donate to yourself!')
        }
        else if(recipient?.bot) {
            return interaction.reply('You can\'t donate to a bot!')
        }
        
        if(!recipient || !amount) {
            await interaction.deferReply();
            return await PromptForDonation(interaction, config, recipient, amount)
        }
        else {

        }

        //* call function to remove money and stuff
        //Maybe you can even donate vip then??? 
        interaction.reply('no code yet :P')
        //TODO if they don't pass in an amount or user, show the embed menu that shop slash has, migrate it over here
        //TODO check they don't donate it to a bot
        // await UtilFunctions.SendConfirmationMessage(`${amount} out of your config.tokens, will be taken out to leave you with config.tokens - amount, they will then have theircnfig.tokens)
    }
}
const PromptForDonation = (interaction, userConfig, recipient, amount) => {
    return new Promise(async (resolve, reject) => {
        //if amount is null
        amount ??= userConfig.settings?.shop?.DonationAmount ?? 25;
        //TODO make a donation embed top banner
        //TODO make a badge for donating over 50 tt/mm to someone
        // also add to the stats thing
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();

        const filter = i => i.user.id === interaction.user.id;
        const collector = await channel.createMessageComponentCollector({ filter, time: 180 * 1000 });



        const donationEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
        .setTitle('Donation Menu')
        .setDescription('Choose a person in the guild to donate your Moodle Money to!\nReset to set it to 0, change default donation amount in config.\nWhenever a button is clicked, adds that amount to donation amount')

        
        if(!recipient) {
            const guildMembers = await interaction.guild.members.fetch();
            const allConfigs = GetConfigs();
            const defaultTokens = GetDefaults().tokens.default;
            const userSelectMenu = new ActionRowBuilder()
            .addComponents(
                new SelectMenuBuilder()
                .setCustomId('select')
                .setPlaceholder('Choose person to donate to')
                //! over 25 people can't be displayed, have left and right buttons for this case!!!! also filter out bots
                .addOptions(guildMembers.map(member => { return { label: `${member?.nickname ?? member.name}`, value: `${member.id}`, description:`They currently hold $${allConfigs.find(uConfig => uConfig.discordId == member.id)?.tokens || defaultTokens}` } }))
            );
            
            await interaction.editReply({content: ' ', embeds:[donationEmbed], components:[userSelectMenu]})
            // get them to choose a recipient
            collector.on('collect', async (i) => {
                if(i.customId == 'select') {
                    await i.deferUpdate();
                    await collector.stop();
                    return resolve(await PromptForDonation(interaction, userConfig, guildMembers.find(member => member.id == i.values[0]), amount))
                }
            })
        }
        else {
            const recipientConfig =  GetConfigById(recipient.id) ?? CreateOrUpdateConfig({ discordId: recipient.id, nicknames: [ recipient?.nickname, recipient.username ].filter(name => name != undefined).map(name => name.toLowerCase())});
            donationEmbed.setThumbnail(recipient.displayAvatarURL())
            donationEmbed.addFields(
                { name: `You are Donating to ${recipientConfig?.name ?? ''}`, value: `<@${recipient.id}>: $${recipientConfig.tokens} => $${recipientConfig.tokens + amount}\n<@${interaction.user.id}>: $${userConfig.tokens} => $${userConfig.tokens - amount}`},
                { name: `Amount ${amount}`, value: 'Change the amount by clicking the buttons below, once you are ready to donate to the person click confirm'},
            )
            const donateAmounts = [ 1, 5, 25, 50, 100, 300, 1000 ]
            const incrementButtons = SplayButtonsToActionRow(donateAmounts)
            const confirmationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('cancel')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('confirm')
                    .setLabel('confirm')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(amount == 0 || amount > userConfig.tokens)
            )
            await interaction.editReply({content: ' ', embeds:[donationEmbed], components:[...incrementButtons, confirmationRow]})

            collector.on('collect', async (i) => {
                await i.deferUpdate().catch(() => {})
                if(i.customId == 'reset') {
                    amount = 0
                    await collector.stop();
                    return resolve(await PromptForDonation(interaction, userConfig, recipient, amount));
                }
                else if(i.customId == 'confirm') {
                    await collector.stop();
                    return resolve(await FinaliseAndDisplayDonation(interaction, userConfig, recipient, recipientConfig, amount));
                    // reply.delete()
                    // return resolve(true)
                    //* finalise the purchase
                }
                else if(i.customId == 'cancel') {
                    await collector.stop();
                    //TODO make it a bit nicer
                    return resolve(await interaction.editReply({ content: 'Cancelled Donation :(', embeds: [], components: []}));
                    // reply.delete()
                    // return resolve(false)
                    //* disable all the buttons idk
                }
                else if(!isNaN(i.customId)) {
                    //it means the custom id is a number, so just increment that :D
                    amount += Number(i.customId);
                    await collector.stop();
                    return resolve(await PromptForDonation(interaction, userConfig, recipient, amount))
                }
            })
        }
        // tell them that they have timed out
        collector.on('end', collected => {
            if(collected.size == 0) {
                console.log(`${interaction.user.name} timed out on donating!`)
                return interaction.editReply({content: 'Timed out!!', components: []})
            }
        });
    });        

}

const FinaliseAndDisplayDonation = async (interaction, userConfig, recipient, recipientConfig, amount) => {
    //making sure it is a number, just in case javascript stuff :P
    amount = Number(amount);
    recipientConfig.tokens += amount;
    recipientConfig.stats.TokensRecieved += amount;
    userConfig.tokens -= amount;
    userConfig.stats.TokensDonated += amount;
    await recipientConfig.save();
    await userConfig.save();
    const donationDoneEmbed = new EmbedBuilder()
    .setColor(UtilFunctions.primaryColour)
    .setTitle('Donation Successful!')
    .setDescription(`Congrats <@${recipient.id}> you now have $${recipientConfig.tokens} Moodle Money :partying_face:!\n<@${userConfig.discordId}> donated $${amount} and now has $${userConfig.tokens} Moodle Money left`)
    .setThumbnail(recipient.displayAvatarURL())
    // .setFooter({ text: `<@${userConfig.discordId}> has $${userConfig.tokens} Moodle Money left`})

    await interaction.editReply({ content: ' ', embeds: [donationDoneEmbed], components: []})
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
