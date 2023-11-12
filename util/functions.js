const fs = require("fs");
const { ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ComponentBuilder} = require('discord.js');
const { resolve } = require("path");
const crypto = require("crypto");
const { ConvertName, GetConfigById } = require('../slashcommands/configSlash');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer')
const os = require('os')
require("dotenv").config()

//VARIABLES
const currentTerm = 2;
const contextId = 124194;

//colour stuff
const primaryColour = 0x156385;
const errorColour = 0xFF0000;

//course stuff
const mainStaticUrl = "https://moodle.oeclism.catholic.edu.au";
const dashboardUrl = `${mainStaticUrl}/my/courses.php`

//login stuff
const algorithm = "aes-256-cbc"; 
const loginGroups = {};
const login_db = mongoose.createConnection(process.env.MONGO_URI, {
    dbName: 'Logins'
});
const loginSchema = new mongoose.Schema({
    name: String,
    discordId: String,
    initVector: Buffer,
    Securitykey: Buffer,
    encryptedPassword: String,
}) 
const Login = login_db.model('Logins', loginSchema, 'Logins')

async function GetLoginsFromDatabase() {
    //empty filter to get all of the logins from the db
    let dbLogins = Array.from(await Login.find({}))
    console.log(`${dbLogins.map(loginData => loginData.name).join(', ')} are now logged in`)
    for (const loginUser of dbLogins) {
        loginGroups[loginUser.discordId] = loginUser
        loginGroups[loginUser.discordId].Securitykey = Buffer.from(process.env[loginUser.name], 'binary')
    }
}

//USE LOGIN GROUPS TO GET ID
const getFiles = (path, ending) => {
    return fs.readdirSync(path).filter(f=> f.endsWith(ending))
}

const LoginToMoodle = async (page, config=undefined, TermURL=dashboardUrl, loginDetails=undefined) => {
    // if (TermURL == 'Null') {
    //     console.log(Object.values(await GetCourseUrls(page))[currentTerm - 1])
    //     TermURL = Object.values(await GetCourseUrls(page))[currentTerm - 1]
    // }
    // await page.goto(TermURL);
    await Promise.all([
        // page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.waitForNavigation(),
        page.goto(TermURL),
    ])
    
    if (config != undefined){
        if (loginGroups[config.discordId] != undefined) loginDetails = decrypt(loginGroups[config.discordId]);
    }
    // dom element selectors
    const USERNAME_SELECTOR = 'input#Ecom_User_ID';
    const PASSWORD_SELECTOR = 'input[type="password"]';
    const BUTTON_SELECTOR = 'input[value="Log in"]';

    await page.waitForSelector(USERNAME_SELECTOR, { visible: true, timeout: 60 * 1000}).then((elem) => elem.focus()).catch((err) => console.log(err))
    
    // await page.click(USERNAME_SELECTOR);
    // await page.$eval(USERNAME_SELECTOR, e => e.focus());
    loginDetails != undefined ? await page.keyboard.type(loginDetails.username) : await page.keyboard.type(process.env.MOODLENAME);

    // await page.click(PASSWORD_SELECTOR);
    await page.$eval(PASSWORD_SELECTOR, e => e.focus());
    loginDetails != undefined ? await page.keyboard.type(loginDetails.password) : await page.keyboard.type(process.env.PASSWORD);

    
    let reasonForFailure = '';
    await Promise.all([
    // page.click(BUTTON_SELECTOR),
    page.$eval(BUTTON_SELECTOR, b => b.click()),
    page.waitForNavigation({timeout: 600000, waitUntil: 'networkidle2' }), // takes a while to load
    page.waitForRequest(request => {
        return  request.url().includes(mainStaticUrl) && request.method() === 'GET'
    })
    ]).catch((err) => {
        reasonForFailure = 'Navigation Timed Out';
        console.log(err);
    })
    // all moodle pages should have this

    if(reasonForFailure != '') return new Promise((resolve, reject) => reject(reasonForFailure))
    //more specific way to get
    reasonForFailure = await page.evaluate(() => {
        return document.querySelector('div#instructions')?.textContent//.textContent body -le
    })
    if (reasonForFailure != undefined && TermURL != page.url()) return new Promise((resolve, reject) => reject(reasonForFailure))
    //If they haven't successfully gotten past login to the wanted url, it bugs out for other urls that aren't dashboard url
    else if (TermURL != await page.url() && TermURL == dashboardUrl) return new Promise((resolve, reject) => reject("Login failed or page didn't redirect after login correctly (check dashboardURL)"))
    else {
        //if the login details aren't undefined, but they haven't been logged in yet, then log them in
        if(config.moodleId == null) {
            config.moodleId = await page.evaluate(() => document.querySelector('[data-user-id]').getAttribute('data-user-id'));
            await config.save();
        }
        if (loginDetails != undefined && loginGroups[config.discordId] == undefined) { 
            loginGroups[config.discordId] = { discordId: config.discordId, ...encrypt(loginDetails)}
            const currentUser = loginGroups[config.discordId]
            await SaveSecurityKey(currentUser.name, currentUser.Securitykey)
            const newLogin = new Login({
                name: currentUser.name,
                discordId: config.discordId,
                initVector: currentUser.initVector,
                encryptedPassword: currentUser.encryptedPassword
            })
            //don't save the security key to the database
            // delete newLogin.Securitykey
            await newLogin.save();
            //Get the security Keys from in here
            // loginGroups[discordUserId]
            // loginGroups[discordUserId] = encrypt(loginDetails) 
        };
        return new Promise((resolve, reject) => resolve('Successfully logged in as ' + config.discordId));
    }
}
const LogoutOfMoodle = async (interaction) => {
    const discordUserId = interaction.user.id;
    // if they aren't even logged in yet, tell them so
    if(loginGroups[discordUserId] == undefined) {
        return await interaction.editReply('Couldn\'t log you out because you weren\'t logged in in the first place!')
    }
    Login.deleteOne({ discordId: discordUserId}).then(() => {
        interaction.editReply('You Succesfully logged out!')
        console.log(`${discordUserId} successfully logged out`)
    }).catch((err) => {
        interaction.editReply('Error Logging out of the database!')
        console.log(err)
    })
    await DeleteSecuritykey(loginGroups[discordUserId].name)
    delete loginGroups[discordUserId]
}


const GetCourseUrls = async (page) => {
    if(await page.url() != dashboardUrl){
        await page.goto(dashboardUrl)
    }

    // return await page.waitForSelector('div[class*="block_myoverview"]', (cardDeck => {
    //     const courses = cardDeck.querySelectorAll('a[class*="coursename"]');
    //     const termInfo = {};

    //     for (const course of courses) {
    //         // This is the **child** part that contains the name of the term
    //         termInfo[course.querySelector('span.multiline').textContent.trim()] = { "URL": course.href, "ID": course.querySelector('[data-course-id]').getAttribute("data-course-id")}; // getting an element with the id, then getting that id
    //     }
    //     return termInfo
    // }))

    await page.waitForSelector('div[class*="card-deck"]');
    return await page.$$eval('div[class*="card-deck"] a[class*="coursename"]', (courses) => {
        const termInfo = {};

        for (const course of courses) {
            // This is the **child** part that contains the name of the term
            termInfo[course.querySelector('span.multiline').textContent.trim()] = { "URL": course.href, "ID": course.querySelector('[data-course-id]').getAttribute("data-course-id")}; // getting an element with the id, then getting that id
        }
        return termInfo
    })
    // return await page.waitForSelector('div[class*="card-deck"]', (cardDeck => {
    //     const courses = cardDeck.querySelectorAll('a[class*="coursename"]');
    //     const termInfo = {};

    //     for (const course of courses) {
    //         // This is the **child** part that contains the name of the term
    //         termInfo[course.querySelector('span.multiline').textContent.trim()] = { "URL": course.href, "ID": course.querySelector('[data-course-id]').getAttribute("data-course-id")}; // getting an element with the id, then getting that id
    //     }
    //     return termInfo
    // }))

    try {
        await page.waitForSelector('div[class*="block_myoverview"] div > a[class*="coursename"')
        // await page.waitForSelector('section[role="navigation"]')
    } catch(err){
        console.log("Moodle website has been updated and doesn't work anymore with the bot (or page just didn't load fast enough)")
    }
    
    return await page.evaluate(() => {
        let termInfo = {}
        let aElements = document.querySelectorAll('div[class*="block_myoverview"] div > a[class*="coursename"')//#course-info-container-898-11 > div > div.w-100.text-truncate > a
        for (const aElem of aElements) {
            // This is the **child** part that contains the name of the term
            termInfo[aElem.querySelector('span.multiline').textContent.trim()] = { "URL": aElem.href, "ID": aElem.querySelector('[data-course-id]').getAttribute("data-course-id")}; // getting an element with the id, then getting that id
        }
        return termInfo

    })
}

function AskForCourse(interaction, page, multipleTerms=false){
    // you aren't supposed to put async in new promise but oh well, WHOS GONNA STOP ME!!!
    return new Promise(async (resolve, reject) => {
        //* There is always a user config now, so yeah that should be here
        const config = GetConfigById(interaction.user.id)
        let blackListedUrls = config.settings.courses.BlackListedUrls;
        let defaultDisabledUrls = config.settings.courses.DefaultDisabledUrls;

        const termInfo = await GetCourseUrls(page)
        const termsEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        
        //set the normal title, like this because of edit option
        SetDefaultTitle();

        if (multipleTerms) termsEmbed.setDescription("Click on Terms to disable them, if they are disabled they are grey, click on them again to make them blue, which means they are included!\n\nYou have 15 seconds to set up, or press enter to send it early!")
        // const rows = [ new ActionRowBuilder() ];
        const rows = [];
        // term info is <termname> = [ <url> , <id>]

        // if they are on a single course select, turn this into multiselect button
        // then reset it back
        // const termsForButtons = Object.keys(termInfo);
        // the incrementing will be done wrong
        AddTermsToRows();
        // If allowing multiple, have a enter button and an edit button
        //?I think I might not want to do this if they don't have any courses
        // but I think everyone has courses


        const reply = await interaction.editReply({/*ephemeral: true,*/ embeds: [termsEmbed], components: rows})
    
        const filter = i => i.user.id === interaction.user.id;
        // create collector to handle when button is clicked using the reply
        const collector = await reply.createMessageComponentCollector({ filter, time: 15000 });
        // let updatedButtons = row.components
        //flatten so all the buttons are in the same array because of row.components
        let updatedButtons = rows.slice(0, -1).map(row => row.components).flat();
        let quitEarly = false;
    
        //so I could do rows[rows.length -1].components.find(c => c.customId == 'Edit').Enabled but this is cleaner I think 
        // So if one of the buttons was clicked, then update text
        collector.on('collect', async i => {

            const editingRightNow = rows[rows.length - 1].components.find(c => c.data.custom_id == 'Edit').data.disabled
            // if enter button, stop early
            if(i.customId == 'Enter'){
                if(editingRightNow) {
                    for (const termButton of updatedButtons) {
                        //? now I can either reset, or delete from other lists, idk what is better
                        //TODO refactor this code because is has repeat code that can be shortened down but I am feeling lazy rn
                        const termUrl = termInfo[termButton.data.custom_id].URL
                        const indexInsideDisableList = config.settings.courses.DefaultDisabledUrls.indexOf(termUrl);
                        const indexinsideBlackList = config.settings.courses.BlackListedUrls.indexOf(termUrl);
                        if(termButton.data.style == ButtonStyle.Danger) {
                            // if it is included in disable list, remove it
                            if(indexInsideDisableList != -1) {
                                config.settings.courses.DefaultDisabledUrls.splice(indexInsideDisableList, 1);
                            }
                            // add to the blacklist on the users config if it doesn't exist
                            if(indexinsideBlackList == -1) {
                                config.settings.courses.BlackListedUrls.push(termUrl)
                            }
                        }
                        else if(termButton.data.style == ButtonStyle.Secondary) {
                            //same as the function above but reverse
                            if(indexinsideBlackList != -1) {
                                config.settings.courses.BlackListedUrls.splice(indexinsideBlackList, 1);
                            }
                            if(indexInsideDisableList == -1) {
                                config.settings.courses.DefaultDisabledUrls.push(termUrl)
                            }
                        }
                        else if(termButton.data.style == ButtonStyle.Primary) {
                            //remove from any of the lists entirely
                            if(indexinsideBlackList != -1) {
                                config.settings.courses.BlackListedUrls.splice(indexinsideBlackList, 1);
                            }
                            if(indexInsideDisableList != -1) {
                                config.settings.courses.DefaultDisabledUrls.splice(indexInsideDisableList, 1);
                            }
                        }
                        else {
                            console.log(`Error inside term choice function, the style ${termButton.data.style} did not work in the code, (it is the button ${button.data.label})`)
                        }
                    }
                    collector.resetTimer({ time: 15 * 1000 })
                    SetDefaultTitle();
                    rows.length = 0;
                    AddTermsToRows()
                    await interaction.editReply({embeds: [termsEmbed], components: rows})
                    //? could combine this with a promise with some other stuff if I wanted too
                    await config.save()
                    return i.deferUpdate();
                }
                i.deferUpdate();
                return await collector.stop();
            }   
            else if(i.customId == 'Edit') {
                // edit the embed so the buttons are all deselected and only blacklisted ones are
                // make an option for reset blacklist as well as done or enter
                //* extending the timer out so they have time to edit
                collector.resetTimer({ time: 120 * 1000})
                termsEmbed.setTitle('Course Option Editing');
                termsEmbed.setURL(null);
                termsEmbed.setDescription('Click on the select, if they are red, they will be blacklisted meaning they will not be shown, if they are blue they will be '
                    + 'selected by default (when multi select), grey for unselected by default (but still shown)\n click on the button to cycle colors');

                //resetting the rows because adding the blacklisted ones
                // it also disables the edit button so that
                rows.length = 0;
                AddTermsToRows(true)
                await interaction.editReply({embeds: [termsEmbed], components: rows})
                return await i.deferUpdate();
            }
            else if(i.customId == 'Quit') {
                quitEarly = true
                await collector.stop()
                return resolve(multipleTerms ? [] : null)
            }
            if(!editingRightNow && !multipleTerms) {
                if(config.settings.courses.AutoChangeMain) {
                    config.settings.courses.DefaultMainCourseUrl = termInfo[i.customId].URL
                }
                await i.update({ content: 'Course Chosen, Scraping Now!', components: [], embeds: [] });
                resolve(termInfo[i.customId])
                return await collector.stop()
            }
            // let updatedActionRowComponent = []

            //loop through each action row on the embed and update it accordingly
            await UpdateActionRowButtons(i, editingRightNow);           

            // Respond to the interaction, 
            // and send updated components to the Discord API
            //update it to new updated action row
            // await i.update({components: newActionRowEmbeds})
            // await i.update({components: i.message.components})
            // Update button info because a button has been clicked
            //message components are stored as an array as action rows, but all that matters is the components (The wanted buttons are in the first(only) row)
            // updatedButtons = await i.message.components[0].components;
            // set the buttons to be all the rows but the last one, and map out so it's only their components
            updatedButtons = i.message.components.slice(0, -1).map(compRow => compRow.components).flat();


            // return i;
        });
    
        collector.on('end', collected => {
            if (multipleTerms && !quitEarly) {
                // only in multiple terms is the edit option available
                if(rows[rows.length - 1].components.find(c => c.data.custom_id == 'Edit').disabled) {
                    return reject('Timed out on editing courses')
                }
                // on end, remove the buttons and embed // maybe insteadof content, use a new embed that says the chosen terms
                chosenTermsData = updatedButtons.reduce((chosenTermsData, button) => {
                    // If the Enter button is primary then do button.customId != 'Enter'
                    if(button.data.style == ButtonStyle.Primary) {
                        chosenTermsData[button.data.custom_id] = termInfo[button.data.custom_id]
                    }
                    return chosenTermsData
                }, {})
                
                let analyserEmbed = new EmbedBuilder()
                .setColor(primaryColour)
                .setTitle('Analysing Terms / Courses')
                .setURL(dashboardUrl)
                .setDescription("Going To each Term / Course and Scraping data. The more here, the longer it will take :/ ");
                
                for (const termName of Object.keys(chosenTermsData)) {
                    analyserEmbed.addFields({ name: termName, value: `URL: ${chosenTermsData[termName].URL}` })
                }
                interaction.editReply({components: [], embeds: [analyserEmbed]})

                resolve(chosenTermsData)
            }
            else if(collected.size == 0) {
                // if multiple terms it doesn't get here, if null or undefined it is false
                if(Object.keys(termInfo).includes(config.settings.courses.DefaultMainCourseUrl)) {
                    resolve(config.settings.courses.DefaultMainCourseUrl);
                }
                else {
                    reject("No button was pressed")
                }
            }
            //clean way to delete it, but maybe it's better to just edit the message? 
            // interaction.deleteReply()

            // callback(i.customId);
            // return 
        });

        function AddTermsToRows(editing=false) {
            let termAddedIndex = 0;
            for (const term of Object.keys(termInfo)) {
                // const term = termsForButtons[termIndex]
                // if the term is added, don't bother adding it
                const curTermUrl = termInfo[term].URL;
                // if not editing don't show blacklisted url terms
                if (!editing && blackListedUrls.includes(curTermUrl))
                    continue;
                const rowNumber = Math.floor(termAddedIndex / 3);
                if (rowNumber > rows.length - 1) {
                    // create the thing
                    rows.push(new ActionRowBuilder());
                }
                // let termButton = new ButtonBuilder().setCustomId(term).setLabel(term).setStyle(ButtonStyle.Primary)
                // row.addComponents(termButton)
                rows[rowNumber].addComponents(
                    new ButtonBuilder()
                        .setCustomId(term)
                        .setLabel(term)
                        //* convoluted but basically, if it is blacklisted than make it red, if it is off then grey, otherwise blue for on.
                        //it will only show if 
                        .setStyle(blackListedUrls.includes(curTermUrl) ? ButtonStyle.Danger : defaultDisabledUrls.includes(curTermUrl) ? ButtonStyle.Secondary : ButtonStyle.Primary)
                );
                termAddedIndex++;
            }
            const editRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                .setCustomId('Quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                .setCustomId('Edit')
                .setLabel('Edit')
                .setDisabled(editing)
                .setStyle(ButtonStyle.Danger),
            );

            // if they are editing, have a way for them to save
            if(multipleTerms || editing) {
                editRow.addComponents(
                    new ButtonBuilder()
                    .setCustomId('Enter')
                    // if editing say done otherwise say enter, still handles by enter id
                    .setLabel(editing ? 'Done' : 'Enter')
                    .setStyle(ButtonStyle.Success)
                )
            }

            rows.push(editRow);
        
        }

        function SetDefaultTitle() {
            termsEmbed.setTitle('Term / Courses Select')
            termsEmbed.setDescription("Click on one of the buttons bellow to choose the term, you might need to be logged in if the bot owner isn't in the same course");
            termsEmbed.setURL(dashboardUrl)
        }
    })

}

const NameToID = async (interaction, page, nameToConvert, chosenTerm) => {
        // if it isn't a number then the person needs to be found
        if(isNaN(nameToConvert)){
            //if chosen term is undefined 
            if(!chosenTerm) {
                chosenTerm = await AskForCourse(interaction, page).catch(async (reason) => {
                //If no button was pressed, then just quit
                console.log(reason)
                // await interaction.deleteReply();
                // interaction.editReply({content: reason, embeds: []})
                // await browser.close()
                return null;
                })
                if(chosenTerm == null) return;
            }

            interaction.editReply({ content: `Going to the url ${chosenTerm.URL} to find ${nameToConvert}`, embeds: []})
            // use zero because it returns an array for no reason
            await page.goto(`${mainStaticUrl}/user/index.php?page=0&perpage=5000&contextid=${contextId}&id=${chosenTerm.ID}&newcourse`)
            let userUrl = await GetUserUrlByName(page, nameToConvert)
            if(userUrl == null) {
                // If no username found, I should say that and then quit
                await interaction.editReply({content: "No Person Found", embeds: []})
                // browser.close()
                return;
            }
            await page.goto(userUrl) // I am asuming that it actually returns something
            // assuming it returns the data id otherwise it should hopefully be null
            return await page.evaluate(() => document.querySelector('#adaptable-message-user-button').getAttribute('data-userid'))

        }
        else { // if it was an id, just return that, pretty easy
            return nameToConvert;
        }
}
const GetUserUrlByName = async (page, inputName) => {
    return await page.evaluate((cleanedName) => {
        let tableRows = document.querySelectorAll('tr[id*="user-index-participant"]');
        for (trElem of tableRows){
            let personNodes = trElem.querySelectorAll("a")
            for (person of personNodes){
                // includes means they will get the first person and may not be the intended one
                if (person.textContent.toLowerCase().includes(cleanedName)) return person.href
            }
        }
        return null;
    }, await ConvertName(inputName)) 
}

async function UpdateActionRowButtons(i, editingRightNow=false) {
    let newActionRowEmbeds = i.message.components.map(oldActionRow => {
        //create a new action row to add the new data
        updatedActionRow = new ActionRowBuilder();

        // Loop through old action row components (which are buttons in this case) 
        updatedActionRow.addComponents(oldActionRow.components.map(buttonComponent => {
            //create a new button from the old button, to change it if necessary
            newButton = ButtonBuilder.from(buttonComponent);

            //if this was the button that was clicked, this is the one to change!
            if (i.component.customId == buttonComponent.customId) {
                //If the button was a primary button then change to secondary, or vise versa
                if (buttonComponent.style == ButtonStyle.Primary) {
                    newButton.setStyle(ButtonStyle.Secondary);
                }
                else if (buttonComponent.style == ButtonStyle.Secondary) {
                    if(editingRightNow) {
                        newButton.setStyle(ButtonStyle.Danger);
                    }
                    else {
                        newButton.setStyle(ButtonStyle.Primary);
                    }
                }
                else if (buttonComponent.style == ButtonStyle.Danger) {
                    newButton.setStyle(ButtonStyle.Primary)
                }
            }
            return newButton;
        }));
        return updatedActionRow;
    });
    return await i.update({components: newActionRowEmbeds});
}

async function ConvertTime(unsortedTime){
    //boom my own regex! LETS GOOOOOO
    //if its now, just return 0 seconds
    if(unsortedTime == "now"){
        return 0
    }
    var timeArr = unsortedTime.match(/[0-9]+[ a-zA-Z]+/g)?.map(time => {
        //multiply by 60 to get hours to mins, then another 60 to get seconds

        //Not sure of years exist
        if(time.includes("year")){
            //console.log("contains year")
            return time.match(/[0-9]+/g)[0] * 365 * 7 * 24 * 60 * 60;
        }
        else if(time.includes("week")){
            //console.log("contains week")
            return time.match(/[0-9]+/g)[0] * 7 * 24 * 60 * 60;
        }
        else if(time.includes("day")){
           // console.log("contains day")
            return time.match(/[0-9]+/g)[0] * 24 * 60 * 60;
        }
        else if(time.includes("hour")){
            //console.log("contains hour")
            return time.match(/[0-9]+/g)[0] * 60 * 60;
        }
        else if(time.includes("min")){
           // console.log("contains min")
            return time.match(/[0-9]+/g)[0] * 60;
        }
        else if(time.includes("sec")){
            //console.log("contains second: " + time)
            //somehow it is stored as text
            return parseInt(time.match(/[0-9]+/g)[0]);
        }
        else{
            console.log("don't know " + time)
            return time.match(/[0-9]+/g)[0];
        }
    });
    //Adds the seconds together if array is not null
    secondTime = timeArr?.reduce((x,y) => x + y);
    //console.log(secondTime)
    return secondTime;
}

function encrypt(loginDetails){
    // generate 16 bytes of random data
    const initVector = crypto.randomBytes(16);;

    // secret key generate 32 bytes of random data
    const Securitykey = crypto.randomBytes(32);
    
    // the cipher function
    const cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);

    // encrypt the message
    // input encoding
    // output encoding
    let encryptedPassword = cipher.update(loginDetails.password, "utf-8", "hex");

    encryptedPassword += cipher.final("hex");

    // console.log("Encrypted message: " + encryptedData);
    return { name: loginDetails.username, initVector, Securitykey, encryptedPassword }
}

const TemporaryResponse = async (interaction, message, time=1000) => {
    const reply = await interaction.followUp({content: message, fetchReply: true})
    // setTimeout(() => reply.delete(), time);
    setTimeout(() => interaction.webhook.deleteMessage(reply), time);
}

//* IMPORTANT, if interaction hasn't been edit replied yet, it will cause the whole interaction to be deleted :/
const SendConfirmationMessage = async (interaction, message, time=30000) => {
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const confirmationEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Confirmation')
        .setDescription(message)

        const confirmationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('no')
                .setLabel('no')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('yes')
                .setLabel('yes')
                .setStyle(ButtonStyle.Success),
        );
        const reply = await interaction.followUp({content: ' ', embeds:[confirmationEmbed], components:[confirmationRow], fetchReply: true})
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = await reply.createMessageComponentCollector({ filter, time });

        collector.on('collect', async (i) => {
            collector.stop()
            if(i.customId == 'yes') {
                return resolve(true)
            }
            else if(i.customId == 'no') {
                return resolve(false)
            }
        })

        //by default I am going to assume if they forget, don't confirm it cause it is likely something like spending money and they might not want to!
        collector.on('end', collected => {
            // reply.delete();
            //new way to delete messages!
            interaction.webhook.deleteMessage(reply)
            if(collected.size == 0) {
                // submitting ? interaction.deleteReply() : interaction.editReply({components: []})
                return resolve(false); //we finished the function
            }
        });
    })
}
// function decrypt(username, encryptedPassword, Securitykey, initVector){
function decrypt(loginObj){
    // the decipher function
    // const decipher = crypto.createDecipheriv(algorithm, loginObj.Securitykey, loginObj.initVector);
    const decipher = crypto.createDecipheriv(algorithm, loginObj.Securitykey /*Buffer.from(process.env[loginObj.name], 'binary')*/, loginObj.initVector);
    let decryptedData = decipher.update(loginObj.encryptedPassword, "hex", "utf-8");

    decryptedData += decipher.final("utf8");

    return { "username": loginObj.name, "password": decryptedData }
}

async function SaveSecurityKey(moodleName, Securitykey) {
    //*dir needs that extra slash thing before file name
    // fs.writeFile(__dirname + "/SecurityKey.env")
    // console.log('Func called')
    //From stack overflow thanks to AJ https://stackoverflow.com/questions/3459476/how-to-append-to-a-file-in-node
    //Security key is a buffer, I don't know what will happen if I actually try this
    if(process.env[moodleName] == undefined) {
        fs.writeFileSync('.env', `\n${moodleName}="${Securitykey.toString('binary')}"`,  {'flag':'a'},  function(err) {
            if (err) {
                return console.error(err);
            }
        });
    }
    //*this is the security key!!!!
    //Buffer.from(process.env[MoodleName], 'binary')

}

// deleting the security key from the .env file
async function DeleteSecuritykey(moodleName) {
    const data = fs.readFileSync('.env', 'utf-8');
    const newValue = data.replace(new RegExp(`(${moodleName}=")(.+?)(")`, 's'), '');
    fs.writeFileSync('.env', newValue, 'utf-8');
}

// this function was modified from https://www.reddit.com/r/Discordjs/comments/sf00wb/comment/ilt1mgg/
// if options length is zero it will through error
const GetSelectMenuOverflowActionRows = (pageNumber, options, placeholder, quitOption=false, selectCount=1) => {
    if(selectCount > 25) selectCount = 25;
    const RecipientRows = [ GetRecipientSelectMenu(pageNumber, options, placeholder, selectCount) ]
    const moveButtons = GetSelectMenuNextButtons(pageNumber, options.length, quitOption);
    if(moveButtons.components.length > 0) {
        RecipientRows.push(moveButtons)
    }
    return RecipientRows;
}

const GetRecipientSelectMenu  = (pageNumber, options, placeholder='Choose an option', selectCount) => {
    const selectMenu = new SelectMenuBuilder()
    .setCustomId('select')
    .setPlaceholder(placeholder)
    // .addOptions(options.filter((option, i) => i * page < 25 * (page +1) ));
    //This lower bit might be faster but it is giving emoji errors for some reason so yeah idk :P
    for (let i = 25*pageNumber; i < options.length && i < 25 * (pageNumber + 1); i++) {
        selectMenu.addOptions(options[i])
        // selectMenu.addOptions({ label: 'fillter', value: '32424234' + i, description: 'hi'})
    }
    
    if(selectCount > 1) {
        selectMenu.setMaxValues(selectCount)
    }
    return new ActionRowBuilder()
    .addComponents(
        selectMenu
    );
}

const GetSelectMenuNextButtons = (pageNumber, optionLength, quitOption=false) => {
    const buttonActionRow = new ActionRowBuilder()
    if(quitOption) {
        buttonActionRow.addComponents(
            new ButtonBuilder()
                .setCustomId('Quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Danger),
        );
    }
    if (pageNumber>0) {
        buttonActionRow.addComponents(
        new ButtonBuilder()
            .setCustomId('previous_page')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅')
        )
    }
    if (25 * (pageNumber + 1) < optionLength) {
        buttonActionRow.addComponents(
        new ButtonBuilder()
            .setCustomId('next_page')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡')
        )
    }
    return buttonActionRow;
}

const SplitIntoCharSections = async (inpStr, amount=1024) => {
    //return nothing if the input string is nothing
    if(!inpStr) return [];
    const splitStringsNewLines = inpStr.match(/.{1,1024}(\s|$)/g);

    let tempStr = '';
    const chunks = [];
    for (const stringChunk of splitStringsNewLines) {
        if(tempStr.length < (amount - stringChunk.length)) {
            tempStr += stringChunk
        }
        else {
            chunks.push(tempStr)
            tempStr = '';
        }
    }
    // last string might not be added in loop so do that
    if(tempStr != '') {
        chunks.push(tempStr)
    }

    return chunks;
}

const BrowserWithCache = async (headless=false) => {
    // save a cache of commonly used images and stuff, unfortunately it saves cookies :(
    // const userDataDir = os.tmpdir()//path.join(os.tmpdir(), 'puppeteerStuff')
    return await puppeteer.launch({
        // userDataDir,
        headless,
    })
}

module.exports = {
    getFiles,
    LoginToMoodle,
    LogoutOfMoodle,
    GetCourseUrls,
    AskForCourse,
    NameToID,
    ConvertTime,
    UpdateActionRowButtons,
    GetLoginsFromDatabase,
    TemporaryResponse,
    SendConfirmationMessage,
    GetSelectMenuOverflowActionRows,
    SplitIntoCharSections,
    BrowserWithCache,
    loginGroups,
    mainStaticUrl,
}