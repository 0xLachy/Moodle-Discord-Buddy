const puppeteer = require('puppeteer');
const {MessageEmbed} = require('discord.js');
const {LismLogin} = require("../../util/functions")

module.exports = {
    name: "status",
    category: "info",
    permissions: [],
    devOnly: false,
    run: async ({client, message, args}) => {
        //TODO make context id settable.
        var URL = "https://moodle.oeclism.catholic.edu.au/user/index.php?contextid=123980&id=896&perpage=26";
        var inputNames = [];
        var fuzz;
        var filterArg = "";
        //move pointer to function location
        //#form_autocomplete_input-1653380416775
        classAmount = 26;
        //TODO add nickname through slash command
        const nicknames = {
            "lachy": "lachlan",
            "lachianus": "lachlan",
            "harrisonus": "lachlan",
            "harry": "harrison",
            "poohead": "harrison",
            "teacher": "michael",
            "sddmaster": "harrison",
            "jebidiah": "jeb"
        }

        for(let i = 0;i < args.length; i++){
            let arg = args[i].toLowerCase();
            arg = arg.replace("-", "");  
            if(arg == "fuzz"){
                fuzz = true;
            } 
            else if(arg == "filter"){
                //Increase the arg counter, then get filter, that way it doesn't become a name
                i++;
                // eg. To filter by role you go "Role:-Student"
                filterArg = args[i].replace("-", " ");
            }
            else{
                inputNames.push(arg)
            }
        }

        //convert names from nicknames
        for (let i = 0; i < inputNames.length; i++){
            for (let nickname in nicknames) {
                if(nickname == inputNames[i]){
                    inputNames[i] = nicknames[nickname];
                    break;
                }
            }
        }
        // Starts browser.
        const browser = await puppeteer.launch({ headless: false});
        const page = await browser.newPage();

        // Gets past login screen.
        await LismLogin(page, URL)
        
        if(filterArg != ""){
           // ApplyFilter(filterArg);
          // await page.click("#form_autocomplete_input-1653380416775");
            if(inputNames.length == 0) {
                inputNames.push("filtering");
            }

            // TRIED SO MUCH F*CKING SH*T IT TOOK HOURS FFS
            // for (let i = 0; i < 8; i++) {
            //     await page.keyboard.press('Tab');  
            // }
            // parent div class ||||| d-inline-block position-relative
            //await page.waitForSelector('.form-control');
            //context.browser.find_element_by_css_selector("div.jqx-listitem-element[id^='listitem1innerListBox'] > span")
        //    await page.click("div.d-inline-block position-relative[id^='form_autocomplete_input']");
           // await page.click("[id^='form_autocomplete_input-']");

        // await page.$eval('.form-control', e => e.value = 'text');
        //    await page.evaluate((element) => { element.click(); }, text);
            // form_input =  await page.evaluate((sel) => {
            //     return document.querySelector(sel).textContent;
            // }, `.form-control`);
            // console.log(form_input);
            // console.log(await page.evaluate('document.querySelector(".form_input").getAttribute("Placeholder")'))
            // await page.click("input[id^='form_autocomplete_input']")
           // await page.click("input")
           //await page.focus('input');
      
           



        //   await page.evaluate((element) => { element.click(); }, form_input);
            // console.log("found selecetor")
            // await page.click(".form-control");
           // await page.focus('input[type="text"]' )
           await page.waitForSelector("[id^='form_autocomplete_input']");
        //    try{

        //    }
        //    catch(error){
        //        console.log(error);
        //        console.log("ERROR CLLLLLLLLLLAAAAALED")
        //        await page.click("[id^='form_autocomplete_input']");
        //        await page.keyboard.type(filterArg);
        //    }

           await page.click("[id^='form_autocomplete_input']");
           await page.focus("[id^='form_autocomplete_input']");
           await page.keyboard.type(filterArg);
          // page.waitForTimeout("30000");
           await page.keyboard.press('ArrowDown', {delay: 250});
           await page.evaluate(() => {
            // const filterBox = document.querySelector("[id^='form_autocomplete_input']");
            // const example_options = filterBox.querySelectorAll('option');
            // const selected_option = [...example_options].find(option => option.text == "filterArg");
            console.log(document.querySelector("[id^='form_autocomplete_suggestions'] > li"));
            // selected_option.selected = true;
          });
        //    await page.keyboard.press('ArrowDown')
        //    await page.keyboard.press('ArrowDown')
           //page.waitForTimeout("30000");
          // await page.keyboard.press('Enter')
            // try{ 
            //page.waitForSelector("div > [id^='form_autocomplete_suggestions'] > li");
            // await page.evaluate((filterArg) => {
            // console.log("GOT INSIDE EVAL")
            // const filterBox = document.querySelector("[id^='form_autocomplete_suggestions'][role='listbox']");
            // const example_options = filterBox.querySelectorAll('li');
            // console.log(filterBox.id)
            // // it's basically finding the filter box that has all the roles and stuff then getting the element but the element doesn't exist on the page
            // const selected_option = [...example_options].find(option => option.innerText == filterArg);
            // console.log([...example_options])
            // // [...example_options].find(option => option.innerText == filterArg).click();
            // //[...document.querySelectorAll('.elements button')].find(element => element.textContent === 'Button text').click();
            // //page.click([...example_options].find(option => option.innerText == filterArg))
            // console.log(selected_option);
            // filterBox.firstElementChild.click();
            //selected_option.click()
            //page.click("[id^='form_autocomplete_suggestions'] > li[role='option']")
            //page.click(selected_option.sel);
            //const filterBox = document.querySelector("[role='option']")
            //filterBox.click();
            // console.log(example_options + " IS EXAMPLE OPTIONS")
            // console.log(filterArg + " is filter arg")
            // console.log(filterBox[0] + " example options 0");
            
            // example_options[0].click();
            //console.log(selected_option + " IS EXAMPLE SLECTION THING")
            // selected_option.click();
            // selected_option.selected = true;
            // }, filterArg);
        //    }
                // await page.click("[id^='form_autocomplete_suggestions'] > [role='option']");
            // catch(error){
            //     console.log(error)
            //     console.log("didn't find thing")
            //     await Promise.all([
            //         await page.keyboard.press('Enter'),
            //         page.waitForNavigation()
            //         ])
            // }
        //    unordedList = await page.evaluate((sel) => {
        //     return document.querySelector(sel);
        // }, `[id^='form_autocomplete_input']`);


        }

        for (let inputName in inputNames){
            //need to get the actual name and not the index
            inputName = inputNames[inputName]
            // Loops through each student to get correct one.
            Classloop: for(let i = 0; i < classAmount; i++){
                //just for testing
                break Classloop;
                let username = await page.evaluate((sel) => {
                    return document.querySelector(sel).textContent;
                    }, `#user-index-participants-896_r${i}_c0 > a`);
                let LCUserName = username.toLowerCase();
                if (LCUserName == inputName || LCUserName.split(" ")[0] == inputName 
                || (fuzz && LCUserName.includes(inputName)) || (filterArg != "" && inputName == "filtering")){

                    //Getting the status for each type
                    let statusRole = await GetRole(page, i);
                    let statusGroup = await GetGroup(page, i);
                    let statusOnline = await GetLastOnStatus(page, i);
                    
                    let statusEmbed = new MessageEmbed();
                    statusEmbed.setTitle(username)
                    statusEmbed.addFields(
                        {name: "Roles", value: statusRole},
                        {name: "Groups", value: statusGroup},
                        {name: "Last Online", value: statusOnline}
                    )
                    statusEmbed.setColor("#156385")
                    
                    message.channel.send({embeds: [statusEmbed]})
                    //change it to && after finished testing
                    if(!fuzz && filterArg == ""){
                        console.log("broke loop");
                        break Classloop;
                    }
                }
                // if i is the last person and their name isn't found
                else if(i == classAmount - 1 && !fuzz){
                    message.channel.send(`Couldn't find person: ${inputName}, did you spell their name correctly`)
                }
            }

        }
       // browser.close();
        
    }
} 
// async function ApplyFilter(page, filterString){
//     //clicking on filter box
//     await page.click("#form_autocomplete_input-1653380416775");
//     await page.keyboard.type(filterString);
//     await Promise.all([
//     await page.keyboard.press('Enter'),
//     page.waitForNavigation()
//     ])
// }

async function GetRole(page, i) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-896_r${i}_c1`);
}

async function GetGroup(page, i) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-896_r${i}_c2`);
}

async function GetLastOnStatus(page, i) {
    return await page.evaluate((sel) => {
        return document.querySelector(sel).textContent;
    }, `#user-index-participants-896_r${i}_c3`);
}
