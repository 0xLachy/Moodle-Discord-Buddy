const puppeteer = require('puppeteer');
const { LismLogin } = require("../../util/functions");

module.exports = {
    name: "getassignment",
    aliases: ["getass", "gs"],
    usage: "getassignment (<index>) OR getassignment [filter (<nameOrSubstringOfAssignment>)] or getassignment [all] ", 
    //TODO the term that it gets is based on the date in the year!!! that way future discord classes can use it
    //TODO maybe set the urls as an array (t1, t2, t3)
    //TODO DEFINITELY ADD UNDONE option
    description: "Gets an assignment based on index or by name, if you use name it will get all that contain the " +
    "name you enter e.g T1W7 will return all for that week",
    category: "info",
    permissions: [],
    devOnly: false,
run: async ({client, message, args}) => {
    //write code here
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();

    URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897";
    var filter = false;
    
    //bypass loginscreen
    await LismLogin(page, URL)
    for(let i = 0;i < args.length; i++){
        let arg = args[i].toLowerCase();
        arg = arg.replace("-", "");
        if(arg == "filter" || arg == "f"){
            //instead call the function but as a filter
            filter = true;
        }
        else if(arg == "all"){
            //return all assignments for the term, maybe pass in term to get assignments
        }
        else{
            //call the main function with the index and compare if it is string or numb
        }
    }

    GetAllAssignments(page)
}
}
/*

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
}*/
async function GetAllAssignments(page, term_url="https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897"){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    await page.goto(term_url)
    // console.log(await page.content())

    await page.click('#id_date_enabled');

    // submit form amd wait for navigation to a new page
    await Promise.all([
        page.click('#id_submitbutton'),
        page.waitForNavigation(),
    ]);

    //To get every assignment (header)
    //h3:has(> img 	[title="Assignment"])
    //<h3></h3>
    //<table
    //table
    //table
    // assignmentObject = {};
    //dom failed to execute, not a valid selector
    // var people;
    //await page.waitForSelector('table.assignment-recent')
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    //THE PROBLEM WAS ASYNC, I NEED TO USE MAP OR SOMETHING TO MAKE SURE THE ARRAY PUSH STUFF IS FIXED
    assignmentObject = await page.evaluate(() => {   
        // Array.from(document.querySelectorAll('h3:has(> img[title="Assignment"]) > a'), element => element.textContent)
        //Array.from(document.querySelectorAll('h3:has(> img[title="Assignment"]) > a'), element => element.textContent)
        //Array.from(document.querySelectorAll('a'), element => element.textContent)
        // await players.reduce(async (a, player) => {
        //     // Wait for the previous item to finish processing
        //     await a;
        //     // Process this item
        //     await givePrizeToPlayer(player);
        //   }, Promise.resolve());
        
        console.log(document.querySelector('table.assignment-recent'))
        // allTheh3 = [].filter.call( document.querySelectorAll('h3'), function( elem ){
        //     return elem.querySelector('img[title="Assignment"]')
        // });
        tempAssignmentObject = {}
        for (elem of document.querySelectorAll('h3')){
            if(elem.querySelector('img[title="Assignment"]')){
                titleString = elem.querySelector("a").textContent
               // assignmentObject.titleString = [
                //people = $elem.nextUntil("h3").map(tableElem => tableElem.querySelector("a").textContent)
                var sibs = [];
                //var nextElem = elem.parentNode.firstChild;
                // console.log(elem + " is elem")
                var nextElem = elem;
                //console.log(elem.parentNode.toUpperCase())
                // elem = nextElem 
                // console.log(nextElem.nextElementSibling + "is sibling")
                while(nextElem = nextElem.nextSibling){
                   // console.log(Selem.nodeName)
                    if (nextElem.nodeName == "H3") break; // if H3 that is end of next siblings
                    if (nextElem.nodeType === 3) continue; // ignore text nodes
                    //if (nextElem === elem) continue; // ignore elem of target
                                sibs.push(nextElem.querySelector('div > a').textContent);
                                // element.textContent
                            // }
                            elem = nextElem;
                        // }
                   // }
                }
                // console.log(titleString + " is setting people" + sibs[0])
                tempAssignmentObject[titleString] = sibs;               
                // console.log(sibs)
                
            }
        }
        return tempAssignmentObject;
        //This is another method of geting elem, don't know what's better
        // arrayOfH3 = Array.from(document.querySelectorAll('h3'));
        // arrayOfH3.reduce(async (a, elem) => {
        //     await a
        //     //CODE STILL BROKEN
        //     if(elem.querySelector('img[title="Assignment"]')){
        //         titleString = elem.querySelector("a").textContent
        //        // assignmentObject.titleString = [
        //         //people = $elem.nextUntil("h3").map(tableElem => tableElem.querySelector("a").textContent)
        //         var sibs = [];
        //         //var nextElem = elem.parentNode.firstChild;
        //         var nextElem = elem;
        //         //console.log(elem.parentNode.toUpperCase())
        //         elem = nextElem
        //         while(nextElem = nextElem.nextSibling){
        //            // console.log(Selem.nodeName)
        //             if (nextElem.nodeType === 3) continue; // ignore text nodes
        //             //if (nextElem === elem) continue; // ignore elem of target
        //             //if (nextElem === elem.nextElementSibling) {
        //                 //filtering
        //                 //debugger;

        //                 if (nextElem.nodeName.toUpperCase()!= "H3" || true) {
        //                     //EVEN THOUGH THE CONSOLE LOGS H3 IT F*CKING STILL PUSHES IT WTF
        //                     if(String(nextElem.nodeName).toUpperCase() != "H3"){
        //                         console.log(String(nextElem.nodeName).toUpperCase() + " was the one to get in")

        //                         sibs.push(nextElem);
        //                     }
        //                     elem = nextElem;
        //                 }
        //            // }
        //         }
        //         console.log(sibs)
                
        //     }
        // })
    });
    // #yui_3_17_2_1_1654513134108_85 > div:nth-child(6) > h3:nth-child(5) > img [alt="Assignment"]
    //In order to check if someone has done assignment I need to maybe make and object for them {t2w6 railroad: false};
    console.log(assignmentObject)
}
// jQuery (optional selector filter)
//$el.nextAll($filter);

// Native (optional filter function)
function GetNextSiblings(elem, filter) {
        var sibs = [];
        var nextElem = elem.parentNode.firstChild;
        do {
            if (nextElem.nodeType === 3) continue; // ignore text nodes
            if (nextElem === elem) continue; // ignore elem of target
            if (nextElem === elem.nextElementSibling) {
                if (!filter || filter(elem)) {
                    sibs.push(nextElem);
                    elem = nextElem;
                }
            }
        } while(nextElem = nextElem.nextSibling)
        return sibs;
    }