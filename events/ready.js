module.exports = {
    name: "ready",
    run: async (bot) => {
        console.log("logged in as " + bot.client.user.tag)
    }
}