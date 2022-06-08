const puppeteer = require('puppeteer');
const { LismLogin } = require("../../util/functions");
const { Collection, Formatters } = require("discord.js")

module.exports = {
    name: "leaderboard",
    aliases: ["lb", "board", "ranking"],
    usage: "leaderboard [t1, t2, CreateRole, SetRole, RemoveRole]", 
    description: "Shows a leadeboard of assignments handed in, can give discord roles to people based on results, by default it is all terms",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        var leaderboardString = "The all time leaderboard for 'assignments handed in' is: ";
        var allTerms = true;
        var setRoles = false;
        var createRoles = false;
        var username_arr = [];
        //should work but doesn't want to
        // const customNicknames = new Collection[{
        //     "Oli": "Oliver",
        //     "Jebidiah": "Jeb",
        //     "Lachy": "Lachlan"
        // }];
        const customNicknames = {
            "Oliver": "Oli",
            "Jeb": "Jebidiah",
            "Lachlan": "Lachy"
            //Add more custom nicknames
        }
        //this method trying to be cleaner ended up being worse lol
        // CustomNicknames = new Collection();
        // Object.entries(customNicknamesObj).forEach(entry => {
        //     const [key, value] = entry;
        //     console.log(key, value);
        //   });
        // customNicknamesObj.forEach((key, value) => {CustomNicknames.set(key, value)});
        var show_leaderboard = true;
        URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897";

        for(let i = 0;i < args.length; i++){
            let arg = args[i].toLowerCase();
            arg = arg.replace("-", "");
            if(arg == "t1"){
                leaderboardString = "The term 1 leaderboard for 'assignments handed in' is: ";
                URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=896";
                allTerms = false;
            }
            else if(arg == "t2"){
                leaderboardString = "The term 2 leaderboard for 'assignments handed in' is: ";
                URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897";
                allTerms = false;
            }
            else if(arg == "t3"){
                leaderboardString = "The term 3 leaderboard for assignments done is: ";
                URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=898";
            } 

            if(arg == "setrole" || arg == "setroles"){
                setRoles = true;
            }
            if(arg == "createrole" || arg == "createroles"){
                CreateRole("SDD KING", "#F83E0C",  0, message);
                CreateRole("SDD ELDER", "#D9540B", 0, message);
                CreateRole("SDD KNIGHT", "#F07900", 0, message);
                CreateRole("SDD SOLDIER", "#D98C0B", 0, message);
                CreateRole("SDD SLACKER", "#4A412A", 0, message);
            }
            if(arg == "removerole" || arg == "removeroles"){
                //remove roles is slow (because of discord api limits), but still works!
                await RemoveRoles(message);
                show_leaderboard = false;
            }
        }
        await LismLogin(page, URL)
        // message.guild.members.find(member => console.log(member.nickname));
        if(allTerms) {
            //TODO when t3 comes out add it in
            username_arr = await getLeaderboard(page, "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=896");
            // needs await others it gives back a problem, took me bloody hours to figure out
            username_arr.push(...await getLeaderboard(page, "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897"));
        } 
        else {
            username_arr = await getLeaderboard(page, URL);
        }

        const nameOccurrences = {};
        username_arr.forEach((x) => {
            nameOccurrences[x] = (nameOccurrences[x] || 0) + 1;
        });

        //rigging it for harry
        nameOccurrences["Harrison Baird"] -= 4;

        // Create items array
        let sortedNamesCount = Object.keys(nameOccurrences).map(function(key) {
            return [key, nameOccurrences[key]];
        });
        
        // Sort the array based on the second element
        sortedNamesCount.sort(function(first, second) {
            return second[1] - first[1];
        });
        
        //const guild = await client.guilds.fetch('940133396775075880')
        sortedNamesCount.forEach(person => leaderboardString += "\n" + person[0] + " : " + person[1])

        if(show_leaderboard)
            message.channel.send(leaderboardString);       

        if(setRoles) {
            //caching all the roles to give out
            //seting roles here, but maybe they should be set at the top like config
            //TODO if role doesn't exist, it should create it
            const wantedRoles = [
                message.guild.roles.cache.find(role => role.name === "SDD KING"),
                message.guild.roles.cache.find(role => role.name === "SDD ELDER"),
                message.guild.roles.cache.find(role => role.name === "SDD KNIGHT"),
                message.guild.roles.cache.find(role => role.name === "SDD SOLDIER"),
                message.guild.roles.cache.find(role => role.name === "SDD SLACKER")
            ];
            RemoveRoles(message);

            // GiveRolesFromLeaderboardPost(sortedNamesCount, message, customNicknames);

            GiveRolesFromLeaderboardFor(sortedNamesCount, message, customNicknames);

        }
        browser.close();
    }
} 

//not much point assigning it like this unless I add it to functions which may be handy
const getLeaderboard = async function(page, term_url){
    await page.goto(term_url);
    // TODO have a date arg for the leaderboard
    // Remove the date to make it all time
    await page.click('#id_date_enabled');

    // submit form amd wait for navigation to a new page
    await Promise.all([
        page.click('#id_submitbutton'),
        page.waitForNavigation(),
    ]);

    // make sure the page has loaded in before making array
    await page.waitForSelector("table.assignment-recent > tbody > tr > td:nth-child(2) > div > a")
    //#yui_3_17_2_1_1651899998273_85 > div:nth-child(4) > table:nth-child(4) > tbody > tr > td:nth-child(2) > div > a
    return await page.evaluate(() => Array.from(document.querySelectorAll('table.assignment-recent > tbody > tr > td:nth-child(2) > div > a'), element => element.textContent));
}

//TODO change perms for elders, like a private channel! probably best to do in discord app though
const CreateRole = async (roleName, colour, perms, message) => {
    if (message.guild.roles.cache.find(role => role.name == roleName)) {
        //The role already exists
        message.channel.send(roleName + " already exists!");
        return;
    }

    message.guild.roles.create({
        name: roleName,
        color: colour,
     })
     .then(role => {
        message.channel.send(`Role \`${role.name}\` created!`);
     })
     .catch(console.error); 
}


async function GetName(unknownNickname, customNicknames){
    //discord collections are nice
    // return (customNicknames.get(unknownNickname) || unknownNickname);
    for(nickname in customNicknames){
        if(nickname == unknownNickname) return customNicknames[nickname];
    }
    return unknownNickname;
}
async function RemoveRoles(message) {
    message.guild.roles.cache.each(role => {

        // if(role.name != "reminder" && role.name != "@everyone" && role.name != "bump reminder" && role.name != "Lismore Buddy"){
        if (role.name == "SDD KING" || role.name == "SDD ELDER" || role.name == "SDD KNIGHT" || role.name == "SDD SOLDIER" || role.name == "SDD SLACKER") {
            //message.guild.members.cache.each(member => member.roles.remove(role));
            message.guild.members.fetch().then(members => members.each(member => member.roles.remove(role)));
            //The wantedRoles.push(role) method doesn't work because it doesn't have an order unfortunately
            //message.guild.roles.cache.find(role => role.name === "SDD KING")
        }
    });
}
async function GiveRolesFromLeaderboardFor(sortedNamesCount, message, customNicknames){
    cached_i = 0;
    mainloop: for(let i = 0; i < sortedNamesCount.length; i++){
        // caching them here to avoid regrabing stuff, readability and because of async
        let userName = sortedNamesCount[i][0];
        let result = sortedNamesCount[i][1];
        if(i < 5){
            // const user = 
            // // Get the Guild and store it under the variable "list"
            // const list = client.guilds.get("335507048017952771"); 
            //doing it twice because it would be called less
            const user = await message.guild.members.fetch().then(members => members.find(member => {
                return member.nickname == userName.split(" ")[0] || member.nickname == userName
                 || member.nickname == (GetName(userName.split(" ")[0], customNicknames));
            }))
            // Iterate through the collection of GuildMembers from the Guild getting the username property of each member 
            // message.guild.members.forEach(member => console.log(member.user.username)); 
            // const user = message.guild.members.fetch(member => {
            //     return member.nickname == userName.split(" ")[0] || member.nickname == userName;
            // });
            //loop through an I until you find one that has a smaller value, if value is greater than 1 can't give out king status 
            //remove console logs later, just for debug purposes
            for(let ii = 1; ii < (sortedNamesCount.length - i);ii++){
                try {
                    switch (cached_i) {
                        case 0:
                            if(result != sortedNamesCount[i+ii][1] && ii == 1){
                                break;
                            }
                            user.roles.add(wantedRoles[1]);
                            message.channel.send(user.nickname + " gets the role: " + wantedRoles[1].name)
                            break;
                        case 1:
                            user.roles.add(wantedRoles[2]);
                            message.channel.send(user.nickname + " gets the role: " + wantedRoles[2].name)
                            break;
                        case 2:
                            user.roles.add(wantedRoles[3]);
                            message.channel.send(user.nickname + " gets the role: " + wantedRoles[3].name)
                            break;
                        // case 3:
                        //     user.roles.add(wantedRoles[3]);
                        //     message.channel.send(user.nickname + " gets the role: " + wantedRoles[3].name)
                        //     break;
                        default:
                            message.channel.send(user.nickname + " Doesn't get a role!")
                            break;
                    }
                    
                }
                catch (TypeError){
                    message.channel.send(userName.split(" ")[0] + " could not be found in discord")
                }
                if(result != sortedNamesCount[i+ii][1]){
                    if(ii == 1 && i == 0){
                        user.roles.add(wantedRoles[0]);
                        message.channel.send(user.nickname + " gets the role: " + wantedRoles[0].name)
                    }
                    cached_i++;
                }                        
                break;
            }

        }
        if (i == sortedNamesCount.length - 1){
            const user = await message.guild.members.fetch().then(members => members.find(member => {
                return member.nickname == userName.split(" ")[0] || member.nickname == userName 
                || member.nickname == (GetName(userName.split(" ")[0], customNicknames));
            }))

            for(let ii = 1; ii < sortedNamesCount.length; ii++){
                let userName = sortedNamesCount[i][0];
                let result = sortedNamesCount[i][1];
                try {
                    user.roles.add(wantedRoles[wantedRoles.length - 1]);
                    message.channel.send(user.nickname + " gets the role: " + wantedRoles[wantedRoles.length - 1].name)                        
                }
                catch (TypeError){
                    message.channel.send(userName.split(" ")[0] + " could not be found in discord and doesn't get slacker role")
                }

                if(result != sortedNamesCount[i-ii][1]){
                    break mainloop;
                } 
                i--;
                ii = 1;                       
            }
        }
    }
}
//Not async cause it causes errors with the array push, probably not as fast or readable as the other anyways
//doesn't even work properly anyways
function GiveRolesFromLeaderboardPost(sortedNamesCount, message, customNicknames){
    cached_score = 0;
    //people2DArray = [];
    scoreBracket = 0;
    people1DArray = [];

    for (const person of sortedNamesCount) {
        let score = person[1]
        //need to have option for last person
        console.log(person + " and the score est " + score)
        if(score < cached_score || sortedNamesCount.indexOf(person) == sortedNamesCount.length - 1){
            for (const correctPerson of people1DArray){
              console.log(correctPerson + " is the correct person")  
                userName = correctPerson[0];
                //discord user is a freaking promise but I can't await it ffs
                //problem is that .forEach doesn't handle async
                const discordUser = message.guild.members.fetch().then(members => members.find(member => {
                    return member.nickname == userName.split(" ")[0] || member.nickname == userName
                     || member.nickname == (GetName(userName.split(" ")[0], customNicknames));
                }));
                console.log(discordUser.nickname)
                //problem rn is that people array .legth seems to not be 1 when it get's into try
                //console.log(`${discordUser} is at index ${i} score bracket ${scoreBracket} and is in people1D length ${people1DArray.length}`)
                try {
                    console.log(people1DArray + " array length" + people1DArray.length +" + scorebracket " + scoreBracket + " person" + correctPerson);
                    //only one person and they are the first person don't need score bracket because first index is in 0 score bracket 
                    console.log(`${sortedNamesCount.indexOf(correctPerson)} == ${sortedNamesCount.length - 1} is ${correctPerson}`)
                    if(people1DArray.length == 1 && sortedNamesCount.indexOf(correctPerson) == 0){
                        discordUser.roles.add(wantedRoles[0]);
                        message.channel.send(discordUser.nickname + "at first gets the role: " + wantedRoles[0].name)
                    }
                    //TODO fix this
                    //for some reason correct person isn't archie
                    else if(sortedNamesCount.indexOf(correctPerson) == sortedNamesCount.length - 1){
                        console.log("last person was called")
                        discordUser.roles.add(wantedRoles.at(-1))
                        message.channel.send(discordUser.nickname + " gets the role: " + wantedRoles.at(-1).name)
                    }
                    else if(scoreBracket < wantedRoles.length){
                        //the i+1 means that the foreach in wanted roles might be less effective then doing a straight for loop
                        //where i is wantedroles.length
                        discordUser.roles.add(wantedRoles[scoreBracket+1])
                        message.channel.send(discordUser.nickname + " gets the role: " + wantedRoles[scoreBracket+1].name)
                    }
                    else{
                        break;
                    }
                }
                catch(TypeError){
                    message.channel.send(userName.split(" ")[0] + " could not be found in discord")
                }
            }
            scoreBracket++;
            //array is being reset whilst async is pushing other people
            people1DArray = [];
            people1DArray.push(person)
        }
        else{
            //This means that it is the same as the last one
            // console.log("pushed people1D array")
            people1DArray.push(person)
        }
        //if I do it in the if statement, it never exits cached_score 0
        cached_score = score;
    }
}