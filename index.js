// const Discord = require("discord.js");
const { Client, GatewayIntentBits, Partials, Collection, InteractionType } = require('discord.js');
const slashcommands = require("./handlers/slashcommands");
const { FixConfigFiles, GetConfigById, CreateOrUpdateConfig } = require("./slashcommands/configSlash")
const { GetLoginsFromDatabase, loginGroups } = require("./util/functions")
const mongoose = require('mongoose')
require("dotenv").config()
//TODO daily quiz for moodle money, badge for daily moodle quizzes done (1, 25, 52, 365)
//*vip can get a second daily quiz, they can't use autofill for the quizzes!
//+ const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]//, 
    // partials: ["MESSAGE","CHANNEL"]
})

// to fetch config just put it inside const { <here> }
let bot = {
    client,
    prefix: "!", //Ɛ>this would be cool<3 
    classAmount: 26,
    mainColour: "#156385",
    errorColour: "#FF0000",
    owners: ["618689924970840103"]
}

client.commands = new Collection();
client.slashcommands = new Collection();
client.events = new Collection();

//different way to do that
//["aliases", "commands"].forEach(x => (client[x] = new Discord.Collection()))

client.aliases = new Collection();
// client.slashcommands = new Discord.Collection()

// client.loadEvents = (bot, reload) => require("./handlers/events")(bot, reload)
client.loadCommands = (bot, reload) => require("./handlers/commands")(bot, reload)
client.loadSlashCommands = (bot, reload) => require("./handlers/slashcommands")(bot, reload)

// client.loadEvents(bot, false) //for now the messages are disabled because they are broken
client.loadCommands(bot, false)
client.loadSlashCommands(bot, false)


mongoose.connect(process.env.MONGO_URI, {
    keepAlive: true
})
//Change this to your discord server
// think this guild stuff is deprecated now, but it could be handy if you want commands only in the guild
const guildId = "950154084441288724"

client.on("ready", async () => {
    console.log('Logging Into The Database:')
    await GetLoginsFromDatabase();
    
    //fix config files if you made changes to the prefab for the database
    await FixConfigFiles();
    
    console.log(`Loading ${client.slashcommands.size} slash commands`)
    // const guild = client.guilds.cache.get(guildId)
    // if (!guild){
        //     return console.error("Target Guild not found")
        // }
        await client.application.commands.set([...client.slashcommands.values()])
        // await client.application.commands.set([])
        // await guild.commands.set([...client.slashcommands.values()])
        //console.log(client.application.commands.s)
        console.log(`Successfully loaded in ${client.slashcommands.size} slash commands`)
    })

    client.on("interactionCreate", async (interaction) => {
        //if its not a command //-interaction.isCommand();
        //+interaction.type === InteractionType.ApplicationCommand;
        if(interaction.type !== InteractionType.ApplicationCommand) return
    //if its not from within a guild 
    // if(!interaction.inGuild()) return interaction.reply("This command can only be used in a server")
    const slashcmd = await client.slashcommands.get(interaction.commandName)
    if(!slashcmd) return await interaction.reply("Invalid slash command")
    
    //If the command is guild only and not inside guild
    if(slashcmd.guildOnly && !interaction.inGuild()) return;
    
    // make sure they are logged in if they want to do moodle
    if(slashcmd.idLinked && !loginGroups.hasOwnProperty(interaction.user.id)) {
        return await interaction.reply(`You must be logged in to use **${interaction.commandName}**. You can log in here or in direct messages with this bot`)
    }

    // Logging what commands are used, if it has subcommand, add that
    let commandArgs = slashcmd.options.some(option => option.type == 1) ? await interaction.options.getSubcommand() + ' ' : ''
    // then add any args passed if it isn't the login command
    if(interaction.commandName != "login") commandArgs += `=> ${await GetCommandArgs(interaction.options.data)}`
    
    console.log(`${interaction.user.username} used the command **${interaction.commandName}** ${commandArgs}`)
    
    //member.permissions is a guild thing, maybe put something in for dev, like interaction.user.id == dev or something
    if(slashcmd.perms && !await interaction.member.permissions.has(slashcmd.perm))
    return await interaction.reply("You do not have permission for this command");

    //DEFERING REPLY BECAUSE IT CAN BE SLOW WIFI
    let config = await GetConfigById(interaction.user.id);
    //* if the user doesn't have config, create one
    if(!config) {
        config = await CreateOrUpdateConfig({discordId: interaction.user.id, nicknames: [ interaction?.member?.nickname, interaction.user.username ].filter(name => name != undefined).map(name => name.toLowerCase())})
    }
    //increment commands run
    config.stats.TotalCommandsRun++;
    // then save to the database... every time, might be a bit expensive but better than fetching every time
    await config.save();
    //not awaiting cause other commands can run at the same time I guess idk...
    slashcmd.run(client, interaction, config)
    //TODO after runing the slash command, .then, check for badges using their stats, like 50 slash commands ran or $100 donated
})
//discord error handling things that might help
process.on("unhandledRejection", async (err) => {
  console.error("Unhandled Promise Rejection:\n", err);
});
process.on("uncaughtException", async (err) => {
    console.error("Uncaught Promise Exception:\n", err);
});
process.on("uncaughtExceptionMonitor", async (err) => {
  console.error("Uncaught Promise Exception (Monitor):\n", err);
});
// process.on("multipleResolves", async (type, promise, reason) => {
    //   console.error("Multiple Resolves:\n", type, promise, reason);
    // });
    //That .then is not needed, but idk
client.login(process.env.TOKEN)//.then(client.user.setActivity("Reading Moodle Data", {type: "PLAYING"}))

function GetCommandArgs(options) {
    let optionsArray = options
    if(options[0]?.type == 1) optionsArray = options[0].options
    return optionsArray.map(option => `${option.name} : ${option.value}`).join(', ') || '(default)'
}


module.exports = bot;