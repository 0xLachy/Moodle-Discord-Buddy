const Discord = require("discord.js");
const slashcommands = require("./handlers/slashcommands");
require("dotenv").config()

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MEMBERS",
        "DIRECT_MESSAGES"
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

client.commands = new Discord.Collection();
client.slashcommands = new Discord.Collection();
client.events = new Discord.Collection();

//different way to do that
//["aliases", "commands"].forEach(x => (client[x] = new Discord.Collection()))

client.aliases = new Discord.Collection();
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
    console.log(`Loading ${client.slashcommands.size} slash commands`)
    const guild = client.guilds.cache.get(guildId)
    if (!guild)
        return console.error("Target Guild not found")

    await client.application.commands.set([...client.slashcommands.values()])
    // await client.application.commands.set([])
    // await guild.commands.set([...client.slashcommands.values()])
    //console.log(client.application.commands.s)
    console.log(`Successfully loaded in ${client.slashcommands.size} slash commands`)
})

client.on("interactionCreate", (interaction) => {
    //if its not a command
    if(!interaction.isCommand()) return
    //if its not from within a guild 
    // if(!interaction.inGuild()) return interaction.reply("This command can only be used in a server")
    
    const slashcmd = client.slashcommands.get(interaction.commandName)

    if(!slashcmd) return interaction.reply("Invalid slash command")

    //If the command is guild only and not inside guild
    if(slashcmd.guildOnly && !interaction.inGuild()) return;

    if(slashcmd.perms && !interaction.member.permissions.has(slashcmd.perm))
        return interaction.reply("You do not have permission for this command");

    slashcmd.run(client, interaction)
})

//That .then is not needed, but idk
client.login(process.env.TOKEN)//.then(client.user.setActivity("Reading Moodle Data", {type: "PLAYING"}))