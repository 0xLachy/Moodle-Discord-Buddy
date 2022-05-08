const puppeteer = require('puppeteer');
const { LismLogin } = require("../../util/functions")

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

module.exports = {
    name: "leaderboard",
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
        URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897";

        for(let i = 0;i < args.length; i++){
            let arg = args[i].toLowerCase();
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
                createRoles = true;
            }
        }

        await LismLogin(page, URL)

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

        // Create items array
        let sortedNamesCount = Object.keys(nameOccurrences).map(function(key) {
            return [key, nameOccurrences[key]];
        });
        
        // Sort the array based on the second element
        sortedNamesCount.sort(function(first, second) {
            return second[1] - first[1];
        });
        
        const guild = await client.guilds.fetch('950154084441288724')
        for(let i = 0; i < sortedNamesCount.length; i++){
            leaderboardString += "\n" + sortedNamesCount[i][0] + " : " + sortedNamesCount[i][1];
        }

        if (createRoles){
            CreateRole("SDD KING", "#F83E0C", 0, message);
            CreateRole("SDD ELDER", "#D9540B", 0, message);
            CreateRole("SDD KNIGHT", "#F07900", 0, message);
            CreateRole("SDD SOLDIER", "#D98C0B", 0, message);
            CreateRole("SDD SLACKER", "#4A412A", 0, message);
        }

        if(setRoles) {
            //caching all the roles to give out
            const wantedRoles = [
                message.guild.roles.cache.find(role => role.name === "SDD KING"),
                message.guild.roles.cache.find(role => role.name === "SDD ELDER"),
                message.guild.roles.cache.find(role => role.name === "SDD KNIGHT"),
                message.guild.roles.cache.find(role => role.name === "SDD SOLDIER"),
                message.guild.roles.cache.find(role => role.name === "SDD SLACKER")
            ];
            message.guild.roles.cache.each(role => {

                // if(role.name != "reminder" && role.name != "@everyone" && role.name != "bump reminder" && role.name != "Lismore Buddy"){
                if(role.name == "SDD KING" || role.name == "SDD ELDER" || role.name == "SDD KNIGHT" || role.name == "SDD SOLDIER" || role.name == "SDD SLACKER" ){
                    message.guild.members.cache.each(member => member.roles.remove(role));
                    //The wantedRoles.push(role) method doesn't work because it doesn't have an order unfortunately
                    //message.guild.roles.cache.find(role => role.name === "SDD KING")
                }
            })

            cached_i = 0;
            for(let i = 0; i < sortedNamesCount.length; i++){
                // caching them here to avoid regrabing stuff, readability
                let userName = sortedNamesCount[i][0];
                let result = sortedNamesCount[i][1];
                if(i < 4){
                    const user = message.guild.members.cache.find(member => member.nickname == userName.split(" ")[0]);
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
                                    console.log(user.nickname + " gets the role: 1 " + wantedRoles[1].name)
                                    break;
                                case 1:
                                    user.roles.add(wantedRoles[1]);
                                    console.log(user.nickname + " gets the role: 1 " + wantedRoles[1].name)
                                    break;
                                case 2:
                                    user.roles.add(wantedRoles[2]);
                                    console.log(user.nickname + " gets the role: 2" + wantedRoles[2].name)
                                    break;
                                case 3:
                                    user.roles.add(wantedRoles[3]);
                                    console.log(user.nickname + " gets the role: 3" + wantedRoles[3].name)
                                    break;
                                default:
                                    console.log(user.nickname + " Doesn't get a role!")
                                    break;
                            }
                            
                        }
                        catch (TypeError){
                            console.log(userName.split(" ")[0] + " could not be found")
                        }
                        if(result != sortedNamesCount[i+ii][1]){
                            if(ii == 1 && i == 0){
                                user.roles.add(wantedRoles[0]);
                                console.log(user.nickname + "gets the role: " + wantedRoles[0].name)
                            }
                            cached_i++;
                        }                        
                        break;
                    }

                }
                if (i == sortedNamesCount.length - 1){
                    try {
                        const user = message.guild.members.cache.find(member => member.nickname == userName.split(" ")[0]);
                        user.roles.add(wantedRoles[4])
                    }
                    catch (TypeError){
                        console.log(userName.split(" ")[0] + " could not be found")
                    }
                }
            }
        }
 
        message.channel.send(leaderboardString)
    }
} 