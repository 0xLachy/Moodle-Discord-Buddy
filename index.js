const Discord = require("discord.js");
require("dotenv").config()

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MEMBERS"
    ]
})

let bot = {
    client,
    prefix: "!",
    owners: ["618689924970840103"]
}

client.commands = new Discord.Collection()
client.events = new Discord.Collection()
// client.slashcommands = new Discord.Collection()

client.loadEvents = (bot, reload) => require("./handlers/events")(bot, reload)
client.loadCommands = (bot, reload) => require("./handlers/commands")(bot, reload)
// client.loadSlashCommands = (bot, reload) => require("./handlers/slashcommands")(bot, reload)

client.loadEvents(bot, false)
client.loadCommands(bot, false)
// client.loadSlashCommands(bot, false)


// client.on("messageCreate", (message) => {
//     if (message.content == "hi"){
//         message.reply("Hello World!")
//     }
// })

module.exports = bot



client.on("interactionCreate", (interaction) => {
    if(!interaction.isCommand()) return
    if(!interaction.inGuild()) return interaction.reply("This command can only be used in a server")

    // const slashcmd = client.slashcommands.get(interaction.commandName)

    // // shouldn't get this error unless deleted the files for slash commands
    // if (!slashcmd) return interaction.reply("Invalid slash command")

    // if (slashcmd.perms && !interaction.member.permissions.has(slashcmd.perm))
    //     return interaction.reply("You do not have permission for this command")

    // slashcmd.run(client, interaction)
})


client.login(process.env.TOKEN)