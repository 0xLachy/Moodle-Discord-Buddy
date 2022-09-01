const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { primaryColour, errorColour } = require("../util/variables");

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
    idLinked: false,
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
            let embed = new EmbedBuilder()
            .setTitle(`List of available slash commands (${client.slashcommands.size})`)
            .setColor(primaryColour)
            // .setFooter('The options count is the amount of sub commands and choices in each command per category')

            //Get all the slash commands and put them into categories
            slashCategoryObject = {}
            for await (const slashcmdArr of client.slashcommands) {
                //it has the name at the start of the array, really weird and pointless
                const slashcmd = slashcmdArr[1]
                let optionsCount = await GetOptionsCount(slashcmd);
                if(slashCategoryObject[slashcmd.category] == undefined) slashCategoryObject[slashcmd.category] = { categoryOptionCount: 0, categoryItems: []};
                slashCategoryObject[slashcmd.category].categoryOptionCount += optionsCount
                slashCategoryObject[slashcmd.category].categoryItems.push(slashcmd.name)
            }
  
            for(category in slashCategoryObject){
                //skip undefined one, like for devonly commands
                if(category == undefined) continue;
                const capitalisedName = category.slice(0, 1).toUpperCase() + category.slice(1);

                let { categoryOptionCount, categoryItems } = slashCategoryObject[category]
                
                try {
                    embed.addFields({ name: `${capitalisedName} [${categoryItems.length}] (Options ${categoryOptionCount})`, value: categoryItems?.map(c => `${c}`).join(", ") })
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
                let embed = new EmbedBuilder()
                .setTitle(`Error!`)
                .setDescription(`**ERROR:** The command "**${inputCommand}**" doesnt exist!\nRun /help for a list of available commands!`)
                .setColor(errorColour)

                return interaction.editReply({embeds: [embed]})

                // return interaction.channel.send(embed)
            }
            // If it does exist, continue with this code.
            // console.log(cmd)
            // This is an embed with all the command's information.
            let embed = new EmbedBuilder()
                .setTitle(`Information for command: **${cmd.name}**`)
                .addFields(
                    { name: `Name`, value: cmd.name },
                    { name: `Description`, value: cmd.description }
                )
            //.addField(`Description`, cmd.description)
            // .addField(`SubCommands`, cmd.subcommands)
            //.addField(`Usage`, `${prefix}${cmd.usage}`)
            //.addField(`Accessible by`, cmd.accessible) change that to permissions thing
            // .addField(`Aliases`, `${cmd.aliases ? cmd.aliases.join(", ") : "None"}`) // If the command has aliases, write them all separated by commas, if it doesnt have any, write "None".
            .setColor(primaryColour)
            //.setFooter(`In the usage field, arguments between round brackets are required, and arguments between square brackets are optional.`)
            
            if(cmd.usage != undefined  && cmd.usage != null){
                embed.addFields({ name: `Usage`, value: `${cmd.usage}` })
            }
            let cmdArgs = []
            for (const cmdOption of cmd.options) {
                if(cmdOption.type == 1) {
                    // if(cmdOption.options.length > 0) {
                        // console.log(cmdOption.name)//category.slice(0, 1).toUpperCase() + category.slice(1);
                        // console.log(cmdOption.options.join(','))
                    embed.addFields({ name: `Subcommand: ${cmdOption.name.slice(0, 1).toUpperCase() + cmdOption.name.slice(1)}`, value: `Args: ${cmdOption.options?.map(option => option.name).join(', ') || 'no args'}` })
                    // }
                    // else {
                    //     embed.addField(`Subcommand ${cmdOption.name}`, o)
                    // }
                }
                else {
                    cmdArgs.push(await cmdOption.name)
                }
            }
            if (cmdArgs.length > 0) embed.addFields({ name: `Args:`, value: cmdArgs.join(', ') })
            return interaction.editReply({embeds: [embed]})
        }
    }
}

const GetOptionsCount = async (slashcmd) => {
    let optionsCount = 0;
    for (const optionOrSubCommand of slashcmd.options) {
        //if it is a sub command, in the future use recursion for this nested sub commands!
        if (optionOrSubCommand.type == 1) {
            //loop through sub commands
            for (const option of optionOrSubCommand.options) {
                //if type is 1 make this a recursive thing, I don't know if that is even possible
                optionsCount++;
            }
            if(optionOrSubCommand.options.length == 0) optionsCount++;
        }
        else {
            optionsCount++;
        }
    }
    //if no options set it to one because you can at least call the command
    if(slashcmd.options.length == 0) optionsCount++;
    return optionsCount;
    // throw new NotImplementedExeption
}