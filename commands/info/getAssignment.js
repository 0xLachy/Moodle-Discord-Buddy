const puppeteer = require('puppeteer');
const {MessageEmbed} = require('discord.js');
const { LismLogin } = require("../../util/functions");
//TODO this all works fine and dandy, except it is VERY slow, it might be good to cache the stuff and then have a -update to update cache
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
    // const browser = await puppeteer.launch({headless: false});
    const browser = await puppeteer.launch();

    const page = await browser.newPage();
    //later, if no person is called, try use their discord nickname, otherwise tell them to provide person name
    inputName = "lachlan";
    //undefined (on purpose)
    var assignmentObject;

    T1URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=896";
    T2URL = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897";
    T3URl = "https://moodle.oeclism.catholic.edu.au/course/recent.php?id=898";

    var filter = false;
    
    
    //bypass loginscreen
    //the login URL doesn't really matter becuase getAssignments visits a different page anyways
    await LismLogin(page, T2URL)
    //TODO have one to just return assignments for a week

    for(let i = 0;i < args.length; i++){
        let arg = args[i].toLowerCase();
        arg = arg.replace("-", "");
        if(arg == "u" || arg == "updatecache" || arg == "update"){
            //TODO right code to update cache, maybe use mongo db for permanent cache
        }
        else if(arg == "filter" || arg == "f"){
            //instead call the function but as a filter
            filter = true;
        }
        //might make this the defualt arg tbh 
        else if(arg == "all"){   
            assignmentObject = {...await GetAllAssignments(page, T1URL), 
            ...await GetAllAssignments(page, T2URL) }
        }//Getting by term
        else if(arg == "t1" || arg == "term1"){
            assignmentObject = await GetAllAssignments(page, T1URL)
        }
        else if(arg == "t2" || arg == "term2"){
            assignmentObject = await GetAllAssignments(page, T2URL)
        }
        else if(arg == "t3" || arg == "term3"){
            assignmentObject = await GetAllAssignments(page, T3URl)
        }
        else{
            //call the main function with the index and compare if it is string or numb
            inputName = arg;
        }
    }
    //TODO make this all terms instead
    if(assignmentObject == undefined){
        assignmentObject = {...await GetAllAssignments(page, T1URL), 
            ...await GetAllAssignments(page, T2URL) }
    }
    //returns array of assignments unfinished probably in order
    //TODO put this straight into the sendEmbed message after finishing console logging
    result = await GetAssignmentForPerson(assignmentObject, inputName);
    console.log(result)
    // console.log(inputName)
    SendEmbedMessage(result, message, inputName)
    
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
    return await page.evaluate(() => {   

        
        // console.log(document.querySelector('table.assignment-recent'))
        // allTheh3 = [].filter.call( document.querySelectorAll('h3'), function( elem ){
        //     return elem.querySelector('img[title="Assignment"]')
        // });
        AssignmentObject = {}
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
                AssignmentObject[titleString] = sibs;               
                // console.log(sibs)
                
            }
        }
        return AssignmentObject;
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
}

async function GetAssignmentForPerson(assignments, personName){
    missingAssignments = [];
    //need a for of but for dictionary
    // for (assignment of assignments){
        
    // }
            // Object.entries(customNicknamesObj).forEach(entry => {
        //     const [key, value] = entry;
        //     console.log(key, value);
        //   });
    for(assignmentData of Object.entries(assignments)){
        let [assignment, people] = assignmentData;
        //If they can't be found then it pushes, meaning if you put ZZZZZ it will get all the assignments for the term
        if(!people.some(correctPerson => correctPerson.toLowerCase().includes(personName))){
            missingAssignments.push(assignment);
        }
    }
    return missingAssignments;
}

function SendEmbedMessage(missingAssignments, message, personName, title="none", colour="#156385") {
    let embedMsg = new MessageEmbed();
    //check if data is obj or array
    //console.log(participantData.constructor.name);

    /*
    "Missing Assignments for $personName"
    assignment += thing "blah blah \n"
    */
    if(title != "none"){
        embedMsg.setTitle(title)
    }
    else{
        embedMsg.setTitle(`Missing Assignments for ${personName}`);
    }

    let msgString = "";

    for(assignment of missingAssignments){
        // console.log(assignment)
        if(assignment != undefined){
            msgString += `${assignment}\n`;
        }
    }
    if (msgString == ""){
        msgString = "No Assignments Missing, Congrats :partying_face:"
    }
    //TODO have a field for each person or something instead

    embedMsg.addField("Assignments", msgString)

    embedMsg.setColor(colour);
    message.channel.send({ embeds: [embedMsg] });
}