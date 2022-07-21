//when user logs in add their user id to the perms to this command and the edit profile command
const { SlashCommandBuilder } = require('@discordjs/builders');
const puppeteer = require('puppeteer');
const { MessageEmbed, MessageActionRow, MessageButton, ButtonInteraction } = require('discord.js');
// const { MessageEmbed, Util, MessageButton } = require('discord.js');
const UtilFunctions = require("../util/functions");




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
            //TODO add optional spam amount that lets you send in hundreds lol
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
            //TODO ADD BOOLEAN READ SELF MESSAGES
            //TODO also make sure there aren't too many messages
    )


module.exports = {
    category: "login",
    permissions: [],
    devOnly: false,
    ...data.toJSON(),
    run: async (client, interaction) => {
        //TODO modularise all the main body of this script
        //normal, cause 3 seconds isn't fast enough
        await interaction.deferReply();
        //Make sure the user is logged in
        if(!UtilFunctions.loginGroups.hasOwnProperty(interaction.user.id)) {
            await interaction.editReply("You must login first to use this feature, You can log in here or in direct messages with this bot")
            //break out of this function early because they need to be logged in and they aren't
            return;
        }
        // const browser = await puppeteer.launch({ headless: false })
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        //log into the browser todo find a better way to do this
        await UtilFunctions.LoginToMoodle(page, await interaction.user.id).catch(reason => {
            console.log(reason);
            interaction.editReply({content: reason});
            // browser.close();
        })
        let recipientID = await UtilFunctions.NameToID(interaction, page, interaction.options.getString('name-or-id'))
        if (recipientID == null) interaction.editReply('Recipient ID could not be found');// maybe use a message box to show that the id didn't work
        await page.goto(`${UtilFunctions.mainStaticUrl}message/index.php?id=${recipientID}`)
        let deletedReply = false;

        //TODO use try catch here because the person may not be accessable or real if they pass in a straight id
        //#region-main > div > div.box.errorbox.alert.alert-danger check for existence of this
        //maybe have a custom promise that waits for ONE, of them to return, and when they do continue maybe use .then
        //TODO test this I don't know what will happen 777
        // console.log("just before user header found funcion")
        let userHeaderFound = await WaitForUserNameOrError(page)
        // console.log(userHeaderFound)
        if (!userHeaderFound) {
            await interaction.editReply("User Could not be found or you have no access to them")
            await browser.close();
            return;
        }
        
        // await page.waitForSelector('div[data-region="header-content"] strong')
        let recipientName = await page.evaluate(() => document.querySelector('div[data-region="header-content"] strong').textContent);
        let recipientImg = await page.evaluate(() => document.querySelector('div[data-region="header-content"] img').src)

        if (interaction.options.getSubcommand() === 'read') {
            //read message and that is //#yui_3_17_2_1_1658434584419_54 message recieved class div
            // try {
            //     await page.waitForSelector('div.message')// instead just use message because there may not be any messagess recieved
            // } catch (err) {
            //     await interaction.editReply(`You have no messages with ${recipientName}`)  
            //     return;  
            // }//not really the best way, but for some reason it doesn't load before the div.message.received gets queried
            await page.waitForSelector('div.message.received', {timeout: 5000}).catch((error) => {/*console.log(error)*/})
            const messages = await page.evaluate(() => {
                let recievedDivs = document.querySelectorAll('div.message.received');
                let messages = {}
                // console.log(recievedDivs)
                for (const recievedDiv of recievedDivs) {
                    //sets the obj to the time, and then holds array of messages text (it could be p, or hr, or other elems.textContent)
                    messages[recievedDiv.querySelector('div[data-region="time-created"]').textContent] = Array.from(recievedDiv.querySelectorAll('div[data-region="text-container"] > *'), textItem => textItem.textContent);
                }
                // console.log(messages)
                return messages
            })
            // console.log(messages)
            messagesReadEmbed = new MessageEmbed()
            .setColor(UtilFunctions.primaryColour)
            .setTitle(`Received Messages from ${recipientName}`)
            .setURL(page.url)
            .setThumbnail(recipientImg)//TODO add read option and also make message text not required or do subcommand groups
            .setDescription('If you don\'t want people seeing this, you can send the message through DMS with this discord bot.');
            for (const messageTime of Object.keys(messages)) {
                messagesReadEmbed.addField(messageTime, messages[messageTime].join("\n"))
            }
            if(Object.keys(messages).length == 0){
                messagesReadEmbed.addField("No Messages Received", "It seems they haven't sent you any messages!")
            }
            interaction.editReply({embeds: [messagesReadEmbed]})
            // .addField('Message Text', messageText)
            // console.log(messages)
            await browser.close()
            return;
        }
        else {
            await SendComfirmationMessage(interaction, page, recipientName, recipientImg).catch(async () => {
                // await interaction.editReply({content: ""})
                await interaction.deleteReply();
                deletedReply = true;
                //TODO find better way, return doesn't work
                console.log("deleted reply")
            })
            if (deletedReply) { return; }
        }

        // await interaction.editReply({content: 'Sending Embed', embeds: [], components:[]})
        //TODO add a confirm selected participant button
        //also that selector is pretty trash, i guess i only need the confirm on user if going by name
        //div[data-region="header-content"] ~ strong
        //that is honestly the best way to do it to be honest
        
        //await interaction.editReply("Sending Message To " + await page.evaluate(() => document.querySelector('#yui_3_17_2_1_1658394340641_52 > div.d-flex.text-truncate > a > div.w-100.text-truncate.ml-2 > div > strong')))
        //click on the text box and type
        //#yui_3_17_2_1_1658367166412_44 > div.col-8.d-flex.flex-column > div.footer-container.position-relative > div > div:nth-child(1) > div.d-flex.mt-1 > textarea
        //textarea[data-region="send-message-txt"] dir="auto" //TODO SORT ISSUE IF WRONG ONE SELECTED
        // await page.click('textarea[data-region="send-message-txt"]');
        // await page.keyboard.type(await interaction.options.getString('message'));
        //document.getElementById("sample").innerText = "your text"
        //#yui_3_17_2_1_1658367166412_64 > div > button.btn.btn-link.btn-icon.icon-size-3.ml-1.mt-auto
        //can't just use .click() inside this function because of it moving or nested divs... tbh idk
        messageText = await interaction.options.getString('message');


        // .setDescription(``);
        await page.waitForSelector('button[data-action="send-message"]')
        await page.evaluate((messageText) => { 
            document.querySelector('textarea[data-region="send-message-txt"]').innerText = messageText;
            /*let elemThing = */document.querySelector('button[data-action="send-message"]').click();//#yui_3_17_2_1_1658391746948_38document.querySelector('button[data-action="send-message"]');//#yui_3_17_2_1_1658391746948_38
            // console.log(elemThing)
            // elemThing.click();//#yui_3_17_2_1_1658391746948_38
            // console.log('WOrked')
        }, messageText)

        // await page.click('button[data-action="send-message"]')

        messageSendEmbed = new MessageEmbed()
        .setColor(UtilFunctions.primaryColour)
        .setTitle(`Sent a Message to ${recipientName}`)
        .setURL(page.url)
        .setThumbnail(recipientImg)//TODO add read option and also make message text not required or do subcommand groups
        .setDescription('If you don\'t want people seeing this, you can send the message through DMS with this discord bot.\n You can also read messages with read=true option')
        .addField('Message Text', messageText)
        interaction.editReply({content: ' ', embeds: [messageSendEmbed], components: []})
        
        // await page.click('button[data-action="send-message"]');
        // that should be sent now. I should also have an option to read the messages
        //<p style="color: green;"> another green </p> that will make green text
        //TODO just go to this after you get their username if they didn't pass in an ID
        //https://moodle.oeclism.catholic.edu.au/message/index.php?id=${id}
        //maybe use a name to id function
        await browser.close();
    }
}

const SendComfirmationMessage = (interaction, page, recipientName, recipientImg) => {
    return new Promise(async (resolve, reject) => {
		const confirmationEmbed = new MessageEmbed()
			.setColor(UtilFunctions.primaryColour)
			.setTitle('Confirmation')
			.setURL(page.url)
            .setThumbnail(recipientImg)
			.setDescription(`Do you want to Message ${recipientName}?\n\nYou have 3 seconds to answer (default is yes)`);
        const confirmationRow = new MessageActionRow()
			.addComponents(
				new MessageButton()
					.setCustomId('No')
					.setLabel('No')
					.setStyle('DANGER'),
		    )
            .addComponents(
                new MessageButton()
                .setCustomId('Yes')
                .setLabel('Yes')
                .setStyle('SUCCESS')
            )
        ;
        
        // const collector = await interaction.channel.createMessageComponentCollector({ time: 3000 });
        let channel = await interaction.channel
        //If the channel isn't inside the guild, you need to create a custom cd channel
        if(!interaction.inGuild()){
            channel = await interaction.user.createDM(); 
        }
        // create collector to handle when button is clicked using the channel
        const collector = await channel.createMessageComponentCollector({ /*filter, */time: 3000 });

        await interaction.editReply({embeds: [confirmationEmbed], components: [confirmationRow]})
        
        collector.on('collect', async i => {
            console.log(i.customId)
            if(i.customId == 'No'){
                //reject I guess or return null
                reject()
                collector.stop()
            }
            else if (i.customId == 'yes') { 
                resolve()
                collector.stop()
            }
            await i.update({ content: 'Sending Message', embeds: [], components: []});
        });

        collector.on('end', collected => {
            if (collected.size == 0) {
                resolve()
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
