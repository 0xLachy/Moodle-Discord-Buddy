const Discord = require("discord.js");
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
client.events = new Discord.Collection();

//different way to do that
//["aliases", "commands"].forEach(x => (client[x] = new Discord.Collection()))

client.aliases = new Discord.Collection();
// client.slashcommands = new Discord.Collection()

client.loadEvents = (bot, reload) => require("./handlers/events")(bot, reload)
client.loadCommands = (bot, reload) => require("./handlers/commands")(bot, reload)
// client.loadSlashCommands = (bot, reload) => require("./handlers/slashcommands")(bot, reload)

client.loadEvents(bot, false)
client.loadCommands(bot, false)


module.exports = bot



client.on("interactionCreate", (interaction) => {
    if(!interaction.isCommand()) return
    if(!interaction.inGuild()) return interaction.reply("This command can only be used in a server")
})

//That .then is not needed, but idk
client.login(process.env.TOKEN)//.then(client.user.setActivity("Reading Moodle Data", {type: "PLAYING"}))