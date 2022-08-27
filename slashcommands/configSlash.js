const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ComponentBuilder} = require('discord.js');
const UtilFunctions = require("../util/functions");
const mongoose = require('mongoose');

//TODO save it to the config in index.js
const maxNicknames = 5;
let cachedConfigs = [];
//*THIS IS WHERE YOU PUT ALL THE CONFIG SETTINGS, (outer) title and info & choices & function are not added to the database
//* function changes the normal input
const settingsInfo = {
    general: {
        title: 'General Settings',
        info: 'The main settings to change, it\'s a bit barren, please give sugestions to the bot creator!',
        LimitLogins: { type: Boolean, default: false, info: 'Use the bot owner to log in where possible, like for leaderboards and stuff'},
        AutoSave: { type: Boolean, default: false, info: 'Save when you quit or when you time out so you don\'t lose progress'},
    },
    quiz: {
        title: 'The settings for the quiz slash command',
        RepeatThreshold: { type: Number, min: 0, max: 100, default: 80, choices: [ 
            { label: '0%', description: 'always passes threshold, never repeats', value: 0 },
            { label: '50%', description: 'If half are correct stop repeating', value: 50 },
            { label: '75%', value: 75 },
            { label: '80%', value: 80 },
            { label: '85%', value: 85 },
            { label: '90%', value: 90 },
            { label: '95%', value: 95 },
            { label: '100%', description: 'All of the questions need to be correct', value: 100 },
        ], info: 'When a test finishes, what grade does it have to be to not repeat (if repeat is enabled)' },
        RepeatAmount: { type: Number, min: 1, max: 5, default: 1, choices: [ 1, 2, 3, 4, 5 ], info: 'Amount of times to repeat the quiz (Only if you failed the quiz / got under the repeat threshold and you use Repeat=True)'},
        ShowAlreadyCompletedQuizzes: { type: Boolean, default: true, info: 'When viewing the quizzes list decide whether to view complete ones already' },
        ShowHints: { type: Boolean, default: true, info: 'If you want the buttons to light up red or green and stuff' },
        AutoSubmit: { type: Boolean, default: false, info: 'Bypass the overview screen (makes it so you submit faster essentially), not really reccomended unless you are lazy :/'},
    },
    messages: {
        title: 'Message Settings',
        info: 'Sends a message to someone through the moodle using your account, it can also read messages and send them to discord, when running the command you can change the args like showSent=true, these are just default values',
        SendAmount: { type: Number, min: 1, max: 100, default: 1, info: 'The default amount of times to send that message to someone'},
        ShowSent: { type: Boolean, default: false, info: 'When reading messages, show the ones you sent by default'},
        ShowReceived: { type: Boolean, default: true, info: 'When reading messages, show the ones others sent to you by default'},
        Ephemeral: { type: Boolean, default: false, info: 'Only shows the result to you, deletes embed when you close discord, best way is probably this false and dm the bot'}
    },
    courses: {
        title: 'Courses Settings',
        DefaultCourseUrls: { type: [String], lowercase: true, trim: true, info: 'Which courses to be selected by default when you do a command that requires multiple courses'},
        DefaultMainCourseUrl: { type: String, default: null, lowercase: true, trim: true, info: 'The course you want to be selected by default for single course commands like status'}
    },
    config: {
        title: 'Configuration Settings',
        info: 'Settings for the settings!',
        MultiBoolean: { type: Boolean, default: true, info: 'When editing config, display multiple booleans at once or just the current value selected.'},
        DeleteSettingMessages: { type: Boolean, default: true, info: '(Only deletes inside guild) When you send in messages to edit config, delete them once they are passed'},
    },
}

// removing the title and info values because they aren't needed in the database
const configSettings = Object.entries(settingsInfo).reduce((settings, [settingType, settingData]) => {
    settings[settingType] = Object.entries(settingData).reduce((newSettingData, [settingKey, settingValue]) => {
        if(settingKey != 'title' && settingKey != 'info') {
            const { info, choices, ...wantedValues } = settingValue
            newSettingData[settingKey] = wantedValues;
        }
        return newSettingData;
    }, {})
    return settings;
}, {})

//discordID string or int, I think it is given by discord api as string
// make the schema that is used to send and recieve data
const configSchema = new mongoose.Schema({
    name: String, // their lismore name
    discordId: String, // their discord id to fetch their config
    vip: { type: Boolean, default: false },
    nicknames: { type: [String], lowercase: true, trim: true },
    settings: configSettings,
})

const config_db = mongoose.createConnection(process.env.MONGO_URI, {
    dbName: 'Configs'
});

const Config = config_db.model('Configs', configSchema, 'Configs')

//When you modify the config settings up the top run this to make sure the user config settings line up
//*If you want to change the type, delete the var, run script, add var back with wanted type and run again
// there is now way to save prefab types to database so I couldn't check for that :/
// the typeof fix only returned either 'function' or 'object' for everything
const FixConfigFiles = async () => {
    const configPrefebSchema = new mongoose.Schema({name: { type: String, default: 'Prefab' }, settings: {} });
    const ConfigPrefab = config_db.model('Configs', configPrefebSchema, 'Configs')
    let configPrefab = await ConfigPrefab.find({ name: 'Prefab'})
    
    const allConfigs = await config_db.model('Configs', configSchema, 'Configs').find({ name: { $not: { $eq: 'Prefab'} } })

    if(configPrefab.length > 0) {
        configPrefab = configPrefab[0]
        // check that the keys in both objects are the same
        const settingsTheSame = Object.entries(configSettings).length == Object.entries(configPrefab.settings).length && !Object.entries(configSettings).some(([settingInfoType, settingInfoTypeValObj]) => { 
            //if the type doesn't even exist in the prefab, def some changes
            if(!configPrefab.settings[settingInfoType]) return true;

            const oldSettingKeys = Object.keys(configPrefab.settings[settingInfoType]);
            const newSettingKeys = Object.keys(settingInfoTypeValObj)
            if(JSON.stringify(oldSettingKeys)==JSON.stringify(newSettingKeys)) {
                return false;
            }
            else {
                return true;
            }
        })
        if(settingsTheSame) {
            console.log('Config Settings Are The Same :P ')
        }
        else {

            for (const config of allConfigs) {
                //If it isn't inside one of the info types, it should either be deleted or added.
                cfgSettings = config.settings

                config.settings = Object.entries(configSettings).reduce((correctedSettings, [settingInfoType, infoTypeValues]) => {
                    const cfgSettingType = cfgSettings[settingInfoType];
                    if(cfgSettingType) {
                        // fix the specific items, make sure the types are the same
                        correctedSettings[settingInfoType] = Object.entries(infoTypeValues).reduce((fixedItems, [itemName, itemValue]) => {
                            // if the types of the config are diffenent then update stuff
                            if(typeof cfgSettingType[itemName] == CompareTypes(itemValue.type)) {
                                // console.log(`Types are the same for ${itemName}`)
                                fixedItems[itemName] = cfgSettingType[itemName]
                            }
                            else {
                                fixedItems[itemName] = itemValue.default;
                            }
                            return fixedItems
                        }, {})
                    }
                    else {
                        //When there is a new type add all the new settings!
                        console.log(`The item type ${settingInfoType} was added`)
                        correctedSettings[settingInfoType] = infoTypeValues;
                    }
                    return correctedSettings
                }, {})
                //lastly save the config to the database now the old files were removed and new files added
                await config.save();
            }
            //update the prefab settings to be the new ones and add it to the database
            configPrefab.settings = configSettings;
            await configPrefab.save();
            console.log(`Settings have been updated!`)
            
        }
    }
    else {
        configPrefab = new ConfigPrefab({ settings: configSettings})
        configPrefab.save();
    }

    cachedConfigs = allConfigs;

    //typeof is sh*t, instance of, .constructor, can't find anything online
    function CompareTypes(type) {
        if(type === Number){
            return 'number'
        }
        else if(type === Boolean){
            return 'boolean'
        }
        else if(type === String){
            return 'string'
        }
        else if(typeof type == typeof [String]){
            return 'object'
        }
        else {
            return typeof type
        }
    }
    
}

const UpdateConfigs = async (newConfig) => {
    let oldConfigFound = false;
    cachedConfigs = cachedConfigs.map(config => {
        if(config.discordId == newConfig.discordId) {
            oldConfigFound = true;
            return newConfig
        }
        else return config
    });
    if(!oldConfigFound){
        cachedConfigs.push(newConfig)
    }
}

const GetConfigById = (discordId) => {
    return cachedConfigs.find(config => config.discordId == discordId)
}

const CreateOrUpdateConfig = async (options) => {
    const { _id, ...wantedOptions} = options;
    let userConfig = await Config.find({discordId: wantedOptions.discordId})
    if(userConfig.length > 0) {
        if (userConfig.length > 1) {
            for (const duplicateConfigIndex in userConfig) {
                if(duplicateConfigIndex > 0) {
                    userConfig[duplicateConfigIndex].delete()
                }
            }
        }
        return userConfig[0]
    }
    else {
        return new Config({ ...wantedOptions })
    }
    // await Config.findOneAndUpdate({ discordId: `${wantedOptions.discordId}` }, {...wantedOptions}, {upsert: true})
}
//TODO delete config function, can be an option in the slash command, like reset=true

const DeleteConfig = async (interaction, discordId) => {
    Config.deleteOne({ discordId }).then(() => {
        interaction.editReply('Deleted Your Config File!')
        console.log(`${discordUserId} deleted their config file!`)
    }).catch((err) => {
        interaction.editReply('Error Deleting Config File!')
        console.log(err)
    })
}

const data = new SlashCommandBuilder()
	.setName('config')
	.setDescription('Set up your settings / preferences with the discord bot, like your nicknames and stuff');

module.exports = {
    category: "config",
    permissions: [],
    idLinked: true,
    devOnly: false,
    FixConfigFiles,
    GetConfigById,

    ...data.toJSON(),
    run: async (client, interaction) => {
        //deferring cause yk
        await interaction.deferReply();
        // if config doesn't exist, create new config also the user.username should go straight to nicknames by default
        // pop to remove last elements, then unshift to put the name in the start
        // let userConfig = await GetConfigFromDatabase(interaction.user.id)
        // if null create new config
        let userConfig = await CreateOrUpdateConfig({ name: null, discordId: interaction.user.id, nicknames: [ interaction?.member?.nickname, interaction.user.username ].filter(name => name != null).map(name => name.toLowerCase())})
        // console.log(userConfig)

        //calling it and assigning the variable means that you can't go back to the overview which is not what I want
        const returnedSettings = await CreateSettingsOverview(interaction, userConfig)
        const choseToSave = returnedSettings.length == 2
        userConfig = choseToSave ? returnedSettings[0] : returnedSettings;
        if(choseToSave && userConfig.general.AutoSave) {
            //save to database
            userConfig.save();
            // await CreateOrUpdateConfig(updatedConfig)
        }
        UpdateConfigs(userConfig);
    }
}

const DisplayChosenSetting = async (interaction, userConfig, settingName, settingIndex=0, lastI) => {
    return new Promise(async (resolve, reject) => {
        const currentSettings = userConfig.settings[settingName]
        const currentSettingsInfo = settingsInfo[settingName]
        const settingsEntries = Object.entries(currentSettings)
        const selectedIsBool = typeof settingsEntries[settingIndex][1] == 'boolean'
        //For multiBool thing
        const startInd = settingIndex == 0 ? 0 : settingsEntries.length - 1 == settingIndex ? settingIndex - 2 : settingIndex - 1;

        const currentSettingEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
        .setTitle(`${currentSettingsInfo.title || settingName}`)
        .addFields(
            Object.entries(currentSettings).map(([name, value], index) => { 
                const info = Object.values(currentSettingsInfo).filter(value => typeof value == 'object')[index].info;
                // display all the setting items, show selected on the one selected and display info and then on new line what they have in the config there
                return { name: `${name.split(/(?=[A-Z])/).join(' ')}${settingIndex == index ? ' [ SELECTED ]' : userConfig.settings.config.MultiBoolean && selectedIsBool && typeof value == 'boolean' && index >= startInd && index < startInd + 3 ? ' { SELECTED }' : ''}`,
                 value: `${info ? info + '\n' : ''}${min ? `min: ${min} ` : ''}${max ? `max: ${max} ` : ''}$**value: ${value}**` } 
            })
        );
        if(currentSettingsInfo.info) {
            currentSettingEmbed.setDescription(currentSettingsInfo.info)
        }
        //selected
        // if there is a description add it
        if(currentSettings.info) {
            currentSettingEmbed.setDescription(currentSettings.info);
        }
        //filter out the title and the info because they are strings and not part of it
        const choiceInfo = Object.values(currentSettingsInfo).filter(setting => typeof setting == 'object')[settingIndex];
        const [ choiceName, choiceValue ] = Object.entries(currentSettings)[settingIndex];
        const moveRow = await CreateMoveRow(settingIndex == 0, settingIndex == settingsEntries.length - 1)
        const inputActionRow = new ActionRowBuilder();
        if(choiceInfo.type === Boolean) {
           //create 1 button and have green for selected and red for false? 
        if(userConfig.settings.config.MultiBoolean) {
            // so basically after start index allows 3 buttons then that's it!
            inputActionRow.addComponents(
                //* max is 5 buttons in one row I think, but 3 looks better
                ...settingsEntries.reduce((buttons, [name, value], currentIndex) => {
                    //if it's within the prev and end indexes
                    if(typeof value == 'boolean' && currentIndex >= startInd && currentIndex < startInd + 3) {
                        buttons.push( new ButtonBuilder()
                        .setCustomId(`Boolean${name}`)
                        .setLabel(name)
                        .setStyle(value ? ButtonStyle.Primary : ButtonStyle.Secondary))
                    }
                    return buttons
                }, [])
            )
        }
           else {
               inputActionRow.addComponents(
                   new ButtonBuilder()
                       .setCustomId(`Boolean${choiceName}`)
                       .setLabel(choiceName) // the title of the thing
                       .setStyle(choiceValue ? ButtonStyle.Primary : ButtonStyle.Secondary)
               );
           }
        }
        else if(choiceInfo.type === Number) {
            if(choiceInfo.choices) {
                // this means that it is in select menu format, so create the select menu
                if(choiceInfo.choices[0]?.label) {
                    inputActionRow.addComponents(
                        new SelectMenuBuilder()
                            .setCustomId('Select')
                            .setPlaceholder(`Select a new value for ${choiceName}`)
                            .addOptions(choiceInfo.choices.map(selectObj => {selectObj.value = `${selectObj.value}`; return selectObj }))
                    )
                }
                else if (choiceInfo.choices.length <= 5){
                    inputActionRow.addComponents(
                        choiceInfo.choices.map(choice => {
                            return new ButtonBuilder()
                                .setCustomId(`Number${choice}`)
                                .setLabel(`${choice}`)
                                .setStyle(choice == choiceValue ? ButtonStyle.Success : ButtonStyle.Primary)
                            ;
                        })
                    );
                }
                else {
                    currentSettingEmbed.addFields({name: 'Input Value', value: `Type the value bellow to change ${choiceName}`})
                }
            }
            else {
                currentSettingEmbed.addFields({name: 'Input Value', value: `Type the value bellow to change ${choiceName}`})
            }
        }
        //? maybe have choices for string array as an option too! if it doesn't fit don't add the string :D
        else if(choiceInfo.type === String || typeof choiceInfo.type == typeof [String]) {
            currentSettingEmbed.addFields({name: 'Input Value', value: `Type the value bellow to change ${choiceName}`})
        }
        else {
            console.log('You forgot to code the type for this kind of config item, ln 164')
            console.log(choiceInfo)
        }
        const promises = lastI ? [lastI.deferUpdate()] : []
        promises.push(interaction.editReply({content: ' ', embeds: [currentSettingEmbed], components: inputActionRow.components.length > 0 ? [moveRow, inputActionRow] : [moveRow]}))
        await Promise.all(promises)

        let channelResponse = false;
        //make sure that it is the right person using the buttons and select menus
        const filter = i => i.user.id === interaction.user.id;
        const msgFilter = m => m.author.id === interaction.user.id
        
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();
        
        const collector = await channel.createMessageComponentCollector({ filter, time: 180 * 1000 });
        const msgCollector = await channel.createMessageCollector({ filter: msgFilter, time: 180 * 1000 });
        
        collector.on('collect', async (i) => {
            await collector.stop();
            await msgCollector.stop();
            if(i.customId == 'Quit') {
                await interaction.editReply({ content: 'Quit Successfully', embeds: [], components: [] });
                return resolve(userConfig);
            }
            else if(i.customId == 'Select') {
                // if there is one item just add it without array, more than array
                currentSettings[Object.keys(currentSettings)[settingIndex]] = i.values.length == 1 ? i.values[0] : i.values;
                // I need to redo the values now that it has changed, may aswell just reload everything as it's easier :P
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex, i))
            }
            else if(i.customId.includes('Boolean')) {
                currentSettings[i.customId.replace('Boolean', '')] = !currentSettings[i.customId.replace('Boolean', '')];
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex, i))
            }
            else if(i.customId.includes('Number')) {
                currentSettings[Object.keys(currentSettings)[settingIndex]] = Number(i.customId.replace('Number', ''))
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex, i))
            }
            else if(i.customId == 'Next') {
                //next is disabled if it can't go any further, so this is safe
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex + 1, i))
            }
            else if(i.customId == 'Back') {
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex - 1, i))
            }
            else if(i.customId == 'Overview') {
                await i.deferUpdate();
                return resolve(await CreateSettingsOverview(interaction, userConfig))
            }
            
        })
        
        collector.on('end', collected => {
            if (collected.size == 0 && !channelResponse) {
                // If they ran out of time to choose just return nothing
                interaction.editReply({ content: "Interaction Timed Out (You didn't choose anything for 180 seconds), re-run the command again", embeds: [], components: [] });
                return resolve(userConfig);
            }
        });

        msgCollector.on('collect', async m => {
            const inputCommand = m.content.toLowerCase();
            if(inputCommand == 'quit') {
                StopCollecting();
                await interaction.editReply({ content: 'Quit Successfully', embeds: [], components: [] });
                return resolve(userConfig);
            }
            else if(inputCommand == 'save') {
                userConfig.save();
                const reply = await interaction.followUp({content: 'Saved!', fetchReply: true})
                reply.delete(3000)
                if(interaction.inGuild() && userConfig.settings.config.DeleteSettingMessages) { m.delete() };
            }
            else if(inputCommand == 'next' && settingIndex != Object.keys(currentSettings).length - 1) {
                StopCollecting()
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex + 1));
            }
            else if(inputCommand == 'back' && settingIndex != 0) {
                StopCollecting();
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex - 1));
            }
            else if(inputCommand == 'overview') {
                StopCollecting();
                return resolve(await CreateSettingsOverview(interaction, userConfig))
            }
            else if(choiceInfo.type == String || choiceInfo.type == [String] || choiceInfo.choices == undefined || choiceInfo?.choices.includes(inputCommand) || (choiceInfo.type == Boolean && (inputCommand == 'true' || inputCommand == 'false'))) {
                //doesn't work, need to check if choice info.max and min
                if(choiceInfo.type == Number) {
                    if(isNaN(inputCommand)){
                        const reply = await interaction.followUp({content: 'Not A number', fetchReply: true})
                        reply.delete(3000)
                    }
                    else if(choiceInfo.min && inputCommand < choiceInfo.min) {
                        const reply = await interaction.followUp({content: 'Input not within the min', fetchReply: true})
                        reply.delete(3000)
                    }
                    else if(choiceInfo.max && inputCommand > choiceInfo.max) {
                        const reply = await interaction.followUp({content: 'Input above max', fetchReply: true})
                        reply.delete(3000)
                    }
                    else {
                        currentSettings[Object.keys(currentSettings)[settingIndex]] = inputCommand;
                    }
                    
                }
                else {
                    currentSettings[Object.keys(currentSettings)[settingIndex]] = inputCommand;
                }
                StopCollecting()
                return resolve(await DisplayChosenSetting(interaction, userConfig, settingName, settingIndex));
            }

            function StopCollecting() {
                channelResponse = true;
                collector.stop();
                msgCollector.stop();
                if(interaction.inGuild() && userConfig.settings.config.DeleteSettingMessages) { m.delete() };
            }
        });
    })
}

const CreateSettingsOverview = (interaction, userConfig, editingName=false) => {
    return new Promise(async (resolve, reject) => {
        let justSaved = false;
        const settingsOverviewEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle('Settings')
            .setDescription('This is an overview of the the settings, send your nickname to this channel bellow, click the button to change your real name instead. ' +
                'There are only 3 nicknames allowed, and there can\'t be duplicates, when you add a new nickname it is inserted at the start and removes the old third one\n' +
                'The reset button will open up a menu where you can choose the settings you would like to reset to default')
            .addFields(
                { name: 'Name On Lismore', value: `${userConfig.name}` },
                { name: 'Nicknames', value: `[${userConfig.nicknames.join(', ')}]` }
            );

        const selectRow = new ActionRowBuilder()
            .addComponents(
                new SelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Nothing selected')
                    .addOptions(Object.keys(userConfig.settings).map(label => { return { label, value: label }; }))
            );

        const buttonRow = CreateButtonRow()

        await interaction.editReply({ content: ' ', embeds: [settingsOverviewEmbed], components: [selectRow, buttonRow] });
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();
        let channelResponse = false;
        //make sure that it is the right person using the buttons and select menus
        const filter = i => i.user.id === interaction.user.id;
        const msgFilter = m => m.author.id === interaction.user.id

        const collector = await channel.createMessageComponentCollector({ filter, time: 180 * 1000 });
        const msgCollector = await channel.createMessageCollector({ filter: msgFilter, time: 180 * 1000 });

        collector.on('collect', async (i) => {
            if (i.customId == 'Quit') {
                StopCollecting();
                const quitRow = CreateButtonRow(true)
                await interaction.editReply({ components: [quitRow] });
                return resolve(userConfig, justSaved);
            }
            else if (i.customId == 'Name') {
                StopCollecting();
                await i.deferUpdate();
                return resolve(await CreateSettingsOverview(interaction, userConfig, !editingName))
            }
            else if (i.customId == 'Reset') {
                StopCollecting();
                await i.deferUpdate();
                return resolve(await ResetSettingsOverview(interaction, userConfig))
            }
            else if (i.customId == 'Save') {
                await i.deferUpdate();
                if(justSaved === false) { userConfig.save() }
                justSaved = true;
                const reply = await interaction.followUp({content: 'Saved!', fetchReply: true})
                reply.delete(3000)
            }
            else {
                StopCollecting();
                //complete the function by resolving
                resolve(await DisplayChosenSetting(interaction, userConfig, Object.entries(settingsInfo).find(([settingInfoName, settingInfoObj]) => settingInfoObj?.title == i.values[0] || settingInfoName == i.values[0])[0], 0, i));
            }
        })

        msgCollector.on('collect', async m => {
            const inputCommand = m.content.replace(/[^\w\s]/gi, '').trim().toLowerCase();
            if(inputCommand == 'quit') {
                StopCollecting(m);
                await interaction.editReply({ content: 'Quit Successfully', embeds: [], components: [] });
                return resolve(userConfig);
            }
            else if(inputCommand == 'save') {
                if(justSaved === false) { userConfig.save() }
                justSaved = true;
                const reply = await interaction.followUp({content: 'Saved!', fetchReply: true})
                reply.delete(3000)
            }
            else if(inputCommand.length > 0) {
                if(editingName) {
                    if(cachedConfigs.some(config => config.name == inputCommand)) {
                        //do the delete message thing that tells them that someone already has the name
                    }
                    else {
                        userConfig.name = inputCommand
                    }
                }
                else {
                    const nickNameOwnerConfig = cachedConfigs.find(config => config.nicknames.includes(inputCommand))
                    if(nickNameOwnerConfig) {
                        //TODO if their name is null, you can steal their nickname or if you are vip (userConfig.vip == true ) then mine biatch!
                        const reply = await interaction.followUp({content: `${nickNameOwnerConfig.discordId} has the nickname already!`, fetchReply: true})
                        return reply.delete(3000)
                    }
                    else {
                        if(userConfig.nicknames.length >= maxNicknames) { userConfig.nicknames.pop()}
                        userConfig.nicknames.unshift(inputCommand)    
                    }
                }
                StopCollecting(m)
                resolve(await CreateSettingsOverview(interaction, userConfig, editingName))
            }
        });
        collector.on('end', collected => {
            if (collected?.size == 0 && !channelResponse) {
                // If they ran out of time to choose just return nothing
                interaction.editReply({ content: "Interaction Timed Out (You didn't choose anything for 180 seconds), re-run the command again", embeds: [], components: [] });
                return resolve(userConfig);
            }
        });

        function CreateButtonRow(disabled=false) {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('Quit')
                        .setLabel('Quit')
                        .setDisabled(disabled)
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('Reset')
                        .setLabel('Reset')
                        .setDisabled(disabled)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('Name')
                        .setLabel(editingName ? 'Editing Lismore name' : 'Editing Nicknames')
                        .setDisabled(disabled)
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('Save')
                        .setLabel('Save')
                        .setDisabled(disabled)
                        .setStyle(ButtonStyle.Success)
                );
        }

        function StopCollecting(m) {
            channelResponse = true;
            collector.stop();
            msgCollector.stop();
            if(interaction.inGuild() && m && userConfig.settings.config.DeleteSettingMessages) { m.delete() };
        }
    });
}

const ResetSettingsOverview = async (interaction, oldUserConfig, resettingTopic, userConfig) => {
    return new Promise(async (resolve, reject) => {
        let resetAllSettings = false;
        if(!userConfig) {
            userConfig = oldUserConfig;
        }
        let justSaved = false;
        const reSettingsEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle('Reset Settings Overview')
            .setDescription('Choose which settings you want to reset')
            .addFields(
                { name: 'Name On Lismore', value: `${userConfig.name}` },
                { name: 'Nicknames', value: `[${userConfig.nicknames.join(', ')}]` }
            );
        const selectRow = new ActionRowBuilder();
        if(resettingTopic) {
            reSettingsEmbed.addFields({ name: `Current`, value: resettingTopic})

            selectRow.addComponents(
                new SelectMenuBuilder()
                .setCustomId('Select')
                .setPlaceholder('Nothing selected')
                .setMaxValues(resettingTopic ? Object.keys(userConfig.settings[resettingTopic]).length : 1)
                .addOptions(
                    Object.entries(userConfig.settings[resettingTopic]).map(([label, lblValue]) => {
                        return { label, description: `Current Value: ${lblValue instanceof Array ? lblValue.join('') || '[]' : lblValue}`, value: label}
                }))
            );
        }
        else {
            selectRow.addComponents(
                new SelectMenuBuilder()
                    .setCustomId('Select')
                    .setPlaceholder('Nothing selected')
                    .addOptions(
                        {
							label: 'Name',
							description: `reset your name (${userConfig.name})`,
							value: 'name',
						},
                        {
							label: 'Nicknames',
							description: `reset your nicknames`,
							value: 'nicknames',
						},
                    )
                    .addOptions(Object.keys(userConfig.settings).map(label => { return { label, value: label, description: 'goes into sub-menu' }; }))
            );
        }

        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('Cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('Done')
                    .setLabel('Done')
                    .setStyle(ButtonStyle.Success),
            );
        
        if(!resettingTopic) {
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('All')
                    .setLabel('All')
                    .setStyle(ButtonStyle.Danger),
            )
        }
        await interaction.editReply({ content: ' ', embeds: [reSettingsEmbed], components: [selectRow, buttonRow] });
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();
        let channelResponse = false;
        //make sure that it is the right person using the buttons and select menus
        const filter = i => i.user.id === interaction.user.id;
        const msgFilter = m => m.author.id === interaction.user.id

        const collector = await channel.createMessageComponentCollector({ filter, time: 180 * 1000 });
        const msgCollector = await channel.createMessageCollector({ filter: msgFilter, time: 180 * 1000 });

        collector.on('collect', async (i) => {
            if(i.customId == 'Cancel') {
                StopCollecting();
                await i.deferUpdate()
                return resolve(await CreateSettingsOverview(interaction, oldUserConfig))
            }
            else if(i.customId == 'Done') {
                StopCollecting();
                await i.deferUpdate()
                return resolve(await CreateSettingsOverview(interaction, userConfig))
            }
            else if(i.customId == 'All') {
                if(resetAllSettings) {
                    const reply = await interaction.followUp({content: 'You Already Reset Settings!', fetchReply: true})
                    return reply.delete(7500)
                }
                resetAllSettings = true;

                StopCollecting();
                await i.deferUpdate()
                
                for (const settingTopic of Object.keys(userConfig.settings)) {
                    for (const itemToReset of Object.keys(userConfig.settings[settingTopic])) {
                        //use settingsInfo to find out the default values and reset them to that
                        userConfig.settings[settingTopic][itemToReset] = settingsInfo[settingTopic][itemToReset].default 
                    }
                }
                const reply = await interaction.followUp({content: 'Reset All Settings!', fetchReply: true})
                await reply.delete(3000)
                return resolve(await CreateSettingsOverview(interaction, userConfig))
            }
            else if(i.customId == 'Select') {
                StopCollecting();
                await i.deferUpdate();
                if(resettingTopic) {
                    for (const itemToReset of i.values) {
                        //use settingsInfo to find out the default values and reset them to that
                       userConfig.settings[resettingTopic][itemToReset] = settingsInfo[resettingTopic][itemToReset].default 
                    }
                }
                else if(i.values[0] == 'name'){
                    userConfig['name'] = null;
                }
                else if(i.values[0] == 'nicknames'){
                    userConfig['nicknames'] = [];
                }
                else {
                    //we have a setting topic now
                    return resolve(await ResetSettingsOverview(interaction, oldUserConfig, i.values[0], userConfig));
                }
                return resolve(await ResetSettingsOverview(interaction, oldUserConfig, resettingTopic, userConfig))
            }
            else{
                //it means it was one of the select menu items prolly
                await i.deferUpdate();
                console.log(`The id of the button clicked (${i.customId}) was not coded for (ln 660)`)
            }
        })

        msgCollector.on('collect', async m => {
            const inputCommand = m.content.replace(/[^\w\s]/gi, '').toLowerCase();
            if(inputCommand == 'quit') {
                StopCollecting(m);
                await interaction.editReply({ content: 'Quit Successfully', embeds: [], components: [] });
                return resolve(userConfig);
            }
            else if(inputCommand == 'cancel') {
                StopCollecting(m);
                return resolve(await CreateSettingsOverview(interaction, oldUserConfig))
            }
            else if(inputCommand == 'save') {
                if(justSaved === false) { userConfig.save() }
                justSaved = true;
                const reply = await interaction.followUp({content: 'Saved!', fetchReply: true})
                await reply.delete(3000)
            }
        });
        collector.on('end', collected => {
            if (collected?.size == 0 && !channelResponse) {
                // If they ran out of time to choose just return nothing
                interaction.editReply({ content: "Interaction Timed Out (You didn't choose anything for 180 seconds), re-run the command again", embeds: [], components: [] });
                return resolve(userConfig);
            }
        });

        function StopCollecting(m) {
            channelResponse = true;
            collector.stop();
            msgCollector.stop();
            if(interaction.inGuild() && m && userConfig.settings.config.DeleteSettingMessages) { m.delete() };
        }
    });  
}

const CreateMoveRow = async (disableBack=false, disableNext=false) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('Back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Danger) // red back 
                .setDisabled(disableBack), //disable if its the first
            new ButtonBuilder()
                .setCustomId('Next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableNext),
            new ButtonBuilder()
                .setCustomId('Overview')
                .setLabel('Overview')
                .setStyle(ButtonStyle.Primary)
                // .setDisabled(disable on overview screen I guess?)
        ) 
    ;
}