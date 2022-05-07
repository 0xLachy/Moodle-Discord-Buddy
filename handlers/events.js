const { getFiles } = require("../util/functions")


module.exports = (bot, reload) => {
    const {client} = bot

    let events = getFiles("./events/", ".js")

    if (events.legnth === 0){
        console.log("No events to load")
    }

    events.forEach((f, i) => {
        if (reload) 
            delete require.cache[require.resolve(`../events/${f}`)]
        const event = require(`../events/${f}`)
        client.events.set(event.name, event)

        if (!reload)
            console.log(`${i + 1}. ${f} loaded`)
    })

    if (!reload)
        initEvents(bot)
}

function triggerEventHandler(bot, event, ...args){
    const {client} = bot 

    // client.events.get(event).run(bot, ...args)
    try {
        if (client.events.has(event))
            client.events.get(event).run(bot, ...args)
        else 
            console.log(client.events)
            //throw new Error(`Event ${event} does not exist`)
    }
    catch(err){
        console.error(err)
    }
}

function initEvents(bot) {
    const {client} = bot 

    // client.events.forEach((e) => {
    //     client.on(e.name,(...args) => {
    //         triggerEventHandler(bot, e, ...args)
    //     })
    // })
    client.on("ready", () => {
        triggerEventHandler(bot, "ready")
    })

    client.on("messageCreate", (message) => {
        triggerEventHandler(bot, "messageCreate", message)
    })
} 