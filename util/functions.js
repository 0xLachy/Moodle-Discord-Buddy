const fs = require("fs");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle  } = require('discord.js');
const { resolve } = require("path");
const crypto = require("crypto");
const { ConvertName } = require('../slashcommands/configSlash');
const mongoose = require('mongoose');
require("dotenv").config()

//VARIABLES
const currentTerm = 2;
const contextId = 124194;

//colour stuff
const primaryColour = 0x156385;
const errorColour = 0xFF0000;

//course stuff
const mainStaticUrl = "https://moodle.oeclism.catholic.edu.au";
const dashboardUrl = `${mainStaticUrl}/my/index.php`

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
        loginGroups[loginUser.discordId] =  loginUser
        loginGroups[loginUser.discordId].Securitykey = Buffer.from(process.env[loginUser.name], 'binary')
    }
}

//USE LOGIN GROUPS TO GET ID
const getFiles = (path, ending) => {
    return fs.readdirSync(path).filter(f=> f.endsWith(ending))
}

const LoginToMoodle = async (page, discordUserId=undefined, TermURL=dashboardUrl, loginDetails=undefined) => {
    // if (TermURL == 'Null') {
    //     console.log(Object.values(await GetCourseUrls(page))[currentTerm - 1])
    //     TermURL = Object.values(await GetCourseUrls(page))[currentTerm - 1]
    // }
    await page.goto(TermURL);
    
    if (discordUserId != undefined){
        if (loginGroups[discordUserId] != undefined) loginDetails = decrypt(loginGroups[discordUserId]);
    }
    // dom element selectors
    const USERNAME_SELECTOR = '#username';
    const PASSWORD_SELECTOR = '#password';
    const BUTTON_SELECTOR = 'body > div > div > div > div.uk-card-body.uk-text-left > div > div.uk-width-3-4 > form > div.uk-margin.uk-text-right > button';
    
    //TODO USE WAITFORSELECTOR
    try {
        await page.waitForSelector(USERNAME_SELECTOR)
    } catch(err){
        console.logError("login page not working, #Username not found")
        console.log(err)
    }
    
    await page.click(USERNAME_SELECTOR);
    loginDetails != undefined ? await page.keyboard.type(loginDetails.username) : await page.keyboard.type(process.env.MOODLENAME);

    await page.click(PASSWORD_SELECTOR);
    loginDetails != undefined ? await page.keyboard.type(loginDetails.password) : await page.keyboard.type(process.env.PASSWORD);
    // try {
        
    // } catch (error) {
        
    // }
    let reasonForFailure = '';
    await Promise.all([
    page.click(BUTTON_SELECTOR),
    page.waitForNavigation({timeout: 600000}) // takes a while to load
    ]).catch((err) => {
        reasonForFailure = 'Navigation Timed Out';
        console.log(err);
    })

    if(reasonForFailure != '') return new Promise((resolve, reject) => reject(reasonForFailure))
    //more specific way to get
    reasonForFailure = await page.evaluate(() => {
        //
        return document.querySelector('div.uk-alert-danger.uk-text-center.uk-alert > p')?.textContent//.textContent body -le
    })
    if (reasonForFailure != undefined && TermURL != page.url()) return new Promise((resolve, reject) => reject(reasonForFailure))
    //If they haven't successfully gotten past login to the wanted url, it bugs out for other urls that aren't dashboard url
    else if (TermURL != await page.url() && TermURL == dashboardUrl) return new Promise((resolve, reject) => reject("Login Failed, wrong username or password"))
    else {
        //if the login details aren't undefined, but they haven't been logged in yet, then log them in
        if (loginDetails != undefined && loginGroups[discordUserId] == undefined) { 
            loginGroups[discordUserId] = { discordId: discordUserId, ...encrypt(loginDetails)}
            const currentUser = loginGroups[discordUserId]
            await SaveSecurityKey(currentUser.name, currentUser.Securitykey)
            const newLogin = new Login({
                name: currentUser.name,
                discordId: discordUserId,
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
        return new Promise((resolve, reject) => resolve('Successfully logged in as ' + discordUserId));
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
    if(page.url() != dashboardUrl){
        await page.goto(dashboardUrl)
    }

    try {
        await page.waitForSelector('div[class*="block_myoverview"] div > a[class*="coursename"')
    } catch(err){
        console.log("Moodle website has been updated and doesn't work anymore with the bot")
    }
    
    return await page.evaluate(() => {
        let termInfo = {}
        let aElements = document.querySelectorAll('div[class*="block_myoverview"] div > a[class*="coursename"')//#course-info-container-898-11 > div > div.w-100.text-truncate > a
        for (const aElem of aElements) {
            // This is the **child** part that contains the name of the term
            console.log(aElem)
            termInfo[aElem.querySelector('span.multiline').textContent.trim()] = { "URL": aElem.href, "ID": aElem.querySelector('[data-course-id]').getAttribute("data-course-id")}; // getting an element with the id, then getting that id
        }
        return termInfo

    })
}

function AskForCourse(interaction, page, multipleTerms=false){
    // you aren't supposed to put async in new promise but oh well, WHOS GONNA STOP ME!!!
    return new Promise(async (resolve, reject) => {
        const termInfo = await GetCourseUrls(page)
        const termsEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Term / Courses Select')
        .setURL(dashboardUrl)
        .setDescription("Click on one of the buttons bellow to choose the term, you might need to be logged in if the bot owner isn't in the same course");
        
        if (multipleTerms) termsEmbed.setDescription("Click on Terms to disable them, if they are disabled they are grey, click on them again to make them blue, which means they are included!\n\nYou have 15 seconds to set up, or press enter to send it early!")
        const row = new ActionRowBuilder();
        // term info is <termname> = [ <url> , <id>]
        for (const term of Object.keys(termInfo)) {
            // let termButton = new ButtonBuilder().setCustomId(term).setLabel(term).setStyle(ButtonStyle.Primary)
            // row.addComponents(termButton)
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(term)
                    .setLabel(term)
                    .setStyle(ButtonStyle.Primary),
            );	
        }
        // If allowing multiple, have a enter button
        if (multipleTerms){
            row.addComponents(
                new ButtonBuilder()
                .setCustomId('Enter')
                .setLabel('Enter')
                .setStyle(ButtonStyle.Success)
            )           
        }

        const reply = await interaction.editReply({/*ephemeral: true,*/ embeds: [termsEmbed], components: [row]})
    
        const filter = i => i.user.id === interaction.user.id;
        // create collector to handle when button is clicked using the reply
        const collector = await reply.createMessageComponentCollector({ filter, time: 15000 });
        let updatedButtons = row.components
        // console.log(updatedButtons)
    
        // So if one of the buttons was clicked, then update text
        collector.on('collect', async i => {

            if (multipleTerms) {
                // if enter button, stop early
                if(i.customId == 'Enter'){
                    // console.log("Stopped on enter")
                    await collector.stop()
                    return;
                }   
                // let updatedActionRowComponent = []

                //loop through each action row on the embed and update it accordingly
                await UpdateActionRowButtons(i);           

                // Respond to the interaction, 
                // and send updated components to the Discord API
                //update it to new updated action row
                // await i.update({components: newActionRowEmbeds})
                // await i.update({components: i.message.components})
                // Update button info because a button has been clicked
                //message components are stored as an array as action rows, but all that matters is the components (The wanted buttons are in the first(only) row)
                updatedButtons = await i.message.components[0].components;
            }     
            else {
                await i.update({ content: 'Term Chosen, Scraping Now!', components: [], embeds: [] });
                resolve(termInfo[i.customId])
                await collector.stop()
            }
            // return i;
        });
    
        collector.on('end', collected => {
            if (multipleTerms) {
                // on end, remove the buttons and embed // maybe insteadof content, use a new embed that says the chosen terms
                leaderboardData = updatedButtons.reduce((leaderboardData, button) => {
                    // If the Enter button is primary then do button.customId != 'Enter'
                    if(button.data.style == ButtonStyle.Primary) {
                        leaderboardData[button.data.custom_id] = termInfo[button.data.custom_id]
                    }
                    return leaderboardData
                }, {})
                
                let analyserEmbed = new EmbedBuilder()
                .setColor(primaryColour)
                .setTitle('Analysing Terms / Courses')
                .setURL(dashboardUrl)
                .setDescription("Going To each Term / Course and Scraping data. The more here, the longer it will take :/ ");
                
                for (const termName of Object.keys(leaderboardData)) {
                    analyserEmbed.addFields({ name: termName, value: `URL: ${leaderboardData[termName].URL}` })
                }
                interaction.editReply({components: [], embeds: [analyserEmbed]})

                resolve(leaderboardData)
            }
            else if(collected.size == 0) {
                reject("No button was pressed")
            }
            //clean way to delete it, but maybe it's better to just edit the message? 
            // interaction.deleteReply()

            // callback(i.customId);
            // return 
        });
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

async function UpdateActionRowButtons(i) {
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
                    newButton.setStyle(ButtonStyle.Primary);
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
const SendConfirmationMessage = async (interaction, message, time=30000) => {
    return new Promise(async (resolve, reject) => {
        //create an embed instead
        const confirmationEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
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
            if(i.customId == 'yes') {
                reply.delete()
                return resolve(true)
            }
            else if(i.customId == 'no') {
                reply.delete()
                return resolve(false)
            }
        })

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
    SendConfirmationMessage,
    loginGroups,
    mainStaticUrl,
}