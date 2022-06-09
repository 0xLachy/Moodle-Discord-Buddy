const puppeteer = require('puppeteer');
const { MessageEmbed } = require('discord.js');
const { LismLogin, NicknameToRealName } = require("../../util/functions");
//TODO this all works fine and dandy, except it is slow, it might be good to cache the stuff and then have a -update to update cache
module.exports = {
    name: "getassignment",
    aliases: ["getass", "gs", "getassignments"],
    usage: "!getassignment [t1 or t2 or t3] (<person>) || !gs filter <string>", 
    //TODO the term that it gets is based on the date in the year!!! that way future discord classes can use it
    //TODO assignment object has the assignments nested by term
    //TODO have other filter options maybe?
    description: "Get unfinished assignments for a person. By default it returns all terms",
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
        var assignmentObject = {};

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
                filter = true; //to stop the other default stuff happening
                i++;
                allAssignments = [].concat.call(await GetAllAssignments(page, T1URL, false), await GetAllAssignments(page, T2URL, false))
            
                SendEmbedMessage(allAssignments.filter(assignment => assignment.toLowerCase().includes(args[i]?.toLowerCase())), 
                message, "null", "Filtered Assignments");
            }
            //might make this the defualt arg tbh 
            else if(arg == "all"){   
                // assignmentObject = {...await GetAllAssignments(page, T1URL), 
                // ...await GetAllAssignments(page, T2URL)} 
                assignmentObject["Term 1"] = await GetAllAssignments(page, T1URL);
                assignmentObject["Term 2"] = await GetAllAssignments(page, T2URL);
            }//Getting by term
            else if(arg == "t1" || arg == "term1"){
                assignmentObject["Term 1"] = await GetAllAssignments(page, T1URL)
            }
            else if(arg == "t2" || arg == "term2"){
                assignmentObject["Term 2"] = await GetAllAssignments(page, T2URL)
            }
            else if(arg == "t3" || arg == "term3"){
                assignmentObject["Term 3"] = await GetAllAssignments(page, T3URl)
            }
            else{
                //call the main function with the index and compare if it is string or numb
                inputName = arg;
            }
        }

        inputName = await NicknameToRealName(inputName);
        if(Object.keys(assignmentObject).length === 0 && !filter){
            // assignmentObject = {...await GetAllAssignments(page, T1URL), 
            //     ...await GetAllAssignments(page, T2URL) };
            assignmentObject["Term 1"] = await GetAllAssignments(page, T1URL);
            assignmentObject["Term 2"] = await GetAllAssignments(page, T2URL);
        }
        if(!filter){

            result = await GetAssignmentForPerson(assignmentObject, inputName);
            // console.log(result)
            // console.log(inputName)
            SendEmbedMessage(result, message, inputName)   
        }        
    }
}

async function GetAllAssignments(page, term_url="https://moodle.oeclism.catholic.edu.au/course/recent.php?id=897", pushPeople=true, links=false){
    //await page.goto(term_url, {waitUntil: 'domcontentloaded'});
    await page.goto(term_url)
    // console.log(await page.content())

    await page.click('#id_date_enabled');

    // submit form amd wait for navigation to a new page
    await Promise.all([
        page.click('#id_submitbutton'),
        page.waitForNavigation(),
    ]);

    //Debuging Purposes
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    return await page.evaluate((pushPeople) => {   

        AssignmentObject = {};
        //if not pushing people then just return an array of all the assignments
        AssignmentArray = [];
        for (elem of document.querySelectorAll('h3')){
            if(elem.querySelector('img[title="Assignment"]')){
                //gets the title of the header if it is not a quiz
                titleString = `[${elem.querySelector("a").textContent}](${elem.querySelector("a").getAttribute("href")})`;

                var sibs = [];
                var nextElem = elem;

                while(nextElem = nextElem.nextSibling){
                   // console.log(Selem.nodeName)
                    if (!pushPeople) break;
                    if (nextElem.nodeName == "H3") break; // if H3 that is end of next siblings
                    if (nextElem.nodeType === 3) continue; // ignore text nodes
                    //if (nextElem === elem) continue; // ignore elem of target
                    // console.log(nextElem)
                    sibs.push(nextElem.querySelector('div > a').textContent);
                    elem = nextElem;
                }
                //Key is titlestring, value is array of people's names, if pushpeople is false than it just pushes titlestring
                pushPeople ? AssignmentObject[titleString] = sibs : AssignmentArray.push(titleString)
                //AssignmentObject[titleString] = sibs;                               
            }
        }
        
        if(pushPeople){
            return AssignmentObject;
        }
        else{
            return AssignmentArray;
        }
    }, pushPeople);
}

async function GetAssignmentForPerson(assignments, personName){
    missingAssignments = {};
    for(term of Object.entries(assignments)){
        let [termName, assignmentsObj] = term;
        //sets { Term3: term3}
        //missingAssignments[termName] = term;
        missingAssignments[termName] = [];
        for(assignmentData of Object.entries(assignmentsObj)){
            let [assignment, people] = assignmentData;
            //If they can't be found then it pushes, meaning if you put ZZZZZ it will get all the assignments for the term
            if(!people.some(correctPerson => correctPerson.toLowerCase().includes(personName))){
                missingAssignments[termName].push(assignment);
            }
        }
    }
    //console.log(missingAssignments)
    return missingAssignments;
}

function SendEmbedMessage(missingAssignments, message, personName, title="none", colour="#156385") {
    let embedMsg = new MessageEmbed();
    let messageTooLong = false;
    //TODO use reduce, to add up all the strings in the array and check if it is greater than 1024
    //then set message too long based of that
    if(title != "none"){
        embedMsg.setTitle(title)
    }
    else{
        embedMsg.setTitle(`Missing Assignments for ${personName}`);
    }
    // console.log(missingAssignments)
    //Prints out assignment as field name, and then the people who did the assignment somehow
    if(missingAssignments.constructor.name == "Object"){
        for(term of Object.entries(missingAssignments)){
            //console.log(assignmentData)
            let [termName, assignments] = term;
            //won't work because the second one will be the only one that matters
            AddToMsgString(assignments, termName)
        }
    }
    else{
        //works fine here but try keep them both the same
        AddToMsgString(missingAssignments, "Assignments");
    }
    //If there were no assignments added to the string
    //move into message string function


    embedMsg.setColor(colour);
    //TODO find a way to bypass message restriction of 1024 chars
    //console.log(msgString.length)
    try{
        message.channel.send({ embeds: [embedMsg] });

    }
    catch(DiscordAPIError){
        message.channel.send("Too many assignments missing, the string is too long to send in a discord message")
        
    }
    // if(!messageTooLong){
    // }
    // else{
        //Send the assignments, but not as an embed, maybe check the stringss before adding the embed feilds
    // }

    function AddToMsgString(assignmentArray, fieldName) {
        let msgString = "";
        
        for (assignment of assignmentArray) {
            //for some reason undefined shows up in this for of thing. don't know why
            if (assignment != undefined) {
                msgString += `${assignment}\n`;
            }
        }

        if (msgString == ""){
            if(personName == "null"){
                msgString = "No Assignments Found"
            }
            else{
                msgString = "No Assignments Missing, Congrats :partying_face:"   
            }
        }
        if(msgString.length > 1024){

            const assignmentStrings = msgString.match(/.{1,1024}(\s|$)/g);

            let chunks = []
            let tempStr = ""
            assignmentStrings.forEach((assignChunk) => {
                if(tempStr.length < (1024 - assignChunk.length)){
                    tempStr += assignChunk;
                }
                else{
                    chunks.push(tempStr);
                    tempStr = "";
                }
            })
            if(tempStr != ""){
                chunks.push(tempStr)
            }

            chunks.forEach((biggerChunk, index) => embedMsg.addField(`${fieldName} part ${index+1}`, biggerChunk))
        }
        else{
            //Add the assignments that were done to the message
            embedMsg.addField(fieldName, msgString)
        }

    }
}