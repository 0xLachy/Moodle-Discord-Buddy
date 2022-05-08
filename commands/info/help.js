module.exports = {
    name: "help",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        for(let i = 0;i < args.length; i++){
            let arg = args[i].toLowerCase();
            arg = arg.replace("-", "");
            if(arg == "leaderboard"){
                message.channel.send("Returns leaderboard of classwork, alias: lb, optional args: t1, t2, create-roles, set-roles")
            } 
            if(arg == "status") {
                message.channel.send("Get info about person in class, example: !status lachlan")
            }           
        }
        if(args.length == 0){
            message.channel.send("Commands: leaderboard, status, help\n!help <cmd> to show help for a specific command, e.g. !help status")
        }
    }
} 