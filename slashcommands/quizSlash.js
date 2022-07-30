const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ComponentType, SlashCommandSubcommandBuilder } = require('discord.js');
// const { Embed, ButtonStyle } = require('discord.js');
const puppeteer = require('puppeteer');
// const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const UtilFunctions = require("../util/functions");
const mongoose = require('mongoose')
require("dotenv").config()


//TODO maybe add a guess button that will choose a random button (or 1-4 on multichoice and even guess text (like it'll just say 10 or something like that))
const data = new SlashCommandBuilder()
	.setName('quiz')
	.setDescription('Slash command to handle moodle users, to get their profile data')
    .addStringOption(option =>
        option
            .setName('quiz-name')
            .setDescription("optionally pass in quiz name from the start, not needed")
            .setRequired(false)
    ) 
    .addBooleanOption(option =>
        option
            .setName('hints')
            .setDescription('allow hints like button turning green if correct, or red if wrong (blue if unknown)')
            .setRequired(false)
    );


module.exports = {
    category: "utility",
    usage: 'Do a quiz from the moodle course (The bot can help you with answers if you need it to)', 
    permissions: [],
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {
        await interaction.deferReply(/*{ephemeral: true}*/);
        //DISPLAY ASK FOR DISCORD OR MOODLE QUIZ
        //AskForQuizType(); //do this last probs
        // make sure they are logged in if they want to do moodle
        // if(!UtilFunctions.loginGroups.hasOwnProperty(interaction.user.id)) {
        //     await interaction.editReply("You must login first to use this feature, You can log in here or in direct messages with this bot")
        //     //break out of this function early because they need to be logged in and they aren't
        //     return;
        // }
        // await FetchQuizFromDatabase('T2W2 Social and Ethical Issues QUIZ 32', {})
        // return await interaction.editReply('NOT CODED YET');
        const browser = await puppeteer.launch({ headless: false })
        // const browser = await puppeteer.launch();
        const page = await browser.newPage();
        //console.log(UtilFunctions.GetTermURLS("participants")[courseIDIndex])

        //Login to moodle and catch any errors that occur
        await UtilFunctions.LoginToMoodle(page, await interaction.user.id).catch(reason => {
            console.log(reason);
            interaction.editReply({content: 'Internet was probably too slow and timed out'});
            browser.close();
        })
        //Get the term to use as context id (IT is needed unfortunately)
        let chosenTerm = await UtilFunctions.AskForCourse(interaction, page).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })
        
        if(chosenTerm == null) return await interaction.deleteReply();
        // THIS IS THE QUIZ URL TERM THAT SHOWS ALL quizzes PAGE
        //https://moodle.oeclism.catholic.edu.au/mod/quiz/index.php?id=898
        
        //make function for scraping quizzes from page and display them as embed
        // console.log(await GetQuizzesList(page, chosenTerm.ID))
        const chosenQuiz = await DisplayQuizzes(interaction, await GetQuizzesList(page, chosenTerm.ID));
        if(chosenQuiz.url == null) return await browser.close();
        let scrapedQuestions = await GetQuizQuestions(page, chosenQuiz.url)
        
        const quiz_db = mongoose.createConnection(process.env.MONGO_URI, {
            dbName: 'Quizzes'
        });
        console.log(chosenQuiz.name)
        scrapedQuestions = await FetchQuizFromDatabase(quiz_db, chosenQuiz.name, scrapedQuestions)
        //connect to the quiz part of the database

        //TODO don't use a loop like this use the next and back buttons on the embed itself
        //also disable the back button for the first question, might need a question index value
        // for (const scrapedQuestion of await GetQuizQuestions(page, chosenQuizUrl)) {
        //     await DisplayQuestionEmbed()
        // }
        //need to implement promise because it is returning the displayquestionEmbed as undefined after first next button
        // await AddQuizDataToDatabase(chosenQuiz.name, scrapedQuestions)
        
        // await FetchQuizFromDatabase(chosenQuiz.name)
        const correctedAnswers = await DisplayQuestionEmbed(interaction, page, scrapedQuestions, chosenQuiz.name, 0)
        //so after this they will have been updated on the page as well, time to submit!
        // console.log(updatedQuestions)
        //TODO test this thing out!
        console.log(correctedAnswers)
        console.log(chosenQuiz.name)
        await AddQuizDataToDatabase(quiz_db, chosenQuiz.name, correctedAnswers)
        // const correctedAnswers = await GetCorrectAnswersFromResultsPage(page, updatedQuestions)
        // await UpdateQuizzesWithInputValues(page, updatedQuestions)
        // await DisplayQuizSummary(interaction, chosenQuiz.name, updatedQuestions)
        // console.log(chosenQuizUrl)
        //do what you will with that
    }
}
const GetCorrectAnswersFromResultsPage = async (page, updatedQuestions) => {
    // console.log(updatedQuestions)
    await page.waitForSelector('button[type="submit"]')
    await page.evaluate(() => document.querySelectorAll('button[type="submit"]')[1].click())
    // the second submit is the final submit button, the first is to retry.
    await page.waitForSelector('div.confirmation-buttons input.btn-primary');
    await Promise.all([
        page.evaluate(() => document.querySelector('div.confirmation-buttons input.btn-primary').click()),
        page.waitForNavigation()
    ])

    return await UpdateQuestionCorrectnessDivs(page, updatedQuestions);
}

const UpdateQuizzesWithInputValues = async (page, updatedQuestions) => {
    await Promise.all([
        page.evaluate(() => document.querySelector('button[type="submit"]').click()),
        page.waitForNavigation()
    ])
    await GoBackToStart(page);
    await GoToNextPageScrape(page, updatedQuestions, true)
}

const FetchQuizFromDatabase = async (quiz_db, quizTitle, scrapedQuestions) => {
    //create the schema that fetches the 
    const moodleQuizSchema = new mongoose.Schema({
        name: String,
        questions: {
            // type: Map,
            // of: { 
            //     prompt: Array
            // }
        }
    })

    
    const MoodleQuiz = quiz_db.model('Moodle', moodleQuizSchema, 'Moodle')
    // await Kitten.find({ name: /^fluff/ });
    const quizAnswers = Array.from(await MoodleQuiz.find({ name: quizTitle }))[0].questions;
    // returns undefined if it isn't al
    // console.log(quizAnswers)
    //if we actually got quiz answers loop through all of the questions and do this
    if (quizAnswers) {
        for (const question of scrapedQuestions) {
            // const correctAnswers = await quizAnswers.get(question.questionName);
            const correctAnswers = await quizAnswers[question.questionName]
            // that is now an array, the questions.answers is also an array (of objects { label })
            // question.answerData.filter(answer => correctAnswers.includes(answer.label))
            for (const answer of question.answerData) {
                //if the correctAnswers includes the anser it is true, otherwise it is null, because it might also be true but not found yet (stupid checkboxes)
                answer.correct = correctAnswers.correct.includes(answer.label) || null;
                // if the answer is in the incorrect set it to false, otherwise set it to null (if it already doesn't have a value ??= sign)
                answer.correct ??= correctAnswers.incorrect.includes(answer.label) ? false : null
            }

        }
    }

    return scrapedQuestions
    //if it wasn't found that is okay because the values will still be null on the correct and the buttons 
    //will be blue which is pretty clean because on button click that is simplified more :D
    //can use find({thing})[0].questions.get(questionPrompt)
    //but assign the find to a variable because you don't want to make the call every 
    //question, not needed,
    //either add correct or incorrect to the individual answers themselves OR ||
    //set correct answers to be an array with the indexes of the correct answers
}
const AddQuizDataToDatabase = async (quiz_db, quizTitle, correctedQuestions) => {
    //TODO fix this later
    if(correctedQuestions == null) return;
    
    const moodleQuizSchema = new mongoose.Schema({
        name: String,
        questions: {
            // type: Map,
            // of: { 
            //     prompt: Array
            // }
        }
    })


    const MoodleQuiz = quiz_db.model('Moodle', moodleQuizSchema, 'Moodle')
    const newQuiz = new MoodleQuiz({
        name: quizTitle,
        questions: {}
        // questions: {
        //     'TestingThis': ['Answer one', 'Answer 2'],
        //     'recursion': [ 'Loop', 'Calling']
        // }
    })
    //USE SET BECAUSE IT CNA OVERWRITE
    //TODO fix the text answer correct things because it needs to use the label instead stead of whatever
    for (const question of correctedQuestions) {
        if(question.questionType == 'text')  question.answerData[0].label = question.answerData[0].value;
        //if there are no answers that are true than the answers will be an empty array
        //then I guess if checking answers if it is empty than it knows that it is unknown, or if the quiz hasn't been submited yet
        //Set then correctness of the answer strings by category of whether false or true, and if it isn't known yet it will be null so it won't be added to the things
        newQuiz.questions[question.questionName] = { correct: question.answerData.filter(answer => answer.correct === true).map(answer => answer.label), incorrect: question.answerData.filter(answer => answer.correct === false).map(answer => answer.label) }
        // newQuiz.questions.set(question.questionName, { correct: question.answerData.filter(answer => answer.correct === true).map(answer => answer.label), incorrect: question.answerData.filter(answer => answer.correct === false).map(answer => answer.label) })
    }
    //TODO this is probably not how to do the replacing, because I am using a schema thing, but oh well
    await MoodleQuiz.replaceOne({ name: quizTitle }, { name: newQuiz.name, questions: newQuiz.questions }, { upsert: true })

    // await newQuiz.save()
    //answers are an array of strings, because order can be changed around
    //'what is recursion' (prompt): [ 'calling a function inside itself', 'a looping mechanism' ]
    

}
const DisplayQuizSummary = async (interaction, page, quizTitle, updatedQuestions, preSubmission=true) => {
    //loops through all the questions and adds them as message fields
    //gets called on last question of display question embed
    let quizSummaryEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle(quizTitle)
            // .setURL(page.url())
            // .setThumbnail(recipientImg)
            //TODO add more to the description  that explains it
            .setDescription('This is a summary of the quiz, it will only show the answers you selected');
        ;
    for (const questionIndex in updatedQuestions) { // this doesn't work, also put a tick and a cross thing
        const question = updatedQuestions[questionIndex]
        //loop through and add [] to string, but add label if it is selected
        let questionAnswersString = ''   
        for (const answerIndex in question.answerData) {
            const answer = question.answerData[answerIndex];
            //that way if it doesn't know or it is incorrect it won't show
            if(question.questionType == 'text'){
                questionAnswersString += answer.value
                questionAnswersString += answer.correct === true ? ' ✓ ' : answer.correct === false ? ' X ' : ' ';
            }
            if(preSubmission) {
                if (question.questionType != 'text'){
                    let answerWithSymbol = answer.correct === true ? `[${answer.label} ✓] ` : answer.correct === false ? `[${answer.label} X] ` : `[${answer.label}] `
                    // let correctsymbol = await CheckAnswer(quizTitle, updatedQuestions, questionIndex, answerIndex) ? '✓' : undefined
                    //then add in the correctsymbol next to the answer value if it isn't null
                    questionAnswersString += answer.value ? answerWithSymbol : '[] '                
                }
            }
            else {
                if(question.questionType == 'text' && answer.reason) {
                    questionAnswersString += answer.reason;
                }
                else if (answer.value && question.questionType != 'text') {
                    questionAnswersString += answer.correct === true ? `[ ${answer.label} ✓ ` : answer.correct === false ? `[ ${answer.label} X ` : `[ ${answer.label} `
                    questionAnswersString += answer.reason ? `${answer.reason}]` : '] '
                }
            }
        }

        quizSummaryEmbed.addFields({ name: question.questionName, value: questionAnswersString })
    }
    //as long as it is not 0
    const buttonMoveRow = preSubmission ? CreateMoveRow(3, 'Submit!') : CreateMoveRow(3, 'Done')

    interaction.editReply({ embeds: [quizSummaryEmbed], components: [buttonMoveRow]})

    let channel = await interaction.channel
    //If the channel isn't inside the guild, you need to create a custom cd channel
    if(!interaction.inGuild()){
        channel = await interaction.user.createDM(); 
    }
    const collector = await channel.createMessageComponentCollector({ time: 180 * 1000 });
    // The back buttonn won't work for this because this function won't be called again
    let failed = false;
    let finalQuestions = await WaitForNextOrBack(collector, interaction, page, updatedQuestions, quizTitle, !preSubmission).catch(() => failed=true);
    if(failed) return null;
    let correctedAnswers;
    if(preSubmission){
        correctedAnswers = await GetCorrectAnswersFromResultsPage(page, finalQuestions)
        return await DisplayQuizSummary(interaction, page, quizTitle, correctedAnswers, false)
    }

    return finalQuestions;
}

//back applies -1 to question Index, whilst next adds 1, simple
const DisplayQuestionEmbed = async (interaction, page, scrapedQuestions, quizName,  questionIndex) => {
    return new Promise(async (resolve, reject) => {
        const questionData = scrapedQuestions[questionIndex]
        let quizStartEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle(questionData.questionName)
            // .setURL(page.url())
            // .setThumbnail(recipientImg)
            .setDescription(questionData.questionPrompt || 'Type the answer into this channel');
        ;
        if (questionData.questionImg != undefined) {
            quizStartEmbed.setImage(questionData.questionImg)
        }

        const buttonMoveRow = CreateMoveRow(questionIndex)
        ;
        const buttonAnswerRow = new ActionRowBuilder();

        //THE DATA TYPE IS ON THE INDIVIDUAL ANSWER OBJECTS
        //SO THIS WON"T WORK
        //BUT IT ALSO MEANS THAT I CAN USE THAT INSIDE TE LOOP

        //use the type to also determine whether buttons will be multi or single when clicked
        // so the behaviour

        let channel = await interaction.channel
        //If the channel isn't inside the guild, you need to create a custom cd channel
        if(!interaction.inGuild()){
            channel = await interaction.user.createDM(); 
        }

        if(questionData.questionType == 'radio' || questionData.questionType == 'checkbox'){
            // forof
            answerTooLong = questionData.answerData.some(answer => answer.label.length > 80)
            for (const answer of questionData.answerData) {
                //if the button was already selected, then make it blue, otherwise make it grey
                let answerButtonStyle = answer.value ? ButtonStyle.Primary : ButtonStyle.Secondary
                //TODO need to check the answer with the data base answers and set it green or red
                if(answerButtonStyle == ButtonStyle.Primary){
                    if(answer.correct) {
                        answerButtonStyle = ButtonStyle.Success;
                    }
                    else if(answer.correct === false) {
                        answerButtonStyle = ButtonStyle.Danger;
                    }
                }
                let buttonLabel = answer.label;
                if(answerTooLong) { 
                    quizStartEmbed.addFields({ name: answer.answerNumber, value: answer.label})
                    buttonLabel = answer.answerNumber
                }
                buttonAnswerRow.addComponents(
                    new ButtonBuilder()
                    .setCustomId(answer.answerNumber)//answer number cause I don't want it longer than 100 char
                    .setLabel(buttonLabel)
                    .setStyle(answerButtonStyle)
                )
            }

            await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow]})
                
        }
        else if(questionData.questionType == 'text'){
                // when referring to the correct answers use answers[0].value because this will be the text
                //TODO add if statement to show previous value was:
                // quizStartEmbed.setDescription('Type The answer into this channel:')
                let answer = questionData.answerData[0].value || 'Not Attemped Yet';
                //TODO check answer is correct and if it is give it a tick or a cross next to the string
                // answer = 'not attempted yet'
                quizStartEmbed.addFields({ name: 'Answer', value: answer})
                //TODO make a message channel collector here
                // add back adn forword row / component
                await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow]})
                //how to do the text collector
                // interaction.reply({ content: item.question, fetchReply: true })
            // .then(() => {
            //     interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] })
            //         .then(collected => {
            //             interaction.followUp(`${collected.first().author} got the correct answer!`);
            //         })
            //         .catch(collected => {
            //             interaction.followUp('Looks like nobody got the answer this time.');
            //         });
            // });

            //Or use this without the promises
            // `m` is a message object that will be passed through the filter function
                // const filter = m => m.content.includes('discord'); // 2 mins


            // msgCollector.on('end', collected => {
            //     console.log(`Collected ${collected.size} items`);
            //     //TODO maybe do the quiting thing if it is 0
            // });

        }
        else {
            console.error('Invalid Quiz Type ' + questionData.questionType);
        }
        
        //TODO maybe it can collect if you type in !next to the channel it will act like the next button!
        const msgCollector = await channel.createMessageCollector({ time: 180 * 1000 });
        msgCollector.on('collect', m => {
            if(questionData.questionType == 'text') {
                questionData.answerData[0].value = m.content;
    
                quizStartEmbed.setFields({ name: 'Answer', value: m.content })
                interaction.editReply({embeds: [quizStartEmbed]})
            }
        });
        // create collector to handle when button is clicked using the channel 180 seconds in mill
        const collector = await channel.createMessageComponentCollector({ time: 180 * 1000 });
        let updatedButtons = buttonAnswerRow.components;
        collector.on('collect', async (i) => {
            if (i.customId == 'Next') {
                await i.update({ content: ' ' }); // acknowledge it was clicked
                await collector.stop();
                // TODO test if it still stops and stuff
                await msgCollector.stop();
                if (scrapedQuestions.length != questionIndex + 1) {
                    return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quizName, questionIndex + 1));
                }
                else {
                    await UpdateQuizzesWithInputValues(page, scrapedQuestions)
                    return resolve(await DisplayQuizSummary(interaction, page, quizName, scrapedQuestions)); // finish the function and return the new updated questions
                }
            }
            else if (i.customId == 'Back') {
                await i.update({ content: ' ' }); // just acknowledge the button click
                await collector.stop();
                await msgCollector.stop();
                return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quizName, questionIndex - 1));
            }
            else if (i.customId == 'Overview') {
                await i.update({ content: ' '});
                await collector.stop();
                await UpdateQuizzesWithInputValues(page, scrapedQuestions)
                return resolve(await DisplayQuizSummary(interaction, page, quizName, scrapedQuestions));
            }
            else {
                // await UtilFunctions.UpdateActionRowButtons(i)
                // let checkedAnswer = true;
                //TODO check that this works
                let checkedAnswer = await questionData.answerData.find(answer => answer.answerNumber === i.customId)?.correct
                await UpdateActionRowButtonsQuiz(i, checkedAnswer, questionData.questionType == 'radio');
                //this is the answer buttons
                updatedButtons = await i.message.components[1].components;
            }
        });
        collector.on('end', collected => {
            //maybe tell the person that the quiz has timed out if it hasn't loaded
            if(collected.size == 0) {
                console.log("No button was pressed")
                //todo maybe save the answers that were changed
                interaction.editReply({content: 'Timed out, answers not saved!', embeds: [], components: []})
            }
            else if (questionData.questionType != 'text') {
                //update the question by button values accordingly
                for (const buttonIndex in updatedButtons) {

                    const button = updatedButtons[buttonIndex];

                    if(button.data.style == ButtonStyle.Secondary) {
                        questionData.answerData[buttonIndex].value = false
                    }
                    else {
                        questionData.answerData[buttonIndex].value = true;
                    }

                }

            }
        });
    })
}

const GetQuizQuestions = async (page, chosenQuizUrl) => {
    await page.goto(chosenQuizUrl);
    await Promise.all([
        page.evaluate(() => document.querySelector('button[type="submit"]').click()),
        //on end querySelectorAll[1] because the second one is the actual full sumbit, that first one is like a retry button
        //but first I have to go back and click
        page.waitForNavigation()
    ])

    await GoBackToStart(page);
 
    return await GoToNextPageScrape(page, [], false)
}

const GetQuizzesList = async (page, termID) => {
    try {
        await page.goto(`${UtilFunctions.mainStaticUrl}/mod/quiz/index.php?id=${termID}`)    
    } catch (error) {
        console.log('page url is not working')
        return null; // no quizzes found
    }

    //INITIATE SCRAPING
    //#region-main > div > table
    //TODO UPDATE STATUS TO QUIZ
    await page.waitForSelector('#region-main > div > table > tbody > tr')

    return await page.evaluate(() => {
        let quizzes = {
            'due': [],
            'done': []
        };

        let tableRows = document.querySelectorAll('#region-main > div > table > tbody > tr');//#yui_3_17_2_1_1658806562256_56 > table > tbody
        console.log(tableRows)
        for (trElem of tableRows){
            
            // Gets table data elems from rows, then assigns the name to the other data of row, and add profile pic lastly
            tdElems = trElem.querySelectorAll("td");
            //this means that it was graded 
            //if it was not there or complete only is false (so that means do all of them)
            if(tdElems[3].textContent == undefined) {
                //add the name to the due part of the quizzes
                quizzes['due'].push({ name: tdElems[1].textContent, url: tdElems[1].querySelector('a').href });
            }
            else {
                quizzes['done'].push({ name: `${tdElems[1].textContent}`, displayName: `${tdElems[1].textContent} ${tdElems[3].textContent}`, url: tdElems[1].querySelector('a').href });
            }
            }
        return quizzes
        // return arrOfEveryone;
    })
}

const DisplayQuizzes = async (interaction, quizzes) => {
    return new Promise(async (resolve, reject) => {
        const quizzesEmbed = new EmbedBuilder()
        .setColor(UtilFunctions.primaryColour)
        .setTitle('Available Quizzes')
        .setDescription('Choose a Quiz from the select menu, you can redo the quizzes you have already done if you want to.' + 
        ' If you have hints enabled, when you click an answer the button will turn green or red (correct or false), if the bot doesn\'t know it already it will be blue (normal selected)')
        // .setURL(dashboardUrl)
        // .addFields({})
        //versions = VersionloginData.data.versions.map((version) => ({ value: version, label: version }))
        let selectedOptions = quizzes['due']?.map((quiz) => ({ label: quiz.displayName, description: 'This Quiz is still due', value: quiz.url }));
        // console.log(selectOptions.concat(['this', 'that']))
        selectedOptions = selectedOptions.concat(quizzes['done']?.map((quiz) => ({ label: quiz.displayName, description: 'This Quiz has already been finished', value: quiz.url })));
        
        const row = new ActionRowBuilder()
            .addComponents(
                new SelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Nothing selected')
                    .addOptions(...selectedOptions),
            );
    
        await interaction.editReply({ content: ' ', embeds: [quizzesEmbed], components: [row] });  
        
        let channel = await interaction.channel
    
        if(!interaction.inGuild()){
            channel = await interaction.user.createDM(); 
        }
        const collector = channel.createMessageComponentCollector({ time: 30000 });
    
        collector.on('collect', async i => {
            await i.update({ content: `Going to ${i.values[0]} to get quiz questions and attempt now!`, embeds: [], components: []})
            // console.log(i)
            
            // resolve({name: selectedOptions.find(option => option.value === i.values[0]).label, url: i.values[0]})
            resolve({name: [ ...quizzes['due'], ...(quizzes['done']) ].find(quizOption => quizOption.url == i.values[0]).name, url: i.values[0]})
            await collector.stop()
        });
    
        collector.on('end', collected => {
            if(collected.size == 0) {
                resolve(null)
            }
        });
    });
}
const UpdateQuestionDivs = async (page, updatedQuestionsData) => {
    await page.waitForSelector('form div[id*="question"] div.content > div');

    await page.evaluate((updatedQuestionsData) => {
        let questionDivs = Array.from(document.querySelectorAll('form div[id*="question"] div.content > div'));
        for (const questionDivContent of questionDivs) { 
            // const questionDivContent = questionDivs[questionDivContentIndex];
            updatedQuestion = updatedQuestionsData.find(question => question.questionName == questionDivContent.querySelector('div.qtext').textContent)
            let textAnswer = questionDivContent.querySelector('span.answer input')
            if(textAnswer){
                //set the text value to be the text answer that was given
                // console.log(updatedQuestionsData[questionDivContentIndex])
                // for some reason it is being set to the ethics are question here for some really weird reason
                // textAnswer.value = updatedQuestionsData[questionDivContentIndex].answerData[0].value
                textAnswer.value = updatedQuestion.answerData[0].value
            }
            else {
                const answerDivs = Array.from(questionDivContent.querySelectorAll('div.answer div'));
                for (const answerDivIndex in answerDivs) {
                    const answerDiv = answerDivs[answerDivIndex];
                    //set the checked value of the input to be what the discord bot changed it too
                    answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').checked = updatedQuestion.answerData[answerDivIndex].value
                    
                }
            }


        }
    }, updatedQuestionsData)
}

const UpdateQuestionCorrectnessDivs = async (page, updatedQuizResponses) => {
    await page.waitForSelector('form div[id*="question"] div.content > div');
    //I think they just need page
    return await page.evaluate((updatedQuizResponses) => {
        let questionDivs = document.querySelectorAll('form div[id*="question"] div.content > div.formulation');
        for (const questionDivContent of questionDivs) {
            updatedQuestion = updatedQuizResponses.find(question => question.questionName == questionDivContent.querySelector('div.qtext').textContent)
            let textAnswer = questionDivContent.querySelector('span.answer input')
            if(textAnswer){
                //set the text value to be the text answer that was given
                // console.log(updatedQuestionsData[questionDivContentIndex])
                // for some reason it is being set to the ethics are question here for some really weird reason
                // textAnswer.value = updatedQuestionsData[questionDivContentIndex].answerData[0].value
                // textAnswer.value = updatedQuestion.answerData[0].value
                if(questionDivContent.querySelector('i[title="Correct"]')){
                    updatedQuestion.answerData[0].correct = true
                } 
                else if(questionDivContent.querySelector('i[title="Incorrect"]')) {
                    updatedQuestion.answerData[0].correct = false
                }
                let outcome = questionDivContent.nextElementSibling
                // console.log(questionDivContent.nextSibling)
                if(outcome) {
                    console.log(outcome)
                    // updatedQuestion.answerData[0].reason = outcome.querySelector('div.specificfeedback').textContent
                }
                
            }
            else {
                const answerDivs = Array.from(questionDivContent.querySelectorAll('div.answer div[class*="r"]'));
                for (const answerDivIndex in answerDivs) {
                    const answerDiv = answerDivs[answerDivIndex];
                    let answerDivClass = answerDiv.getAttribute('class').toLowerCase()
                    
                    //|| answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]')?.type == 'radio'
                    updatedQuestion.answerData[answerDivIndex].correct ??= answerDivClass.includes('incorrect') ? false : answerDivClass.includes('correct') ? true : null;
                    if(updatedQuestion.answerData[answerDivIndex].correct != null) {
                        let outcome = answerDiv.querySelector('div.specificfeedback')
                        console.log(outcome)
                        // if(outcome != null){
                        //     updatedQuestion.answerData[answerDivIndex].reason = outcome?.textContent
                        // }
                    }    
                    //set the checked value of the input to be what the discord bot changed it too
                    // answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').checked = updatedQuestion.answerData[answerDivIndex].value
                    
                }
            }


        }

        return updatedQuizResponses;

    }, updatedQuizResponses)
}

const ScrapeQuestionDataFromDivs = async (page) => {
    await page.waitForSelector('form div[id*="question"] div.content > div');

    // await page.waitForTimeout(10 * 1000)
    return await page.evaluate(() => {
        //add all the questions to this
        // return;
        let scrapedQuestions = [];
        let questionDivs = document.querySelectorAll('form div[id*="question"] div.content > div');
        // console.log(questionDivs)
        for (const questionDivContent of questionDivs) {
            //get the name, it has a nested p or many but this should work better!
            let questionName = questionDivContent.querySelector('div.qtext').textContent;

            //prompt so what type, select one = one, multi and text I guess
            //use this to determine how to get answer data
            //'Select one'
            let questionPrompt = questionDivContent.querySelector('div.prompt')?.textContent;

            //check if it is undefined before using it :/, not all have
            let questionImg = questionDivContent.querySelector('img')?.src;


            // if (questionPrompt == 'Select one or more:') {
            //     //they are checkboxes instead of radios
            //     // but I think it is fine and it still works the same
            // }
            let textAnswer = questionDivContent.querySelector('span.answer input')
            let answerData = []
            let questionType = '';
            if(textAnswer){
                questionType = 'text'
                answerData = [{
                    answerNumber: 0,
                    correct: null,
                    label: questionDivContent.querySelector('label').textContent,
                    type: questionDivContent.querySelector('span.answer input').type,
                    value: questionDivContent.querySelector('span.answer input').value // "erganomic design"
                    //returns 1 for some weird reason but oh well
                }];
            }
            else {
                answerData = Array.from(questionDivContent.querySelectorAll('div.answer div'), answerDiv => {
                    return {
                        //use array instead of answer number but it says A. and stuff with isn't even a number
                        answerNumber: answerDiv.querySelector('span.answernumber').textContent,
                        correct: null,
                        label: answerDiv.querySelector('label').childNodes[1].textContent, // only get the label and don't include the answer number
                        type: answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').type,
                        value: answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').checked // boolean
                        //TODO differentiate between radio and that
                    };
                });
                questionType = answerData[0].type;
            }


            //delete this later, trying to find out the names of the types
            // console.log(questionType)
            scrapedQuestions.push({
                questionName: questionName,
                questionType: questionType,
                questionPrompt: questionPrompt,
                questionImg: questionImg,
                answerData: answerData
            });
        }

        // console.log(scrapedQuestions)
        return scrapedQuestions;
    });
}


//It may potentially not load properly the first run through but meh
const GoBackToStart = async (page) => {
    backButtonWasClicked = await page.evaluate(() => {
        let backButton = document.querySelector('form div.submitbtns > input[name="previous"]');
        if (backButton != undefined) {
            backButton.click();
            return true;
        }
        else {
            return false;
        }
    })
    if(backButtonWasClicked) {
        await page.waitForNavigation();
        //recursion, keep going back until the start
        await GoBackToStart(page);
    }

}
const GoToNextPageScrape = async (page, scrapedQuestions, updateDivs) => {
    //FINISH IS ALSO A NEXT BUTTON
    nextButtonExists = await page.evaluate(() => {
        let nextButton = document.querySelector('form div.submitbtns > input[name="next"]');
        if (nextButton != null) {
            // nextButton.click();
            return true;
        }
        else {
            return false;
        }
    });
    if(nextButtonExists) {
        //keep adding to the scraped questions sent
        if(updateDivs){
           await UpdateQuestionDivs(page, scrapedQuestions) 
        //    await page.evaluate(() => document.querySelector('form div.submitbtns > input[name="next"]').click())
        }
        else {
            // if updating correctness just edit the scrapedQuestions, other wise add the new scraped questions onto the thing
            scrapedQuestions = scrapedQuestions.concat(await ScrapeQuestionDataFromDivs(page))
        }
        await Promise.all([
            page.waitForNavigation(),
            page.evaluate(() => document.querySelector('form div.submitbtns > input[name="next"]').click()),
        ])
        //it needs to wait for navigation otherwise the click is undefined, but for some reason updateQuestionDivs sucks
        // return true;
        return await GoToNextPageScrape(page, scrapedQuestions, updateDivs)
    }
    else {
        // console.log(scrapedQuestions)
        // console.log('HIEEONEn')
        //then return them
        return scrapedQuestions;
    }
}

async function WaitForNextOrBack(collector, interaction, page, updatedQuestions, quizName, finish) {
    return new Promise(async (resolve, reject) => {
        await collector.on('collect', async (i) => {
            if (i.customId == 'Next') {
                await i.update({ content: ' ' }); // acknowledge it was clicked
                await collector.stop();
                if(finish) interaction.editReply({ components: []})
                return resolve(updatedQuestions)
            }
            else if (i.customId == 'Back') {
                await i.update({ content: ' ' }); // just acknowledge the button click
                await collector.stop();
                return resolve(await DisplayQuestionEmbed(interaction, page, updatedQuestions, quizName, updatedQuestions.length - 1));
            }
        });
        collector.on('end', collected => {
            //maybe tell the person that the quiz has timed out if it hasn't loaded
            if (collected.size == 0) {
                console.log("No button was pressed");
                //todo maybe save the answers that were changed
                interaction.editReply({ content: 'Timed out!', components: [] });
                reject('They didn\'t finish anything')
            }
        });
    })
}

function CreateMoveRow(questionIndex, nextButtonLabel='Next') {
    let newMoveRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('Back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Danger) // red back 
                .setDisabled(questionIndex == 0) //disabled if it is the first question :)
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId('Next')
                .setLabel(nextButtonLabel)
                .setStyle(ButtonStyle.Success)
        )
    ;
        // an overview button if there are still nexts available
    if(nextButtonLabel == 'Next'){
        newMoveRow.addComponents(
        new ButtonBuilder()
            .setCustomId('Overview')
            .setLabel('Overview')
            .setStyle(ButtonStyle.Primary)
        );
    }

    return newMoveRow;
}

async function UpdateActionRowButtonsQuiz(i, answerResult, radioButton=false) {
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
                if (buttonComponent.style == ButtonStyle.Secondary) {
                    if(answerResult === true){
                        newButton.setStyle(ButtonStyle.Success);
                    }// if it was false, or it was a radio button that wasn't the correct answer
                    else if(answerResult === false || radioButton){
                        newButton.setStyle(ButtonStyle.Danger);
                    }
                    else { // I think it will be for null in here by default but like maybe check this TODO
                        newButton.setStyle(ButtonStyle.Primary);
                    }          
                }
                else {
                    //if it wasn't secondary then set it to secondary, cause it was already selected
                    newButton.setStyle(ButtonStyle.Secondary);
                }
            }
            else if(radioButton && newButton.data.custom_id != 'Next'  && newButton.data.custom_id != 'Back' && newButton.data.custom_id != 'Overview') {
                newButton.setStyle(ButtonStyle.Secondary)
            }
            // console.log(newButton)
            return newButton;
        }));
        return updatedActionRow;
    });
    return await i.update({components: newActionRowEmbeds});
}

