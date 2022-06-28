const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const LismFunctions = require("../util/functions");


//Code to get all the command names:


const data = new SlashCommandBuilder()
	.setName('help')
	.setDescription('Shows a list with all available commands')
    .addStringOption(option => 
        option
        .setName("command")
        .setDescription("The command that you want to get help on")
        .setRequired(false)
        //NEEDS INTERACTION TO GET SLASH CMDS
        // .addChoices(
        //     { name: 'Funny', value: 'gif_funny' },
        //     { name: 'Meme', value: 'gif_meme' },
        //     { name: 'Movie', value: 'gif_movie' },
		// )
    )


module.exports = { 
    usage: "help [command]", // The usage without the prefix
    // permissions: [],
    devOnly: false,
    // description: "Shows a list with all available commands", // The description of the commands
    category: "utility", // The category of the command (same name of the folder where it is)
    ...data.toJSON(),
    run: async (client, interaction) => {
        //Im doing this just in case the rasberry pi is too slow
        await interaction.deferReply();

        let inputCommand = await interaction.options.getString("command")
        if(inputCommand == null) {
            //If no inputCommand is added go here, fetching all the slash commands

            //Create a new embed message to reply to the sender
            let embed = new MessageEmbed()
            .setTitle(`List of available slash commands (${client.slashcommands.size})`)
            .setColor(LismFunctions.primaryColour)

            //Get all the slash commands and put them into categories
            slashCategoryObject = {}
            client.slashcommands.forEach(slashcmd => {

                if(slashCategoryObject[slashcmd.category]){
                    slashCategoryObject[slashcmd.category].push(slashcmd.name)
                }
                else{
                    slashCategoryObject[slashcmd.category] = []
                    slashCategoryObject[slashcmd.category].push(slashcmd.name)
                }
            })

            for(category in slashCategoryObject){
                //skip undefined one, don't know why
                if(category == undefined) continue;
                const capitalisedName = category.slice(0, 1).toUpperCase() + category.slice(1);

                let categoryItems = slashCategoryObject[category]
                try {
                    embed.addField(`${capitalisedName} [${categoryItems.length}]:`, categoryItems?.map(c => `${c}`).join(", "))
                } catch(e){
                    console.log(e)
                }
                
            }

            // And finally we return the embed
            return interaction.editReply({ embeds: [embed]})

        //If there was an arg    
        } else{
            let cmd = client.slashcommands.find(c => c.name.toLowerCase() === inputCommand)

            if(!cmd) {
                let embed = new MessageEmbed()
                .setTitle(`Error!`)
                .setDescription(`**ERROR:** The command "**${inputCommand}**" doesnt exist!\nRun /help for a list of available commands!`)
                .setColor(LismFunctions.errorColour)

                return interaction.editReply({embeds: [embed]})

                // return interaction.channel.send(embed)
            }
            // If it does exist, continue with this code.

            // This is an embed with all the command's information.
            let embed = new MessageEmbed()
            .setTitle(`Information for command: **${cmd.name}**`)
            .addField(`Name`, cmd.name)
            .addField(`Description`, cmd.description)
            //.addField(`Usage`, `${prefix}${cmd.usage}`)
            //.addField(`Accessible by`, cmd.accessible) change that to permissions thing
            // .addField(`Aliases`, `${cmd.aliases ? cmd.aliases.join(", ") : "None"}`) // If the command has aliases, write them all separated by commas, if it doesnt have any, write "None".
            .setColor(LismFunctions.primaryColour)
            //.setFooter(`In the usage field, arguments between round brackets are required, and arguments between square brackets are optional.`)
            
            if(cmd.usage != undefined  && cmd.usage != null){
                embed.addField(`Usage`, `${cmd.usage}`)
            }
            return interaction.editReply({embeds: [embed]})
        }
    }
}
