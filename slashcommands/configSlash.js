const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, CategoryChannel} = require('discord.js');
const UtilFunctions = require("../util/functions");
const mongoose = require('mongoose');
const { config } = require('dotenv');

const maxNicknames = 5;
//*THIS IS WHERE YOU PUT ALL THE CONFIG SETTINGS, (outer) title and info & choices are not added to the database
//choices shuold be in discord select menu format
// otherwise they will be used as buttons on the menu itself and it is limited to probably like max 5 idk
//*TODO { SELECTED } cycle through all the booleans at once, like display them all, click next and it shows select menu instead 
//TODO when you click the reset button it brings up a select menu and you chooose all the things that you want to reset,


//TODO if the settings are modified, the schema won't work to fetch the old configs, so work out a way to update old configs
//? like maybe add in an option to the slash command itself called **fix-configs** that uses a schema with settings info as just a {}?
// like it will ask about name, nicknames, and the other settings topics. also have a button that says 'all' and another that says 'cancel'
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
        ShowAlreadyCompletedQuizzes: { type: Boolean, default: true, info: 'When viewing the quizzes list decide whether to view complete ones already' }
    },
    messages: {
        title: 'Message Settings',
        info: 'Sends a message to someone through the moodle using your account, it can also read messages and send them to discord, when running the command you can change the args like showSent=true, these are just default values',
        SendAmount: { type: Number, min: 1, max: 100, default: 1, info: 'The default amount of times to send that message to someone'},
        ShowSent: { type: Boolean, default: false, info: 'When reading messages, show the ones you sent by default'},
        ShowReceived: { type: Boolean, default: true, info: 'When reading messages, show the ones others sent to you by default'},
    },
    courses: {
        title: 'Courses Settings',
        DefaultCourseUrls: { type: [String], lowercase: true, trim: true, info: 'Which courses to be selected by default when you do a command that requires multiple courses'},
        DefaultMainCourseUrl: { type: String, default: null, lowercase: true, trim: true, info: 'The course you want to be selected by default for single course commands like status'}
    },
    config: {
        title: 'Configuration Settings',
        info: 'Settings for the settings!',
        MessageCollection: { type: Boolean, default: true, info: 'When editing the config, send in next or quit instead of needing to hit the buttons!'},
        MultiBoolean: { type: Boolean, default: true, info: 'When editing config, display multiple booleans at once or just the current value selected.'},
        DeleteSettingMessages: { type: Boolean, default: true, info: '(Only deletes inside guild) When you send in messages to edit config, delete them once they are passed (only deletes until you type quit or hit the quit button)'},
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
    nicknames: { type: [String], lowercase: true, trim: true },
    settings: configSettings

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
    // console.log(Object.fromEntries(Object.entries(configSettings).map(([configType, configTypeVals]) => {
    //     return [configType, Object.fromEntries(Object.entries(configTypeVals).map(([cfgName, cfgValue]) => [cfgName, mongoose.Schema.Types.Mixed]))]
    // })))
    const configPrefebSchema = new mongoose.Schema({name: { type: String, default: 'Prefab' }, settings: {} });
    // const configPrefebSchema = new mongoose.Schema({name: { type: String, default: 'Prefab' }, settings: Object.fromEntries(Object.entries(configSettings).map(([configType, configTypeVals]) => {
    //     return [configType, Object.fromEntries(Object.entries(configTypeVals).map(([cfgName, cfgValue]) => [cfgName, Object]))]
    // }))})

    const ConfigPrefab = config_db.model('Configs', configPrefebSchema, 'Configs')
    let configPrefab = await ConfigPrefab.find({ name: 'Prefab'})

    //'function' for everything... FOR F*CKS SAKE
    // configPrefab = new ConfigPrefab({ settings: Object.fromEntries(Object.entries(configSettings).map(([configType, configTypeVals]) => {
    //     return [configType, Object.fromEntries(Object.entries(configTypeVals).map(([cfgName, cfgValue]) => { const {type, ...cfgValues} = cfgValue; return [cfgName, {type: typeof type, ...cfgValues}]}))]
    // }))})
    // return console.log(configPrefab)t

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
            return console.log('Config Settings Are The Same :P ')
        }
        else {

            const allConfigs = await config_db.model('Configs', configSchema, 'Configs').find({})
            for (const config of allConfigs) {
                if(config.name == 'Prefab') continue;
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

    ...data.toJSON(),
    run: async (client, interaction) => {
        //deferring cause yk
        await interaction.deferReply();

        // if config doesn't exist, create new config also the user.username should go straight to nicknames by default
        // pop to remove last elements, then unshift to put the name in the start
        // let userConfig = await GetConfigFromDatabase(interaction.user.id)
        // if null create new config
        //TODO fix the nicknames thing, I think though it only adds the nicknames if it is nwe
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
    }
}

const DisplayChosenSetting = async (interaction, userConfig, settingName, settingIndex=0, lastI) => {
    return new Promise(async (resolve, reject) => {
        const currentSettings = userConfig.settings[settingName]
        const currentSettingsInfo = settingsInfo[settingName]

        const currentSettingEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
        .setTitle(`${currentSettingsInfo.title || settingName}`)
        .addFields(
            Object.entries(currentSettings).map(([name, value], index) => { 
                const info = Object.values(currentSettingsInfo).filter(value => typeof value == 'object')[index].info;
                // display all the setting items, show selected on the one selected and display info and then on new line what they have in the config there
                return { name: `${name.split(/(?=[A-Z])/).join(' ')}${settingIndex == index ? ' [ SELECTED ]' : ''}`, value: `${info ? info + '\n' : ''}**value: ${value}**` } 
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
        const moveRow = await CreateMoveRow(settingIndex == 0, settingIndex == Object.keys(currentSettings).length - 1)
        const inputActionRow = new ActionRowBuilder();
        if(choiceInfo.type === Boolean) {
           //create 1 button and have green for selected and red for false? 
                inputActionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('Boolean')
                        .setLabel(choiceName) // the title of the thing
                        .setStyle(choiceValue ? ButtonStyle.Success : ButtonStyle.Danger) // red back 
                );
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
            else if(i.customId == 'Boolean') {
                currentSettings[Object.keys(currentSettings)[settingIndex]] = !currentSettings[Object.keys(currentSettings)[settingIndex]];
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
                i.deferUpdate();
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

        // works for every one
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
                if(interaction.inGuild()) { m.delete() };
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
                if(interaction.inGuild()) { m.delete() };
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
                'Note -- if you edit config settings, save and rerun the command for changes to take effect')
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

        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('Quit')
                    .setLabel('Quit')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('Name')
                    .setLabel(editingName ? 'Editing Lismore name' : 'Editing Nicknames')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('Save')
                    .setLabel('Save')
                    .setStyle(ButtonStyle.Success),
            )

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
                await interaction.editReply({ content: 'Quit Successfully', embeds: [], components: [] });
                return resolve(userConfig, justSaved);
            }
            else if (i.customId == 'Name') {
                StopCollecting();
                i.deferUpdate();
                return resolve(await CreateSettingsOverview(interaction, userConfig, !editingName))
            }
            else if (i.customId == 'Save') {
                i.deferUpdate();
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
            const inputCommand = m.content.replace(/[^\w\s]/gi, '').toLowerCase();
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
                    userConfig.name = inputCommand
                }
                else {
                    //TODO check that other people don't have the nickname either...
                    if(userConfig.nicknames.length >= maxNicknames) { userConfig.nicknames.pop()}
                    userConfig.nicknames.unshift(inputCommand)    
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

        function StopCollecting(m) {
            channelResponse = true;
            collector.stop();
            msgCollector.stop();
            if(interaction.inGuild() && m) { m.delete() };
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