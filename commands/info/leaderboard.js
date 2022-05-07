const puppeteer = require('puppeteer');
const { LismLogin } = require("../../util/functions")

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

        message.guild.roles.cache.each(role => {
            // find safer way to check
            // if(role.name != "reminder" && role.name != "@everyone" && role.name != "bump reminder" && role.name != "Lismore Buddy"){
            if(role.name == "SDD KING" || role.name == "SDD EDLER" || role.name == "SDD KNIGHT" || role.name == "SDD SOLDIER" || role.name == "SDD SLACKER" ){
                message.guild.members.cache.each(member => member.roles.remove(role))
            }
        })

        for(let i = 0; i < sortedNamesCount.length;){
            leaderboardString += "\n" + sortedNamesCount[i][0] + " : " + sortedNamesCount[i][1];
            // console.log(sortedNamesCount[i])
            if(setRoles && i < 4){
                //loop through an I until you find one that has a smaller value, if value is greater than 1 can't give out king status 
                let ii;
                for(ii = 1; ii < (sortedNamesCount - i);ii++){
                    if(sortedNamesCount[i][1] != sortedNamesCount[i+ii][1]){
                        break;
                    }
                }
                let cached_i = i;
                for(ii; ii > 0; ii--){
                    try {
                            let user = message.guild.members.cache.find(member => member.nickname == sortedNamesCount[i][0].split(" ")[0]);
                            switch (cached_i) {
                                case 0:
                                    //if there is only one leader
                                    if(ii == 1 && i == 0){
                                        user.roles.add(message.guild.roles.cache.find(role => role.name === "SDD KING"));
                                    }
                                    else{
                                        user.roles.add(message.guild.roles.cache.find(role => role.name === "SDD ELDER"))
                                    }
                                    break;
                                case 1:
                                    user.roles.add(message.guild.roles.cache.find(role => role.name === "SDD ELDER"));
                                    break;
                                case 2:
                                    user.roles.add(message.guild.roles.cache.find(role => role.name === "SDD KNIGHT"));
                                    break;
                                case 3:
                                    user.roles.add(message.guild.roles.cache.find(role => role.name === "SDD SOLDIER"));
                                    break;
                                default:
                                    console.log(user.name + " Doesn't get a role!")
                            }
                            
                        }
                        catch (TypeError){
                            console.log(sortedNamesCount[i][0].split(" ")[0] + " could not be found")
                        }
                        i++;
                }

            }
        }
        message.channel.send(leaderboardString)
    }
} 