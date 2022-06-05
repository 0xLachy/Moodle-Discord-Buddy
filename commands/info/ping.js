module.exports = {
    command: "ping",
    name: "ping",
    category: "utility",
    description: "Pong! Shows client and api latency",
    usage: "ping",
    acessible: "Members",
run: async ({client, message}) => {
    message.channel.send(`Command Latency: **${new Date().getTime() - message.createdTimestamp} ms**\nAPI Latency: **${client.ws.ping} ms**`)
}
}