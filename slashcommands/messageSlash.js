//when user logs in add their user id to the perms to this command and the edit profile command
const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const superagent = require('superagent').agent();
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } = require('discord.js');
// const { EmbedBuilder, Util, ButtonBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions");
const { primaryColour } = require("../util/constants");
require("dotenv").config()


const data = new SlashCommandBuilder()
	.setName('message')
	.setDescription('Send or Read Messages to users on moodle, you need to be logged in for this function')
    // .setDefaultMemberPermissions(0) //admin can still use
    .addSubcommand(subcommand =>
		subcommand
			.setName('send')
			.setDescription('Send a message to a user')
            .addStringOption(option => 
                option
                    .setName('name-or-id') 
                    .setDescription('Name or Id of person you want to message (if same name > 1 then use last name)')
                    .setRequired(true)
            )
            .addStringOption(option => 
                option
                    .setName('message')
                    .setDescription('Send normal text or you could send html like <p style="color: green;">green text</p>')
                    .setRequired(true) // when I add the attachment option, don't make this required
            )
            .addIntegerOption(option =>
                option
                    .setName('times')
                    .setDescription('send heaps of messages to the person, min 1, max is 100!')
            )
    )
	.addSubcommand(subcommand =>
		subcommand
			.setName('read')
			.setDescription('Read the messages from a user')
            .addStringOption(option => 
                option
                    .setName('name-or-id')
                    .setDescription('Name or Id of person you want to message (if same name > 1 then use last name)')
                    .setRequired(true)
            )
            .addBooleanOption(option => 
                option
                    .setName('received')
                    .setDescription('Show recieved messages from person (default is true)')
                    .setRequired(false)
            )
            .addBooleanOption(option => 
                option
                    .setName('sent')
                    .setDescription('Show messages you sent to the person (default is false)')
                    .setRequired(false)
            )
            //TODO also make sure there aren't too many messages
    )


module.exports = {
    category: "utility",
    permissions: [],
    idLinked: true,
    devOnly: false,
    ...data.toJSON(),
    run: async (client, interaction, config) => {
        //https://moodle.oeclism.catholic.edu.au/lib/ajax/service.php?sesskey=YZhK6oSvAI&info=core_message_send_messages_to_conversation
//        [
//     {
//         "index": 0,
//         "methodname": "core_message_send_messages_to_conversation",
//         "args": {
//             "conversationid": 329,
//             "messages": [
//                 {
//                     "text": "DONKEYDONKEY"
//                 }
//             ]
//         }
//     }
// ]
        //normal, cause 3 seconds isn't fast enough
        // return await loginToMoodleReq(interaction.options.getInteger('times'), interaction.options.getString('message'));
        await interaction.deferReply({ephemeral: config?.settings.messages.Ephemeral ?? false});
        // const browser = await puppeteer.launch({ headless: false }) //slowMo:100
        const browser = await UtilFunctions.BrowserWithCache();
        const page = await browser.newPage();
        //log into the browser todo find a better way to do this
        let failedToLogin = false
        //don't do the owner login here because it's messaging people
        await UtilFunctions.LoginToMoodle(page, config).catch(reason => {
            console.log(reason);
            interaction.editReply({content: 'Failed to login to moodle'});
            failedToLogin = true;
            browser.close();
        })
        if(failedToLogin) return;
        
        let recipientID = await UtilFunctions.NameToID(interaction, page, interaction.options.getString('name-or-id'))
        if (recipientID == null) { 
            await interaction.editReply('Recipient ID could not be found')
            await browser.close(); 
            return;
        };
        await page.goto(`${UtilFunctions.mainStaticUrl}/message/index.php?id=${recipientID}`)

        let userHeaderFound = await WaitForUserNameOrError(page)
        // console.log(userHeaderFound)
        if (!userHeaderFound) {
            await interaction.editReply("User Could not be found in messages or you have no access to them")
            await browser.close();
            return;
        }
        
        // await page.waitForSelector('div[data-region="header-content"] strong')
        let recipientName = await page.evaluate(() => document.querySelector('div[data-region="header-content"] strong').textContent);
        let recipientImg = await page.evaluate(() => document.querySelector('div[data-region="header-content"] img').src)

        if (interaction.options.getSubcommand() === 'read') {
            await ReadMessages(interaction, page, config, recipientName, recipientImg)
        }
        else if (interaction.options.getSubcommand() === 'send') {
            let cancelSending = await SendComfirmationMessage(interaction, page, recipientName, recipientImg)
            if(cancelSending){
                await interaction.deleteReply(); // just don't send it
            }
            else{
                await SendMessageToUser(interaction, page, config, recipientName, recipientImg)
            }
        }

        await browser.close();
    }
}

const SendComfirmationMessage = (interaction, page, recipientName, recipientImg) => {
    return new Promise(async (resolve, reject) => {
		const confirmationEmbed = new EmbedBuilder()
			.setColor(primaryColour)
			.setTitle('Confirmation')
			.setURL(page.url())
            .setThumbnail(recipientImg)
			.setDescription(`Do you want to Message ${recipientName}?\n\nYou have 5 seconds to answer (default is yes)`);
        const confirmationRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('No')
					.setLabel('No')
					.setStyle(ButtonStyle.Danger),
		    )
            .addComponents(
                new ButtonBuilder()
                .setCustomId('Yes')
                .setLabel('Yes')
                .setStyle(ButtonStyle.Success)
            )
        ;

        const reply = await interaction.editReply({embeds: [confirmationEmbed], components: [confirmationRow]})

        const filter = i => i.user.id === interaction.user.id;
        // create collector to handle when button is clicked using the channel
        const collector = await reply.createMessageComponentCollector({ filter, time: 5000 });
        
        collector.on('collect', async i => {
            // console.log(i.customId)
            if(i.customId == 'No'){
                //setting cancel early to true
                resolve(true)
                collector.stop()
                //so it doesn't say sending message
                return;
            }
            else if (i.customId == 'Yes') { 
                await i.update({ content: 'Sending Message', embeds: [], components: []});
                resolve(false)
                await collector.stop()
            }
        });

        collector.on('end', collected => {
            if (collected.size == 0) {
                resolve(false)
            }
        });
    });
}

const WaitForUserNameOrError = (page) => {
    return new Promise((resolve, reject) => {
        page.waitForSelector('div[data-region="header-content"] strong').then(() => { resolve(true); return; }).catch(() => { resolve(false); return; })
        page.waitForSelector('#region-main > div > div.box.errorbox.alert.alert-danger').then(() => { resolve(false); return; }).catch(() => { resolve(false); return; }) //RJECTING cause user not found
    })
}

const ReadMessages = async (interaction, page, config, recipientName, recipientImg) => {
    let showReceived = await interaction.options.getBoolean('received') ?? config?.settings.messages.ShowReceived ?? true

    let showSent = await interaction.options.getBoolean('sent') ?? config?.settings.messages.ShowSent ?? false; // default value if null
    
    await page.waitForSelector('div.message', {timeout: 5000}).catch((error) => {/*console.log(error)*/})
    const messages = await page.evaluate((showReceived, showSent, recipientName) => {
        // console.log(showReceived)
        // console.log(showSent)
        let messages = {}
        if(showReceived){
            GetWantedMessages('div.message.received', recipientName);
        } 
        if(showSent){ // that is the user who sent it's name
            senderName = document.querySelector('#usermenu > span').textContent;
            GetWantedMessages('div.message.send', senderName);
        }
        return messages

        function GetWantedMessages(msgSelector, name) {
            let messageDivs = document.querySelectorAll(msgSelector); //div.message.send for user sent messages

            for (const messageDiv of messageDivs) {
                // console.log(messageDiv.querySelectorAll('div[data-region="text-container"] > *'))
                let messageKey = `${name}: ${messageDiv.querySelector('div[data-region="time-created"]').textContent.trim()}`;
                let messageDataArr = Array.from(messageDiv.querySelectorAll('div[data-region="text-container"] > *'), textElem => textElem.textContent.trim()).filter(msgString => msgString != '');
                messages[messageKey] = messages.hasOwnProperty(messageKey) ? messages[messageKey].concat(messageDataArr) : messageDataArr;
            }
        }
    }, showReceived, showSent, recipientName)
    // console.log(messages)
    let messagesReadEmbedArr = [CreateNewMessageReadEmbed(0)];
    //MAX IS 25!!!
    let fieldCounter = 0;
    let currentEmbed = 0; //25 is max messages per embed, and 10 is max embeds. maybe display messages from recent first? using time idk
    if(Object.keys(messages).length > 25 * 10) { await interaction.editReply('There are so many messages there is no point trying!'); return; }
    // console.log(Object.keys(messages).length)
    for (const messageTime of Object.keys(messages)) {
        //They only allow 25 as the max, but as it's zero indexed 25 won't work
        if (fieldCounter == 25) {
            currentEmbed += 1;
            messagesReadEmbedArr.push(CreateNewMessageReadEmbed(currentEmbed));
            fieldCounter = 0;
        }
        if (messages[messageTime].length > 0) messagesReadEmbedArr[currentEmbed].addFields({ name: messageTime, value: messages[messageTime].join("\n") });
        fieldCounter += 1;
    }
    if(Object.keys(messages).length == 0){
        messagesReadEmbedArr[currentEmbed].addFields( { name: "No Messages Received", value: "It seems they haven't sent you any messages!" } )
    }
    await interaction.editReply({embeds: messagesReadEmbedArr})
    return;

    function CreateNewMessageReadEmbed(currentEmbed) {
        // console.log(currentEmbed)
        let title = `Messages With ${recipientName}`
        if (currentEmbed > 0) title += `, Part: ${currentEmbed + 1}`
        return new EmbedBuilder()
            .setColor(primaryColour)
            .setTitle(title)
            .setURL(page.url())
            .setThumbnail(recipientImg)
            .setDescription('If you don\'t want people seeing this, you can read messages through DMS with this discord bot.');
    }
}

const SendMessageToUser = async (interaction, page, config, recipientName, recipientImg) => {
    messageText = await interaction.options.getString('message');
    sendAmount = await interaction.options.getInteger('times') ?? config?.settings.messages.SendAmount ?? 1;
    // if send amount is greater than 100 then it is just gonna be 100 
    if(sendAmount > 100) sendAmount = 100; //shorthand looked too confusing

    await page.waitForSelector('button[data-action="send-message"]')

    let sentSize = await page.evaluate(() => document.querySelectorAll('div.message.send').length);
    // console.log(sentSize)
    console.time('Sending heaps of messages')
    // const msgTextArea = await page.$('textarea[data-region="send-message-txt"]')
    // const sendMsgButton = await page.$('button[data-action="send-message"]')
    for (let index = 0; index < sendAmount; index++) {
        // textBox.innerText = messageText;
        //TODO getting the elems every time is inefficient
        await page.evaluate((messageText) => {document.querySelector('textarea[data-region="send-message-txt"]').value = messageText}, messageText);
        await page.evaluate(() => document.querySelector('button[data-action="send-message"]').click());
        // msgTextArea.value = messageText
        // await sendMsgButton.click();

        //Whenever a new message send is loaded into the page
        await page.waitForFunction(
            sentSize => document.querySelectorAll('div.message.send').length > sentSize,
            {},
            sentSize
        );

        sentSize += 1;
    }
    console.timeEnd('Sending heaps of messages')
    // await page.click('button[data-action="send-message"]')
    let title = `Sent a Message to ${recipientName}`
    if(sendAmount > 1) title += ` ${sendAmount} times!`;

    messageSendEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle(title)
        .setURL(page.url())
        .setThumbnail(recipientImg)
        .setDescription('If you don\'t want people seeing this, you can send the message through DMS with this discord bot.\n You can also read messages with the read subcommand!')
        .addFields({ name: 'Message Text', value: messageText } )
    interaction.editReply({content: ' ', embeds: [messageSendEmbed], components: []})
}

const loginToMoodleReq = async (messageAmount, messageText="<button>Superagent speed test</button>") => {
    let dataObj =  [{
        "index": 0,
        "methodname": "core_message_send_messages_to_conversation",
        "args": {
            "conversationid": 329,
            "messages": [
                {
                    "text": messageText
                },
            ]
        }
    }];

    for (let index = 0; index < 9; index++) {
        dataObj[0].args.messages.push({"text": messageText})
        
    }
    let loginurl = "https://login.lism.catholic.edu.au/idp/profile/cas/login?execution=e1s1"
    let msgSendUrlFix = 'https://moodle.oeclism.catholic.edu.au/lib/ajax/service.php'

    let loginObj = {'j_username': process.env.MOODLENAME, 'j_password': process.env.PASSWORD, '_eventId_proceed': 'Login'}

    let moodlhting = await superagent.get('https://moodle.oeclism.catholic.edu.au/course/view.php?id=898')

    let dashboard = await superagent.post(loginurl).send(loginObj).type('form').accept('json')
    console.log(dashboard)

    let sesskey = dashboard.text.split('sesskey":', 2)[1].split('"')[1]

    console.log(sesskey)

    console.time('moodleReq')
    for (let i = 0; i < messageAmount; i++) {
        await superagent.post(msgSendUrlFix).send(dataObj)
        .query({
            'sesskey': sesskey
        })
        .query({
            'info': 'core_message_send_messages_to_conversation'
        })
    }
    console.timeEnd('moodleReq')
}