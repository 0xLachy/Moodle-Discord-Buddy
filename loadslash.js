const Discord = require("discord.js")
require("dotenv").config()

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MEMBERS"
    ]
})

client.slashcommands = new Discord.Collection()

let bot = {
    client,
}

client.loadSlashCommands = (bot, reload) => require("./handlers/slashcommands")(bot, reload)
client.loadSlashCommands(bot, false)

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
    //telling node that it has loaded in commands and now its done
    process.exit(0)
})

client.login(process.env.TOKEN) 