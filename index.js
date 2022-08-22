// const Discord = require("discord.js");
const { Client, GatewayIntentBits, Partials, Collection, InteractionType } = require('discord.js');
const slashcommands = require("./handlers/slashcommands");
const { GetLoginsFromDatabase, loginGroups } = require("./util/functions")
const mongoose = require('mongoose')
require("dotenv").config()

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


module.exports = bot

//Change this to your discord server
//The reason for this is that it takes like an hour for the client application commands to publish, or you need to regenerate the URL
const guildId = "950154084441288724"

client.on("ready", async () => {
    mongoose.connect(process.env.MONGO_URI, {
        keepAlive: true
    })
    await GetLoginsFromDatabase();

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

client.on("interactionCreate", (interaction) => {
    //if its not a command //-interaction.isCommand();
//+interaction.type === InteractionType.ApplicationCommand;
    if(interaction.type !== InteractionType.ApplicationCommand) return
    //if its not from within a guild 
    // if(!interaction.inGuild()) return interaction.reply("This command can only be used in a server")

    const slashcmd = client.slashcommands.get(interaction.commandName)

    if(!slashcmd) return interaction.reply("Invalid slash command")

    //If the command is guild only and not inside guild
    if(slashcmd.guildOnly && !interaction.inGuild()) return;

    // make sure they are logged in if they want to do moodle
    if(slashcmd.idLinked && !loginGroups.hasOwnProperty(interaction.user.id)) {
        return interaction.reply(`You must be logged in to use **${interaction.commandName}**. You can log in here or in direct messages with this bot`)
    }

    // Logging what commands are used, if it has subcommand, add that
    let commandArgs = slashcmd.options.some(option => option.type == 1) ? interaction.options.getSubcommand() + ' ' : ''
    // then add any args passed if it isn't the login command
    if(interaction.commandName != "login") commandArgs += `=> ${GetCommandArgs(interaction.options.data)}`

    console.log(`${interaction.user.username} used the command **${interaction.commandName}** ${commandArgs}`)
    
    //member.permissions is a guild thing, maybe put something in for dev, like interaction.user.id == dev or something
    if(slashcmd.perms && !interaction.member.permissions.has(slashcmd.perm))
        return interaction.reply("You do not have permission for this command");

    slashcmd.run(client, interaction)
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