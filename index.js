const Discord = require("discord.js");
const slashcommands = require("./handlers/slashcommands");
require("dotenv").config()

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MEMBERS"
    ]
})

// to fetch config just put it inside const { <here> }
let bot = {
    client,
    prefix: "!",
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

client.loadEvents = (bot, reload) => require("./handlers/events")(bot, reload)
client.loadCommands = (bot, reload) => require("./handlers/commands")(bot, reload)
client.loadSlashCommands = (bot, reload) => require("./handlers/slashcommands")(bot, reload)

client.loadEvents(bot, false)
client.loadCommands(bot, false)
client.loadSlashCommands(bot, false)


module.exports = bot

//Change this to your discord server
//TODO change this to array
const guildId = "950154084441288724"

client.on("ready", async () => {
    console.log(`Loading ${client.slashcommands.size} slash commands`)

    const guild = client.guilds.cache.get(guildId)
    if (!guild)
        return console.error("Target Guild not found")

    await guild.commands.set([...client.slashcommands.values()])
    console.log(`Successfully loaded in ${client.slashcommands.size} slash commands`)
})

client.on("interactionCreate", (interaction) => {
    //if its not a command
    if(!interaction.isCommand()) return
    //if its not from within a guild
    if(!interaction.inGuild()) return interaction.reply("This command can only be used in a server")
    
    const slashcmd = client.slashcommands.get(interaction.commandName)

    if(!slashcmd) return interaction.reply("Invalid slash command")

    if(slashcmd.perms && !interaction.member.permissions.has(slashcmd.perm))
        return interaction.reply("You do not have permission for this command");

    slashcmd.run(client, interaction)
})

//That .then is not needed, but idk
client.login(process.env.TOKEN)//.then(client.user.setActivity("Reading Moodle Data", {type: "PLAYING"}))