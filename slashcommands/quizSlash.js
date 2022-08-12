const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlagsBitField, ComponentType, SlashCommandSubcommandBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const UtilFunctions = require("../util/functions");
const mongoose = require('mongoose')
require("dotenv").config()


let autoSubmit = false;
let showHints = true;

//TODO add a quit to the quiz select screen
//TODO fix timeouts on stuff like choose a quiz and displays
//TODO maybe implement a user settings thing that gets saved to the database!!!
//Like I could have the repeat threshold be custom, like some may want if it is 80% or others 100% 
const data = new SlashCommandBuilder()
	.setName('quiz')
	.setDescription('Slash command to handle moodle users, to get their profile data')
    .addBooleanOption(option =>
        option
            .setName('autofill')
            .setDescription("auto fill all of the answers to be correct, if they can't be found in database buttons will be blue")
            .setRequired(false)
    ) 
    .addBooleanOption(option =>
        option
            .setName('auto-submit')
            .setDescription("Swap overview button to become a submit button instead, submits straight away on autofill")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName('repeat')
            .setDescription("repeat the quiz after getting the correct answers (only repeats if not 100%, once)")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName('hints')
            .setDescription('allow hints like button turning green if correct, or red if wrong (blue if unknown)')
            .setRequired(false)
    );

// the way the quizess are stored in the database
const moodleQuizSchema = new mongoose.Schema({
    name: String,
    questions: {
        // type: Map,
        // of: { 
        //     prompt: Array
        // }
    }
})    


module.exports = {
    category: "utility",
    usage: 'Do a quiz from the moodle course (The bot can help you with answers if you need it to)', 
    permissions: [],
    idLinked: true,
    devOnly: false,

    ...data.toJSON(),
    run: async (client, interaction) => {
        await interaction.deferReply(/*{ephemeral: true}*/);

        // const browser = await puppeteer.launch({ headless: false })
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        //Add the autofill function to the page at the start of the script, 
        await page.exposeFunction("GuessOrFillSpecificQuestion", GuessOrFillSpecificQuestion);

        //Login to moodle and catch any errors that occur
        await UtilFunctions.LoginToMoodle(page, await interaction.user.id).catch(reason => {
            console.log(reason);
            interaction.editReply({content: 'Internet was probably too slow and timed out'});
            browser.close();
        })

        //Choose which term to find the quiz list
        let chosenTerm = await UtilFunctions.AskForCourse(interaction, page).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            // whilst this would be nice, if reason is some other error it will break the reply
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })
        
        if(chosenTerm == null) return await interaction.deleteReply();

        //if they don't say if they want it autofilled, it will be false
        const autoFillEverything = await interaction.options.getBoolean('autofill') ?? false;
         
        autoSubmit = await interaction.options.getBoolean('auto-submit') ?? false;
        
        showHints = await interaction.options.getBoolean('hints') ?? true;

        const repeat = await interaction.options.getBoolean('repeat') ?? false;
        
        //* This can't be global because the database needs to be already connected, and at like compile time, that doesn't happen
        const quiz_db = mongoose.createConnection(process.env.MONGO_URI, {
            dbName: 'Quizzes'
        });
        // get the chosen quiz and questions, if any of them return null, just close the browser as it won't be used anymore
        //TODO put in a quit button there
        const chosenQuizzes = await DisplayQuizzes(interaction, await GetQuizzesList(page, chosenTerm.ID));
        if(chosenQuizzes == null || chosenQuizzes.length == 0) return await browser.close();
        
        for (const chosenQuizIndex in chosenQuizzes) {
            //TODO use a for of or something
            const chosenQuiz = chosenQuizzes[chosenQuizIndex]
            let followUpMsg = null;
            if(chosenQuizIndex > 0) {
                await interaction.followUp({content: `Following up with next quiz: ${chosenQuiz.name}`, fetchReply: true}).then(msg => followUpMsg = msg)
                followUpMsg.editReply = followUpMsg.edit;
            }
            
            //for now it is if it didn't get 100%, but it could be a 80, also this can be a doWhile loop :/
            let repeatCounter = 0
            let correctedAnswers = null;
            do {
                repeatCounter++;
                //if the quiz isn't in the database it just returns the same scrapedQuestions :/
                const dataBaseAnswers = await FetchQuizFromDatabase(quiz_db, chosenQuiz.name)
                
                correctedAnswers = await DoQuiz(page, followUpMsg || interaction, chosenQuiz, dataBaseAnswers, autoFillEverything)
                if(correctedAnswers == null) return await browser.close();

                //it will add the answers to the database (if it isn't null)
                await AddQuizDataToDatabase(quiz_db, chosenQuiz.name, correctedAnswers?.questions)
            } while (repeatCounter < 2 && repeat && Number(correctedAnswers.grade) < 100);
            // const correctedAnswers = autoFillEverything === true ? await AutoFillAnswers(interaction, page, chosenQuiz.name, scrapedQuestions) : await DisplayQuestionEmbed(interaction, page, scrapedQuestions, chosenQuiz.name, 0)
        }

        //finished! now to close everything!
        //TODO find out whether or not I need to close other stuff
        await browser.close();
    }
}
const DoQuiz = async (page, interaction, chosenQuiz, dataBaseAnswers, autoFillEverything) => {
    let scrapedQuestions = await GetQuizQuestions(page, chosenQuiz.url, dataBaseAnswers, autoFillEverything)
    if(scrapedQuestions == null) {
        await interaction.editReply({ content: `You have no more attempts left at ${chosenQuiz.name}`, embeds: [], components: []})
        await browser.close(); 
        return null;
    }
    
    //* returning what was const correctedAnswers
    // await DisplayQuestionEmbed(interaction, page, scrapedQuestions, chosenQuiz.name, 0)
    return autoFillEverything ? await DisplayQuizSummary(interaction, page, chosenQuiz.name, scrapedQuestions, true): await DisplayQuestionEmbed(interaction, page, scrapedQuestions, chosenQuiz.name, 0)
}
const AutoFillAnswers = async (interaction, page, quizTitle, scrapedQuestions, lastI) => {
    for (const question of scrapedQuestions) {
        GuessOrFillSpecificQuestion(question);
    }
    // update the the quiz to have the new values
    await UpdateQuizzesWithInputValues(page, scrapedQuestions)
    // then show the summary of what has happened
    return await DisplayQuizSummary(interaction, page, quizTitle, scrapedQuestions, lastI)
}
const GetCorrectAnswersFromResultsPage = async (page, updatedQuestions) => {
    //Got an error from this but everything worked fine for some reason
    await page.waitForSelector('button[type="submit"]').catch(err => console.log(err))
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

const FetchQuizFromDatabase = async (quiz_db, quizTitle) => {
    //create the schema that fetches the questions 
    const MoodleQuiz = quiz_db.model('Moodle', moodleQuizSchema, 'Moodle')
    // await Kitten.find({ name: /^fluff/ });
    const quizAnswers = Array.from(await MoodleQuiz.find({ name: quizTitle }))[0]?.questions;
    // returns undefined if it isn't al
    //if we actually got quiz answers loop through all of the questions and do this
    return quizAnswers;
    //TODO implement that into the other function, or seperate that out
    if (quizAnswers) {
        for (const question of scrapedQuestions) {
            // const correctAnswers = await quizAnswers.get(question.questionName);
            const correctAnswers = await quizAnswers[question.questionName]
            // that is now an array, the questions.answers is also an array (of objects { label })
            // question.answerData.filter(answer => correctAnswers.includes(answer.label))
            if(question.questionType == 'text') {
                //set it to be an array of correct values, because maybe it doesn't care if it has lowercase and all that crap
                question.answerData[0].correctStrings = correctAnswers.correct;
            }
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
    if(correctedQuestions == null) return console.log(quizTitle + ' not saved to the Database!');
    
    // const moodleQuizSchema = new mongoose.Schema({
    //     name: String,
    //     questions: {
    //         // type: Map,
    //         // of: { 
    //         //     prompt: Array
    //         // }
    //     }
    // })

    // console.log(`${correctedQuestions.length} questions are being saved to the database!`)
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
        if(question.questionType == 'text')  {
            // question.answerData[0].label = question.answerData[0].value;
            if(question.answerData[0].correct === true){
                textAnswerString = question.answerData[0].value.toLowerCase();
                newQuiz.questions[question.questionName] = { correct: question.answerData[0].correctStrings }
            }
        }
        {
            const correct = question.answerData.filter(answer => answer.correct === true).map(answer => answer.label);
            // By default we don't want incorrect ones added if it is a radio button (no need -- unless we don't know the correct one yet)
            const incorrect = question.answerData.filter(answer => answer.correct === false && (correct.length == 0 || question.QuestionType === 'checkbox')).map(answer => answer.label)
            // finally add them
            newQuiz.questions[question.questionName] = { correct, incorrect }
        }
    }
    //* this is probably not how to do the replacing, because I am using a schema thing, but oh well
    await MoodleQuiz.replaceOne({ name: quizTitle }, { name: newQuiz.name, questions: newQuiz.questions }, { upsert: true })

    //answers are an array of strings, because order can be changed around
    //'what is recursion' (prompt): [ 'calling a function inside itself', 'a looping mechanism' ]
    

}
//TODO account for quizess with more than 22, (max embeds count)
const DisplayQuizSummary = async (interaction, page, quizTitle, updatedQuestions, preSubmission=true, lastI) => {
    //loops through all the questions and adds them as message fields
    //if it has been submitted add the grade to to title
    let gradePercentAsInt = 100;
    if(autoSubmit && preSubmission) {
        let correctedAnswers = await GetCorrectAnswersFromResultsPage(page, updatedQuestions)
        // display the quiz summary for the last time with the corrected answers
        return await DisplayQuizSummary(interaction, page, quizTitle, correctedAnswers, false);
    }
    //thanks samantha - first one is 20 so take that off the count and just add one to the counter
    let questionLength = updatedQuestions.length- 20;
    // then add any more sets of 25 if quesitonlength isn't 0 or negative
    const embedCount =  1 + (questionLength > 0 ? Math.ceil((questionLength) / 25) : 0)

    const quizSummaryEmbeds = [];
    let questionIndex = 0
    for (let i = embedCount; i > 0; i--) {
        let EmbedTitle = i == embedCount ? quizTitle : `${quizTitle} part ${embedCount - i}`
        // could also add the grade to the title? but that is already in the description elements
        // `${(await page.evaluate(() => document.querySelectorAll('table.quizreviewsummary tr')[4].innerText)).replace('\t', ' ')}`
        let quizSummaryEmbed = new EmbedBuilder()
                .setColor(UtilFunctions.primaryColour)
                .setTitle(EmbedTitle)
                // .setURL(page.url())
                // .setThumbnail(recipientImg)
                //TODO add more to the description  that explains it
                .setDescription('This is a summary of the quiz, it will only show the answers you selected, check that all of the questions have at least one answer, sometimes the answer doesn\'t save (discordAPI issues)');
            ;
    
        if(!preSubmission && i == embedCount) {
            quizSummaryEmbed.addFields(await page.evaluate(() => {
                let summaryFields = []
                for (const tableRow of document.querySelectorAll('table.quizreviewsummary tr')) {
                    summaryTitle = tableRow.querySelector('th').textContent;
                    //could use that title like if(summaryTitle == "Grade") only that inline... or something along those lines
                    summaryFields.push({ name: summaryTitle, value: tableRow.querySelector('td').textContent.trim(), inline: true })
                }
                return summaryFields
            }))

            const gradeString = quizSummaryEmbed.data.fields.find(field => field.name == 'Grade').value
            // const percentageIndex = gradeString.indexOf('%')
            // gradePercentAsInt = gradeString.substring(percentageIndex - 2, percentageIndex)
            const gradeMatch = gradeString.match(/\d+(\.\d+)?%/)
            //just pretend that it is 100 because it couldn't get the grade
            gradePercentAsInt = gradeMatch ? gradeMatch[0].replace('%', '') : 100

        }
        
        // when it is the first embed, only go up to 20, otherwise 25
        let divisableNumber = i == embedCount ? 25 : 20 

        do {
            if (questionIndex >= updatedQuestions.length) break;
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
                        questionAnswersString += answer.value ? answerWithSymbol : '[]'
                    }
                }
                else {
                    if(question.questionType == 'text' && answer.reason) {
                        questionAnswersString += answer.reason.trim();
                    }
                    else if (answer.value && question.questionType != 'text') {
                        questionAnswersString += answer.correct === true ? `[ ${answer.label} ✓ ` : answer.correct === false ? `[ ${answer.label} X ` : `[ ${answer.label} `
                        questionAnswersString += answer.reason ? `${answer.reason.trim()}]` : '] '
                    }
                }
                //seperates the questions out a bit better
                questionAnswersString += '\n'
            }
            if(questionAnswersString == '') questionAnswersString = 'No Value Entered';
            if(question.outcome) questionAnswersString += `\n${question.outcome}`;
            if(question.questionName.length <= 256) {
                quizSummaryEmbed.addFields({ name: `${Number(questionIndex) + 1} ${question.questionName}`, value: questionAnswersString })
            }
            else {
                quizSummaryEmbed.addFields({ name: `${Number(questionIndex) + 1} Question: `, value: `${question.questionName}\n ${questionAnswersString}` })
            }
            // next time in the while loop it will be a new question
            questionIndex++;

            // if that returns 0 it becomes a falsy which means it hit the cap off embeds
            // the plus one is because the index starts at 0
        } while ((questionIndex + 1) % divisableNumber)
        quizSummaryEmbeds.push(quizSummaryEmbed)
    }
    //as long as it is not 0
    const buttonMoveRow = preSubmission ?  [ CreateMoveRow(3, 'Submit!') ] : [] // CreateMoveRow(3, 'Done')
    // let promises = [ interaction.editReply({ embeds: [quizSummaryEmbed], components: buttonMoveRow, files: []}) ]
    // if (lastI) promises.push( lastI.update({ files: []}).catch(err => console.log(err)) )
    // await Promise.all(promises)
    if(lastI) await lastI.update({ files: []}).catch(err => console.log(err))
    await interaction.editReply({ content: ' ', embeds: quizSummaryEmbeds, components: buttonMoveRow, files: []}) 
    
    let channel = await interaction.channel
    //If the channel isn't inside the guild, you need to create a custom cd channel
    if(!interaction.inGuild()){
        channel = await interaction.user.createDM(); 
    }
    const collector = await channel.createMessageComponentCollector({ time: 180 * 1000 });
    // The back buttonn won't work for this because this function won't be called again
    let failed = false;
    //don't submit if they didn't click the submit, but it auto - dones
    // let correctedAnswers;
    if(preSubmission){
        //TODO, leave final questions as is because inside the waitfornextorback is a call to this function which runs before this finishes,
        //whats happening is that when autofill is clicked it calls the display quiz summary again, but this hasn't even finished yet so..
        // let finalQuestions = await WaitForNextOrBack(collector, interaction, page, updatedQuestions, quizTitle, !preSubmission).catch(() => failed=true);
        return await WaitForNextOrBack(collector, interaction, page, updatedQuestions, quizTitle, !preSubmission).catch(() => failed=true);
        // if it failed, they didn't submit and return nothing as they timed out
        //TODO remove the component buttons when it times out
        if(failed) return null;

        //TODO  I need to return something

        // let correctedAnswers = await GetCorrectAnswersFromResultsPage(page, finalQuestions)
        //I DON"T UNDERSTAND WHY IT GOES PAST THIS OUTER PRESUBMISSION BLOCK, THEN IT HOPS BACK UP AFTER THE RETURN UPDATED QUESTIONS TO HERE
        // if(preSubmission) return await DisplayQuizSummary(interaction, page, quizTitle, correctedAnswers, false)
    }
    else {
        //if it has already been submitted the updated questions will be the correct ones
        return { 
            grade: gradePercentAsInt,
            questions: updatedQuestions
        };
    }
}

//back applies -1 to question Index, whilst next adds 1, simple
const DisplayQuestionEmbed = async (interaction, page, scrapedQuestions, quizName,  questionIndex) => {
    return new Promise(async (resolve, reject) => {
        // await interaction.editReply({components: []})
        const questionData = scrapedQuestions[questionIndex]
        let quizStartEmbed = new EmbedBuilder()
            .setColor(UtilFunctions.primaryColour)
            .setTitle(questionData.questionName)
            // .setURL(page.url())
            // .setThumbnail(recipientImg)
            .setDescription(questionData.questionPrompt || 'Type the answer into this channel');
        ;
        let quizImgAttachment;
        if (questionData.questionImg != undefined) {
            const imgSrc = await page.goto(questionData.questionImg)
            const imgBuffer = await imgSrc.buffer();
            quizImgAttachment = new AttachmentBuilder(imgBuffer).setName(`questionImg.png`).setDescription('Img for the current question')
            // quizStartEmbed.setImage(`attachment://${quizImgAttachment.name}`);
            quizStartEmbed.setImage(`attachment://questionImg.png`);
            // quizStartEmbed.attachFiles(quizImgAttachment)
            // quizStartEmbed.setImage(quizImgAttachment)
            // const file = new AttachmentBuilder('../assets/discordjs.png');
            	// .setImage('attachment://discordjs.png');
            // quizStartEmbed.setImage(questionData.questionImg)
            await page.goBack()
        }

        const buttonMoveRow = CreateMoveRow(questionIndex, 'Next', questionData.questionType == 'text')
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
                if(answerButtonStyle == ButtonStyle.Primary && showHints){
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
            // let promises = [ interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow]}) ];
            // let promises = quizImgAttachment != null ? [ interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow], files: [quizImgAttachment]}) ] : [ interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow], files: []}) ]
            // if(lastI) promises.push(lastI.update({content: ' '}))
            // if(lastI) await lastI.deferUpdate();
            // await Promise.all(promises)
            // if(lastI) await lastI.update({content: ' '})
            // await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow]})
            quizImgAttachment != null ? await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow], files: [quizImgAttachment]}) : await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow], files: []}) 
                
        }
        else if(questionData.questionType == 'text'){
            // when referring to the correct answers use answers[0].value because this will be the text
            // quizStartEmbed.setDescription('Type The answer into this channel:')
            let answer = questionData.answerData[0].value || 'Not Attemped Yet';
            if (questionData.answerData[0].correctStrings.includes(answer.toLowerCase())) answer += ' ✓'
            // answer = 'not attempted yet'
            quizStartEmbed.addFields({ name: 'Answer', value: answer})
            // let promises = [ interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow]}) ]
            // // if(lastI) promises.push(lastI.update({content: ' '}))
            //TODO CHECK THIS
            if(lastI) await lastI.deferUpdate();
            quizImgAttachment != null ? await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow], files: [quizImgAttachment]}) : await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow]})
            // await Promise.all(promises)
            // await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow]})
            //how to do the text collector
        }
        else {
            console.error('Invalid Quiz Type ' + questionData.questionType);
        }
        
        //TODO maybe it can collect if you type in !save to the channel it will save, or other stuff!
        const msgCollector = await channel.createMessageCollector({ time: 180 * 1000 });
        msgCollector.on('collect', m => {
            if(questionData.questionType == 'text') {
                questionData.answerData[0].value = m.content;
                if(questionData.answerData[0].correctStrings.includes(m.content.toLowerCase())) m.content += ' ✓'
                quizStartEmbed.setFields({ name: 'Answer', value: m.content })
                interaction.editReply({embeds: [quizStartEmbed]})
            }
        });
        // create collector to handle when button is clicked using the channel 180 seconds in mill
        const collector = await channel.createMessageComponentCollector({ time: 180 * 1000 });
        let updatedButtons = buttonAnswerRow.components;
        collector.on('collect', async (i) => {
            if (i.customId == 'Next') {
                // await i.update({ content: ' ' }); // acknowledge it was clicked
                await collector.stop();
                // TODO test if it still stops and stuff
                await msgCollector.stop();
                if (scrapedQuestions.length != questionIndex + 1) {
                    await i.deferUpdate();
                    return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quizName, questionIndex + 1));
                }
                else {
                    //*TODO pass in the correct database answers??? or I can leave them null if it is without the correct adabase
                    await UpdateQuizzesWithInputValues(page, scrapedQuestions)
                    return resolve(await DisplayQuizSummary(interaction, page, quizName, scrapedQuestions, true, i)); // finish the function and return the new updated questions
                }
            }
            else if (i.customId == 'Back') {
                // await i.update({ content: ' ' }); // just acknowledge the button click
                await collector.stop();
                await msgCollector.stop();
                await i.deferUpdate();
                return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quizName, questionIndex - 1));
            }
            else if (i.customId == 'Quit') {
                await i.update({content: 'Quit Successfully', embeds: [], components: [], files: []})
                await collector.stop();
                await msgCollector.stop()
                return null;
            }
            else if (i.customId == 'Overview') {
                // await i.update({ content: ' '});
                // await i.deferUpdate(); 
                await collector.stop();
                await msgCollector.stop();
                await UpdateQuizzesWithInputValues(page, scrapedQuestions)
                return resolve(await DisplayQuizSummary(interaction, page, quizName, scrapedQuestions, true, i))
                // return resolve(await Promise.all([ UpdateQuizzesWithInputValues(page, scrapedQuestions), DisplayQuizSummary(interaction, page, quizName, scrapedQuestions, true, i)]));
            }
            else if (i.customId == 'AutoFill') {
                if(questionData.questionType == 'text') {
                    let checkedAnswer = true;
                    questionData.answerData[0].value = questionData.answerData[0].correctStrings[0];
                    if(questionData.answerData[0].value == undefined) {
                        questionData.answerData[0].value = Math.floor(Math.random() * 100).toString();
                        checkedAnswer = false;
                    }
                    let AnswerEmbedString = questionData.answerData[0].value
                    if(checkedAnswer) AnswerEmbedString += ' ✓'
                    
                    quizStartEmbed.setFields({ name: 'Answer', value: AnswerEmbedString })
                    interaction.editReply({embeds: [quizStartEmbed]})
                }
                else {
                    let checkedAnswer = true;
                    let correctAnswerIds = await questionData.answerData.filter(answer => answer.correct === true)?.map(answer => answer.answerNumber)
                    // chooses all the correct answers, but if none are found than just add a random one, 
                    //TODO find out why !correctAnswerIds doesn't work, or correctAnswerIds == [] doesn't work
                    if(!correctAnswerIds || correctAnswerIds.length == 0) {
                        correctAnswerIds = questionData.answerData[Math.floor(Math.random() * questionData.answerData.length)].answerNumber ;
                        //that means we don't know if it isn't correct so don't show as green
                        checkedAnswer = undefined;
                    }
                    // if (i.style == ButtonStyle.Secondary)
                    // if(correctAnswers)
    
                    await UpdateActionRowButtonsQuiz(i, correctAnswerIds, checkedAnswer, false, questionData.questionType == 'radio', true);
                    // this is the answer buttons, if it is text it wouldn't have this
                    updatedButtons = await i.message.components[1].components;
                }
            }
            else {
                let checkedAnswer = await questionData.answerData.find(answer => answer.answerNumber === i.customId)?.correct
                await UpdateActionRowButtonsQuiz(i, i.component.customId, checkedAnswer, questionData.answerData.some(answer => answer.correct === true), questionData.questionType == 'radio');
                //this is the answer buttons
                updatedButtons = await i.message.components[1].components;
            }
        });
        collector.on('end', collected => {
            //maybe tell the person that the quiz has timed out if it hasn't loaded
            if(collected.size == 0) {
                console.log("Timed Out On Question")
                return interaction.editReply({content: 'Timed out, answers not saved until you view the summary (overview)!', embeds: [], components: [], files: []})
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

const GetQuizQuestions = async (page, chosenQuizUrl, databaseQuestions, autoFillEverything) => {
    await page.goto(chosenQuizUrl);
    let quizDisabled = await page.evaluate(() => {
        return document.querySelector('button[type="submit"]').textContent == 'Back to the course'
    })
    // if you cant access the quiz, don't bother getting questions
    if(quizDisabled) return null;
    
    await Promise.all([
        page.evaluate(() => document.querySelector('button[type="submit"]').click()),
        //on end querySelectorAll[1] because the second one is the actual full sumbit, that first one is like a retry button
        //but first I have to go back and click
        page.waitForNavigation()
    ])

    await GoBackToStart(page);
    
    // boom that way I have the correct answers, but they need to be passed into next page scrape so that it can answer them as it goes
    // return Updatecorrectness crap(await gotonextpagescrape(page, [] blah))
    return await GoToNextPageScrape(page, [], false, databaseQuestions, autoFillEverything)
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
        for (trElem of tableRows){
            
            // Gets table data elems from rows, then assigns the name to the other data of row, and add profile pic lastly
            tdElems = trElem.querySelectorAll("td");
            //this means that it was graded 
            //if it was not there or complete only is false (so that means do all of them)
            if(tdElems[3].textContent == '') {
                //add the name to the due part of the quizzes
                quizzes['due'].push({ name: tdElems[1].textContent, displayName: tdElems[1].textContent, url: tdElems[1].querySelector('a').href });
            }
            else {
                const total = tdElems[3].textContent;
                quizzes['done'].push({ name: `${tdElems[1].textContent}`, displayName: `${tdElems[1].textContent} ${total}`, url: tdElems[1].querySelector('a').href, total: parseFloat(total) });
            }
        }
        // sort the array so that the lowest scoring ones show first
        quizzes['done'].sort((a, b) => a.total - b.total)
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
        ' If you have hints enabled, when you click an answer the button will turn green or red (correct or false), if the bot doesn\'t know it already it will be blue (normal selected) ' + 
        '\nAlso if you encounter an interaction failed response, just click the button again, sometimes discord doesn\'t record interactions properly :angry: ')
        // .setURL(dashboardUrl)
        // .addFields({})

        //versions = VersionloginData.data.versions.map((version) => ({ value: version, label: version }))
        let selectedOptions = quizzes['due']?.map((quiz) => ({ label: quiz.displayName, description: 'This Quiz is still due', value: quiz.url }));
        selectedOptions = selectedOptions.concat(quizzes['done']?.map((quiz) => ({ label: quiz.displayName, description: 'This Quiz has already been finished', value: quiz.url })));
        const selectRow = new ActionRowBuilder()
            .addComponents(
                new SelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Nothing selected')
                    .setMaxValues(selectedOptions.length)
                    .addOptions(...selectedOptions)
        );

        const quitRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('Quit')
                    .setLabel('Quit')
                    .setStyle(ButtonStyle.Danger) // red 
        );
    
        await interaction.editReply({ content: ' ', embeds: [quizzesEmbed], components: [ selectRow, quitRow ] });  
        
        let channel = await interaction.channel
    
        if(!interaction.inGuild()){
            channel = await interaction.user.createDM(); 
        }
        const collector = await channel.createMessageComponentCollector({ time: 180 * 1000 });
    
        collector.on('collect', async i => {
            if (i.customId == 'Quit') {
                interaction.editReply({ content: 'Quit Successfully', components: [] })
                resolve(null)
            }
            await i.update({ content: `Going to ${i.values.join(', ')} to get quiz questions and attempt now!`, embeds: [], components: []})
            
            // resolve({name: selectedOptions.find(option => option.value === i.values[0]).label, url: i.values[0]})
            let quizOptions = [ ...quizzes['due'], ...(quizzes['done']) ]
            // {name: [ ...quizzes['due'], ...(quizzes['done']) ].find(quizOption => quizOption.url == i.values[0]).name, url: i.values[0]}
            console.log(`The Quizzes: "${i.values.map(selectedUrl => quizOptions.find(quizOption => quizOption.url == selectedUrl).name).join('", "')}" were chosen`)
            resolve(i.values.map(selectedUrl => {
                return {
                    name: quizOptions.find(quizOption => quizOption.url == selectedUrl).name,
                    url: selectedUrl
                }
            }
            ))
            await collector.stop()
        });
    
        collector.on('end', collected => {
            if(collected.size == 0) {
                //make it look better
                interaction.editReply({ content: "Interaction Timed Out", components: []})
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
        let questionDivs = document.querySelectorAll('form div[id*="question"] div.content');
        // let questionDivs = document.querySelectorAll('form div[id*="question"] div.content > div.formulation');
        for (const questionDivContent of questionDivs) {
            updatedQuestion = updatedQuizResponses.find(question => question.questionName == questionDivContent.querySelector('div.qtext').textContent)
            let textAnswer = questionDivContent.querySelector('span.answer input')
            if(textAnswer){
                //set the text value to be the text answer that was given
                // for some reason it is being set to the ethics are question here for some really weird reason
                // textAnswer.value = updatedQuestionsData[questionDivContentIndex].answerData[0].value
                // textAnswer.value = updatedQuestion.answerData[0].value
                if(questionDivContent.querySelector('i[title="Correct"]')){
                    updatedQuestion.answerData[0].correct = true
                    if(!updatedQuestion.answerData[0].correctStrings.includes(updatedQuestion.answerData[0].value)) updatedQuestion.answerData[0].correctStrings.push(updatedQuestion.answerData[0].value)
                } 
                else if(questionDivContent.querySelector('i[title="Incorrect"]')) {
                    updatedQuestion.answerData[0].correct = false
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
                        //note that this is the specific feedback to the answer itself, not as a hole
                        let answerOutcome = answerDiv.querySelector('div.specificfeedback')
                        if(answerOutcome != null){
                            updatedQuestion.answerData[answerDivIndex].reason = answerOutcome?.textContent
                        }
                    }    
                    //set the checked value of the input to be what the discord bot changed it too
                    // answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').checked = updatedQuestion.answerData[answerDivIndex].value
                    
                }

            }

            // undefined if it doesn't exist :/ 
            updatedQuestion.outcome = questionDivContent.querySelector('div.outcome.clearfix div.feedback')?.textContent;

            if(updatedQuestion.outcome) {
                if(updatedQuestion.outcome.includes('The correct answer is:')) {
                    let answerFromOutcome = updatedQuestion.outcome.split('The correct answer is: ')[1]
                    let foundAnswer = updatedQuestion.answerData.find(answer => answer.label == answerFromOutcome)
                    if(foundAnswer) foundAnswer.correct = true
                }
            }
        }

        return updatedQuizResponses;

    }, updatedQuizResponses)
}

const ScrapeQuestionDataFromDivs = async (page, scrapedQuestions, dbAnswers, autoFillEverything=false) => {
    await page.waitForSelector('form div[id*="question"] div.content > div');
    // await page.waitForTimeout(10 * 1000)
    return await page.evaluate(async (scrapedQuestions, dbAnswers, autoFillEverything) => {
        //add all the questions to this
        const questionDivs = document.querySelectorAll('form div[id*="question"] div.content > div');
        const hasAnswers = dbAnswers != {}
        // so that if autofill is enabled it can 
        for (const questionDivContent of questionDivs) {
            //get the name, it has a nested p or many but this should work better!
            const questionName = questionDivContent.querySelector('div.qtext').textContent;
            
            const currentdbAnswer = hasAnswers ? dbAnswers[questionName] : undefined
            //prompt so what type, select one = one, multi and text I guess
            //use this to determine how to get answer data
            //'Select one'

            const questionPrompt = questionDivContent.querySelector('div.prompt')?.textContent;

            //check if it is undefined before using it :/, not all have
            const questionImg = questionDivContent.querySelector('img')?.src;


            // if (questionPrompt == 'Select one or more:') {
            //     //they are checkboxes instead of radios
            //     // but I think it is fine and it still works the same
            // }
            // this is how to do the correct strings, for the text object
            // question.answerData[0].correctStrings = correctAnswers.correct;
            let textAnswer = questionDivContent.querySelector('span.answer input')
            let answerData = []
            let questionType = '';
            if(textAnswer){
                questionType = 'text'
                answerData = [{
                    answerNumber: 0,
                    correct: null,
                    correctStrings: currentdbAnswer?.correct || [], 
                    label: questionDivContent.querySelector('label').textContent,
                    type: 'text',
                    value: questionDivContent.querySelector('span.answer input').value // "erganomic design"
                    //returns 1 for some weird reason but oh well
                }];
            }
            else {
                answerData = Array.from(questionDivContent.querySelectorAll('div.answer div'), (answerDiv, answerNumber) => {
                    const label = answerDiv.querySelector('label').childNodes[1]?.textContent || answerDiv.querySelector('label')?.textContent // only get the label and don't include the answer number
                    const clickableButton = answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"] )')
                    // the new answer will be correct if in correct strings, false if in false strings, or null not in any
                    const newAnswerCorrect = currentdbAnswer?.correct.some(correctString => correctString == label) ? true : currentdbAnswer?.incorrect.some(incorrectString => incorrectString == label) ? false : null
                    //TODO put autofill everything in here, or if autofill everything reset the db answers
                    // if(currentdbAnswer && autoFillEverything) {
                    //     if(currentdbAnswer.correct.some(correctString => correctString == label)){
                    //         clickableButton.value = true;
                    //     }
                    //     else if(currentdbAnswer.incorrect.some(incorrectString => incorrectString == label)){
                    //         clickableButton.value = false;
                    //     }
                    //     //otherwise leave it as it was, unknown value :/, the only problem is 
                    // }

                    //TODo i need to change the value in here with that clickable button thing
                    return {
                        //use array instead of answer number but it says A. and stuff with isn't even a number
                        answerNumber: answerDiv.querySelector('span.answernumber')?.textContent || answerNumber.toString(),
                        correct: newAnswerCorrect,
                        label,
                        type: clickableButton.type,
                        value: clickableButton.checked // boolean
                    };

                });
                //all the buttons should be the same type
                questionType = answerData[0].type;
            }


            //delete this later, trying to find out the names of the types
            scrapedQuestions.push({
                questionName: questionName,
                questionType: questionType,
                questionPrompt: questionPrompt,
                questionImg: questionImg,
                answerData: answerData
            });
        }
        if(autoFillEverything) {
            // scrapedQuestions = scrapedQuestions.map(question => GuessOrFillSpecificQuestion(question))
            for (const questionIndex in scrapedQuestions) {
                //for some reason editing the question in the for of loop doesn't update it inside the
                // actual scraped questions, so using the index and assigning it should work
                let question = scrapedQuestions[questionIndex]
                question = await GuessOrFillSpecificQuestion(question)
                scrapedQuestions[questionIndex] = question
            }
            // page.waitFor(20000)
        }
        return scrapedQuestions;
    }, scrapedQuestions, dbAnswers, autoFillEverything);
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
const GoToNextPageScrape = async (page, scrapedQuestions, updateDivs, dbAnswers={}, autoFillEverything=false) => {
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
        //TODO fix this up, scraped questions is updated here, and if db it will update everything and then edit in update question divs
        if(!updateDivs || dbAnswers) {
            // if updating correctness just edit the scrapedQuestions, other wise add the new scraped questions onto the thing
            scrapedQuestions = scrapedQuestions.concat(await ScrapeQuestionDataFromDivs(page, [], dbAnswers, autoFillEverything))
        }
        if(updateDivs || autoFillEverything){
            //* DO NOT bother putting dbanswers in here, it was wayy too much confusion and was a huge waste of time
           await UpdateQuestionDivs(page, scrapedQuestions) 
        //    await page.evaluate(() => document.querySelector('form div.submitbtns > input[name="next"]').click())
        }
        await Promise.all([
            page.waitForNavigation(),
            page.evaluate(() => document.querySelector('form div.submitbtns > input[name="next"]').click()),
        ])
        //it needs to wait for navigation otherwise the click is undefined, but for some reason updateQuestionDivs sucks
        // return true;
        return await GoToNextPageScrape(page, scrapedQuestions, updateDivs, dbAnswers, autoFillEverything)
    }
    else {
        //then return them
        return scrapedQuestions;
    }
}

function GuessOrFillSpecificQuestion(question) {
    if (question.questionType == 'text') {
        if(question.answerData[0].correctStrings.length > 0) {
            question.answerData[0].value =  question.answerData[0].correctStrings[0]
        }
        if (question.answerData[0].value == undefined) {
            question.answerData[0].value = Math.floor(Math.random() * 100).toString();
        }
        else { // set it to true if it was in the correct strings
            question.answerData[0].correct = true;
        }
    }
    else {
        for (const answer of question.answerData) {
            // the answer is selected if it is true, if it doesn't know, then it will still be false
            answer.value = answer.correct === true;
        }

        //if no answers are found that are true (selected), choose a random one
        if (!question.answerData.some(answer => answer.value === true)) {
            // just select all of them if it is a checkbox, because you usually get a higher grade lol, like no penalty
            if (question.questionType === 'checkbox') {
                for (const questionAnswer of question.answerData) {
                    questionAnswer.value = true;
                }
            }
            else {
                //Sets a random one to be selected (true), if it isn't an incorrect answer, loop through heaps
                let currentAnswer;
                do {
                    currentAnswer = question.answerData[Math.floor(Math.random() * question.answerData.length)]; //= true;
                    if (currentAnswer.correct !== false)
                        currentAnswer.value = true;
                } while (currentAnswer.value === false);
            }
        }
    }
    return question
}

async function WaitForNextOrBack(collector, interaction, page, updatedQuestions, quizName, finish) {
    return new Promise(async (resolve, reject) => {
        await collector.on('collect', async (i) => {
            if (i.customId == 'Next') {
                // await i.update({ content: ' ' }); // acknowledge it was clicked
                await i.deferUpdate();
                await collector.stop();
                if(finish) await interaction.editReply({ components: []})
                let correctedAnswers = await GetCorrectAnswersFromResultsPage(page, updatedQuestions)
                // display the quiz summary for the last time with the corrected answers
                return resolve(await DisplayQuizSummary(interaction, page, quizName, correctedAnswers, false));
                // return resolve(updatedQuestions)
            }
            else if (i.customId == 'Back') {
                // await i.update({ content: ' ' }); // just acknowledge the button click
                // await i.deferUpdate();
                await collector.stop();
                return resolve(await DisplayQuestionEmbed(interaction, page, updatedQuestions, quizName, updatedQuestions.length - 1));
            }
            else if (i.customId == 'AutoFill'){
                // await i.update({content: ' '});
                await i.deferUpdate()
                await collector.stop();
                return resolve(await AutoFillAnswers(interaction, page, quizName, updatedQuestions, i))
            }
            else if (i.customId == 'Quit') {
                await i.update({content: 'Quit Successfully, answers are saved when overview is looked at.', components: [], embeds: []})
                return reject('Quit')
            }
        });
        collector.on('end', collected => {
            //maybe tell the person that the quiz has timed out if it hasn't loaded
            if (collected.size == 0) {
                console.log('the submit view timed out');
                interaction.editReply({ content: 'Timed out! Answers save when visiting overview screen!', components: [], files: [] });
                reject('They didn\'t finish anything')
            }
        });
    })
}

function CreateMoveRow(questionIndex, nextButtonLabel='Next') {
    let newMoveRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('Quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Danger), // red 
            new ButtonBuilder()
                .setCustomId('Back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Danger) // red back 
                .setDisabled(questionIndex == 0), //disabled if it is the first question :)
            new ButtonBuilder()
                .setCustomId('AutoFill')
                .setLabel('AutoFill')
                .setStyle(ButtonStyle.Primary),
                // .setDisabled(nextButtonLabel != 'Next'), // disable if you can't go next
            new ButtonBuilder()
                .setCustomId('Next')
                .setLabel(nextButtonLabel)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('Overview')
                .setLabel(autoSubmit ? 'Submit' : 'Overview')
                .setStyle(ButtonStyle.Success)
                .setDisabled(nextButtonLabel != 'Next')
        ) 
    ;

    return newMoveRow;
}

async function UpdateActionRowButtonsQuiz(i, inputButtonIds, answerResult, hasAnswer, radioButton=false, autoFilling=false) {
    let newActionRowEmbeds = i.message.components.map(oldActionRow => {
        //create a new action row to add the new data
        updatedActionRow = new ActionRowBuilder();

        // Loop through old action row components (which are buttons in this case) 
        updatedActionRow.addComponents(oldActionRow.components.map(buttonComponent => {
            //create a new button from the old button, to change it if necessary
            newButton = ButtonBuilder.from(buttonComponent);
            //if this is one of the buttons we don't want to mutate, just return the button back as it was
            if(newButton.data.custom_id == 'Next' || newButton.data.custom_id == 'Back' || newButton.data.custom_id == 'Quit' || newButton.data.custom_id == 'Overview' || newButton.data.custom_id == 'AutoFill') return newButton;
            //if this was the button that was clicked, this is the one to change!
            if (inputButtonIds.includes(buttonComponent.customId)) {
                //If the button was a primary button then change to secondary, or vise versa
                if (buttonComponent.style == ButtonStyle.Secondary || autoFilling) {
                    if(answerResult === true){
                        newButton.setStyle(ButtonStyle.Success);
                    }// if it was false, or it was a radio button that wasn't the correct answer
                    else if(answerResult === false || ( radioButton && hasAnswer)){
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
            else if(radioButton) {
                newButton.setStyle(ButtonStyle.Secondary)
            }
            return newButton;
        }));
        return updatedActionRow;
    });
    return await i.update({components: newActionRowEmbeds});
}

