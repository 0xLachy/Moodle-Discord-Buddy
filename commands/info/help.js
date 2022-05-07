module.exports = {
    name: "help",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        message.reply("!leaderboard to see who has done the most assignments!, optional args - t1, t2")
    }
} 