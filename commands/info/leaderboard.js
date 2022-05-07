const puppeteer = require('puppeteer');
// const { getLeaderboard } = require("../../util/functions")

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
        const browser = await puppeteer.launch({
            headless: true
        });
        const page = await browser.newPage();
        var leaderboardString = "The all time leaderboard for 'assignments handed in' is: ";
        var allTerms = true;
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
        }
        await page.goto(URL);
        
        // dom element selectors
        const USERNAME_SELECTOR = '#username';
        const PASSWORD_SELECTOR = '#password';
        const BUTTON_SELECTOR = 'body > div > div > div > div.uk-card-body.uk-text-left > div > div.uk-width-3-4 > form > div.uk-margin.uk-text-right > button';

        await page.click(USERNAME_SELECTOR);
        await page.keyboard.type("lstroh.90");

        await page.click(PASSWORD_SELECTOR);
        await page.keyboard.type(process.env.PASSWORD);
        await Promise.all([
        page.click(BUTTON_SELECTOR),
        page.waitForNavigation()
        ])

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
        // for(let i = 0; i < username_arr.length; i++){
        //     nameOccurrences[username_arr[i]] = (nameOccurrences[username_arr[i]] || 0) + 1;
        // }

        // Create items array
        let sortedNamesCount = Object.keys(nameOccurrences).map(function(key) {
            return [key, nameOccurrences[key]];
        });
        
        // Sort the array based on the second element
        sortedNamesCount.sort(function(first, second) {
            return second[1] - first[1];
        });
        

        for(let i = 0; i < sortedNamesCount.length; i++){
            leaderboardString += "\n" + sortedNamesCount[i][0] + " : " + sortedNamesCount[i][1];
            // console.log(sortedNamesCount[i])
        }
        message.reply(leaderboardString)
    }
} 