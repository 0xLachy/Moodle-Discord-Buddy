//TODO make this my own
//First, we require readdirSync, path and config
const { readdirSync } = require('fs')
const path = require('path')


// Now, we require the MessageEmbed constructor from discord.js for making beautiful messages.
const {MessageEmbed} = require("discord.js")

module.exports = { // All of these properties should be added in every command
    command: "help", // The command itself
    name: "help", // The name of the command. It can be whatever
    usage: "help [command]", // The usage without the prefix
    permissions: [],
    devOnly: false,
    description: "Shows a list with all available commands", // The description of the commands
    category: "utility", // The category of the command (same name of the folder where it is)
run: async ({client, message, args, prefix, mainColour, errorColour}) => {

    if(!args[0]) {
        // As we did before with the command handler, we need to get all the commands' categories.
        const categories = readdirSync(path.join(__dirname, '../../commands/'))

        let embed = new MessageEmbed()
        .setTitle(`List of available commands (${client.commands.size})`)
        .setColor(mainColour)
        embed.footer = {
            text: `Do ${prefix}help (command) for getting more information`
        }  
        //.setFooter(`Do ${prefix}help (command) for getting more information`)

        // For each category, we will add a field with the category's name and commands
        categories.forEach(category => {
            // We filter the commands that fit the current category to print, make sure that it is also public
            const dir = client.commands.filter(c => (c.category === category) && !c.devOnly)
            
            // Now we set the first character of the category to be uppercase.
            const capitalise = category.slice(0, 1).toUpperCase() + category.slice(1)
            // Now we try the add the field
            try {
                //Dir can be empty and cause errors, especially with devOnly
                if(dir.size > 0){
                    embed.addField(`${capitalise} [${dir.size}]:`, dir?.map(c => `${c.name}`).join(", "))
                }

            } catch(e) {
                // If there's an error, console log it.
                console.log(e)
            }
        })
        // And finally we return the embed
        message.channel.send({ embeds: [embed] });
        //return message.channel.send(embed)
    }

    // If the user did provide args, execute this.
    if(args[0]) {
        // We get the command the user did provide.
        let usercmd = args.join(" ").toLowerCase()
        // Now we find a command with the same name as the user provided, and check if its an alias
       let cmd = client.commands.find(c => c.name.toLowerCase() === usercmd) || client.commands.get(client.aliases.get(usercmd));
        // If that command doesn't exist, we send an error message // NOT WORKING //TODO fix this
        if(!cmd) {
            let embed = new MessageEmbed()
            .setTitle(`Error!`)
            .setDescription(`**ERROR:** The command ${usercmd} doesnt exist!\nRun \`${prefix}help\` for a list of available commands!`)
            .setColor(errorColour)

            return message.channel.send(embed)
        }
        // If it does exist, continue with this code.

        // This is an embed with all the command's information.
        let embed = new MessageEmbed()
        .setTitle(`Information for command ${cmd.name}`)
        .addField(`Name`, cmd.name)
        .addField(`Description`, cmd.description)
        .addField(`Usage`, `${prefix}${cmd.usage}`)
        //.addField(`Accessible by`, cmd.accessible) change that to permissions thing
        .addField(`Aliases`, `${cmd.aliases ? cmd.aliases.join(", ") : "None"}`) // If the command has aliases, write them all separated by commas, if it doesnt have any, write "None".
        .setColor(mainColour)
        //.setFooter(`In the usage field, arguments between round brackets are required, and arguments between square brackets are optional.`)
        embed.footer = {
            text: "In the usage field, arguments between round brackets are required, and arguments between square brackets are optional."
        }   
        return message.channel.send({embeds: [embed]})
    }
}
}