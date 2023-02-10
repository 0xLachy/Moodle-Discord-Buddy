const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlagsBitField, ComponentType, SlashCommandSubcommandBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const UtilFunctions = require("../util/functions");
const { primaryColour, dailyQuizTokensPerQuestion } = require("../util/constants");
const mongoose = require('mongoose');
require("dotenv").config()

let autoSubmit = false;
let showHints = true;
const submitButtonSelector = 'button[type=Submit].btn-primary';

// TODO create your own quiz option, provides a link for images, + and - button for the options, they can click on it to make it true or false
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
    .addIntegerOption(option =>
        option
            .setName('repeat-amount')
            .setDescription('repeats until above the threshold (in config default 90%)')
            .setRequired(false)
            .addChoices(
				{ name: '1', value: 1 },
				{ name: '2', value: 2 },
				{ name: '3', value: 3 },
                { name: '5', value: 5 },
			)
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
    run: async (client, interaction, config) => {
        await interaction.deferReply(/*{ephemeral: true}*/);
        // const browser = await puppeteer.launch({ headless: false })
        const browser = await UtilFunctions.BrowserWithCache();
        const page = await browser.newPage();

        //? Testing out adding config to interaction because that is used everywhere
        interaction.userConfig = config;

        const quizConfig = config?.settings['quiz']
        //Add the autofill function to the page at the start of the script, 
        await page.exposeFunction("GuessOrFillSpecificQuestion", GuessOrFillSpecificQuestion);

        //Login to moodle and catch any errors that occur
        await UtilFunctions.LoginToMoodle(page, config).catch(reason => {
            console.log(reason);
            interaction.editReply({content: 'Internet was probably too slow and timed out, or something went wrong with your login'});
            browser.close();
        })

        //Choose which term to find the quiz list
        const chosenTerms = await UtilFunctions.AskForCourse(interaction, page, true).catch(reason => {
            //If no button was pressed, then just quit
            console.log(reason)
            // whilst this would be nice, if reason is some other error it will break the reply
            // interaction.editReply({content: reason, embeds: []})
            browser.close()
            return null;
        })
        
        if(chosenTerms == null || chosenTerms.length == 0) {
            browser.close();
            return await interaction.deleteReply();
        }
        //if they don't say if they want it autofilled, it will be false
        const autoFillEverything = await interaction.options.getBoolean('autofill') ?? false;
         
        autoSubmit = await interaction.options.getBoolean('auto-submit') ?? quizConfig?.AutoSubmit ?? false;
        
        showHints = await interaction.options.getBoolean('hints') ?? quizConfig?.ShowHints ?? true;

        const repeatThreshold = quizConfig?.repeatThreshold ?? 90

        let repeatAmount = await interaction.options.getInteger('repeat-amount') ?? quizConfig?.repeatAmount ?? 1;
        
        //* This can't be global because the database needs to be already connected, and at like compile time, that doesn't happen
        const quiz_db = mongoose.createConnection(process.env.MONGO_URI, {
            dbName: 'Quizzes'
        });
        // get the chosen quiz and questions, if any of them return null, just close the browser as it won't be used anymore
        const chosenQuizzes = await DisplayQuizzes(interaction, await GetQuizzesList(page, Object.values(chosenTerms).map(term => term.ID)), config, quizConfig?.ShowAlreadyCompletedQuizzes);
        if(chosenQuizzes == null || chosenQuizzes.length == 0) return await browser.close();

        for (const chosenQuizIndex in chosenQuizzes) {
            const chosenQuiz = chosenQuizzes[chosenQuizIndex]
            if(chosenQuiz?.daily) repeatAmount = 1;

            let followUpMsg = null;
            if(chosenQuizIndex > 0) {
                await interaction.followUp({content: `Following up with next quiz: ${chosenQuiz.name}`, fetchReply: true}).then(msg => followUpMsg = msg)
                followUpMsg.editReply = followUpMsg.edit;
            }
            
            //for now it is if it didn't get 100%, but it could be a 80, also this can be a doWhile loop :/
            let correctedAnswers = null;
            do {
                repeatAmount--;
                //if the quiz isn't in the database it just returns the same scrapedQuestions :/
                const dataBaseAnswers = await FetchQuizFromDatabase(quiz_db, chosenQuiz.name)
                
                correctedAnswers = await DoQuiz(page, followUpMsg || interaction, chosenQuiz, dataBaseAnswers, autoFillEverything)
                if(Array.isArray(correctedAnswers) || correctedAnswers == null) {
                    if(config?.settings.general.AutoSave) {
                        await UpdateQuizzesWithInputValues(page, correctedAnswers[0])
                    }
                    return await browser.close();
                }
                //it will add the answers to the database (if it isn't null)
                await AddQuizDataToDatabase(quiz_db, chosenQuiz.name, correctedAnswers?.questions)
                if(correctedAnswers != null) {
                    //they did a quiz, so add to the counter!
                    config.stats.QuizzesCompleted++;
                    //if they were doing the daily also add that!
                    if(chosenQuiz?.daily) {
                        //increment the daily quizzes, update the last complete date too
                        config.stats.DailyQuizzesCompleted++;
                        config.stats.DailyQuizzesDoneToday++;
                        //don't need to mark changes unless calling the function like .setDate()
                        config.stats.DailyQuizLastComplete = Date.now();
                        // config.markModified('config.stats.DailyQuizLastComplete')
                        //give them moodle money reward
                        config.tokens += dailyQuizTokensPerQuestion * correctedAnswers.questions.length;
                        await interaction.followUp({content: `Congrats you earned $${dailyQuizTokensPerQuestion * correctedAnswers.questions.length} moodle money :partying_face:, your balance is now $${config.tokens}`, ephemeral: true})
                    }
                }
                // using truthy, once repeat amount reaches 0 it fails could use != 0 instead
            } while (repeatAmount && Number(correctedAnswers.grade) < repeatThreshold);
            // const correctedAnswers = autoFillEverything === true ? await AutoFillAnswers(interaction, page, chosenQuiz.name, scrapedQuestions) : await DisplayQuestionEmbed(interaction, page, scrapedQuestions, chosenQuiz.name, 0)
        }
        await config.save()
        //finished! now to close everything! (if browser was already closed it doesn't matter)
        await browser.close();
    }
}
const DoQuiz = async (page, interaction, chosenQuiz, dataBaseAnswers, autoFillEverything) => {
    //make sure they can't autofill everything when they are doing the daily quiz
    if(chosenQuiz?.daily) {
        autoFillEverything = false;
    }

    const scrapedQuestions = await GetQuizQuestions(page, chosenQuiz.url, dataBaseAnswers, autoFillEverything)

    if(scrapedQuestions == null) {
        await interaction.editReply({ content: `You have no more attempts left at ${chosenQuiz.name}`, embeds: [], components: []})
        await browser.close(); 
        return null;
    }

    //* returning what was const correctedAnswers
    return autoFillEverything ? await DisplayQuizSummary(interaction, page, chosenQuiz, scrapedQuestions, true) : await DisplayQuestionEmbed(interaction, page, scrapedQuestions, chosenQuiz)
}
const AutoFillAnswers = async (interaction, page, quiz, scrapedQuestions, lastI) => {
    // update all the questions, will do this all at once, so wait for that to finish
    for await (const question of scrapedQuestions) {
        GuessOrFillSpecificQuestion(question);
    }
    // update the the quiz to have the new values
    await UpdateQuizzesWithInputValues(page, scrapedQuestions)
    // then show the summary of what has happened
    return await DisplayQuizSummary(interaction, page, quiz, scrapedQuestions, lastI)
}

const GetCorrectAnswersFromResultsPage = async (page, updatedQuestions) => {
    //Got an error from this but everything worked fine for some reason
    await page.waitForSelector('button[type=Submit].btn-primary').catch(err => console.log(err))
    await page.evaluate(() => document.querySelector('button[type=Submit].btn-primary').click())    // the second submit is the final submit button, the first is to retry.
    //popup for finally submitting
    await page.waitForSelector('div.confirmation-buttons input.btn-primary');
    await Promise.all([
        page.evaluate(() => document.querySelector('div.confirmation-buttons input.btn-primary').click()),
        page.waitForNavigation()
    ])

    return await UpdateQuestionCorrectnessDivs(page, updatedQuestions);
}

const UpdateQuizzesWithInputValues = async (page, updatedQuestions) => {
    await Promise.all([
        page.waitForNavigation(),
        page.evaluate(() => document.querySelector('button[type=Submit].btn-secondary').click())
    ])
    await GoBackToStart(page);
    await GoToNextPageScrape(page, updatedQuestions, true)
}

const FetchQuizFromDatabase = async (quiz_db, quizTitle) => {
    //create the schema that fetches the questions 
    const MoodleQuiz = quiz_db.model('Moodle', moodleQuizSchema, 'Moodle')
    // await Kitten.find({ name: /^fluff/ });
    const quizAnswers = Array.from(await MoodleQuiz.find({ name: quizTitle }))[0]?.questions;
    // returns undefined if it isn't found
    return quizAnswers;
}
const AddQuizDataToDatabase = async (quiz_db, quizTitle, correctedQuestions) => {
    
    if(correctedQuestions == null) return console.log(quizTitle + ' not saved to the Database because it was null!');
    
    console.log(`${correctedQuestions.length} questions of ${quizTitle} are being saved to the database!`)
    const MoodleQuiz = quiz_db.model('Moodle', moodleQuizSchema, 'Moodle')
    const newQuiz = new MoodleQuiz({
        name: quizTitle,
        questions: {}
    })
    
    //* answers are an array of strings, because order can be changed around on the course website
    for (const question of correctedQuestions) {
        if(question.questionType == 'text')  {
            // question.answerData[0].label = question.answerData[0].value;
            if(question.answerData[0].correct === true){
                newQuiz.questions[question.questionName] = { correct: question.answerData[0].correctStrings }
            }
        }
        else if(question.questionType == 'essay') {
            // I'm not sure if I have to filter out all the correct ones like text but I don't see the point
            newQuiz.questions[question.questionName] = { correct: question.answerData.map(ans => ans.correctStrings).filter(s=>s) }
        }
        else {
            const correct = question.answerData.filter(answer => answer.correct === true).map(answer => answer.label);
            // By default we don't want incorrect ones added if it is a radio button (no need -- unless we don't know the correct one yet)
            const incorrect = question.answerData.filter(answer => answer.correct === false && (correct.length == 0 || question.QuestionType === 'checkbox')).map(answer => answer.label)
            // finally add them
            newQuiz.questions[question.questionName] = { correct, incorrect }
        }
    }
    //* this is probably not how to do the replacing, because I am using a schema thing, but oh well
    await MoodleQuiz.replaceOne({ name: quizTitle }, { name: newQuiz.name, questions: newQuiz.questions }, { upsert: true })
}
const DisplayQuizSummary = async (interaction, page, quiz, updatedQuestions, preSubmission=true, lastI) => {
    const quizTitle = quiz.name
    //loops through all the questions and adds them as message fields
    //if it has been submitted add the grade to to title
    let gradePercentAsInt = 100;
    if(autoSubmit && preSubmission) {
        let correctedAnswers = await GetCorrectAnswersFromResultsPage(page, updatedQuestions)
        // display the quiz summary for the last time with the corrected answers
        return await DisplayQuizSummary(interaction, page, quiz, correctedAnswers, false);
    }
    //thanks samantha - first one is 20 so take that off the count and just add one to the counter
    let questionLength = updatedQuestions.length- 20;
    // then add any more sets of 25 if quesitonlength isn't 0 or negative
    const embedCount =  1 + (questionLength > 0 ? Math.ceil((questionLength) / 25) : 0)

    const quizSummaryEmbeds = [];
    let questionIndex = 0
    //? why did I go backwards??? 
    for (let i = embedCount; i > 0; i--) {
        let EmbedTitle = i == embedCount ? quizTitle : `${quizTitle} part ${embedCount - i}`
        // could also add the grade to the title? but that is already in the description elements
        // `${(await page.evaluate(() => document.querySelectorAll('table.quizreviewsummary tr')[4].innerText)).replace('\t', ' ')}`
        let quizSummaryEmbed = new EmbedBuilder()
                .setColor(primaryColour)
                .setTitle(EmbedTitle)
                // .setURL(page.url())
                // .setThumbnail(recipientImg)
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
            //After getting the grade Regex out the percentage from it
            const gradeMatch = gradeString.match(/\d+(\.\d+)?%/)
            //If it is a match, just get the number, otherwise it couldn't be found don't repeat as there is a problem
            gradePercentAsInt = gradeMatch ? gradeMatch[0].replace('%', '') : 100

        }
        
        // when it is the first embed, only go up to 20, otherwise 25
        let divisableNumber = i == embedCount ? 25 : 20 

        //Loop through sets of 20 or 25 adding to the embed
        do {
            if (questionIndex >= updatedQuestions.length) break;
            const question = updatedQuestions[questionIndex]
            //loop through and add [] to string, but add label if it is selected
            let questionAnswersString = ''   
            for (const answerIndex in question.answerData) {
                const answer = question.answerData[answerIndex];
                //that way if it doesn't know or it is incorrect it won't show
                if(question.questionType == 'text' || question.questionType == 'essay'){
                    if(question.questionType == 'text') {
                        questionAnswersString += answer.value
                    }
                    questionAnswersString += answer.correct === true ? ' ✓ ' : answer.correct === false ? ' X ' : ' ';
                }
                if(preSubmission) {
                    if (question.questionType != 'text' && question.questionType != 'essay'){
                        let answerWithSymbol = answer.correct === true ? `[${answer.label} ✓] ` : answer.correct === false ? `[${answer.label} X] ` : `[${answer.label}] `
                        // let correctsymbol = await CheckAnswer(quizTitle, updatedQuestions, questionIndex, answerIndex) ? '✓' : undefined
                        //then add in the correctsymbol next to the answer value if it isn't null
                        questionAnswersString += answer.value ? answerWithSymbol : '[]'
                    }
                }
                else {
                    //! this will cause errors if the reason is longer than 1024 or whatever
                    if((question.questionType == 'text' || question.questionType == 'essay') && answer.reason) {
                        questionAnswersString += answer.reason.trim();
                    }
                    else if (answer.value && question.questionType != 'text' && question.questionType != 'essay') {
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

            // if that returns 0 it becomes a falsy which means it hit the cap of embeds
            // the plus one is because the index starts at 0
        } while ((questionIndex + 1) % divisableNumber)
        quizSummaryEmbeds.push(quizSummaryEmbed)
    }
    //as long as it is not 0
    const buttonMoveRow = preSubmission ?  [ await CreateMoveRow(3, 'Submit!', quiz?.daily) ] : [] 

    //sometimes it times out, don't unknown interaction error
    if(lastI) await lastI.deferUpdate({ files: []}).catch(err => {/*console.log(err)*/})
    const reply = await interaction.editReply({ content: ' ', embeds: quizSummaryEmbeds, components: buttonMoveRow, files: [], fetchReply: true}) 
    
    const filter = i => i.user.id === interaction.user.id;
    const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000 });
    // The back buttonn won't work for this because this function won't be called again
    let failed = false;
    //don't submit if they didn't click the submit, but it auto - dones
    // let correctedAnswers;
    if(preSubmission){
        // returning because it is now going to display the summary again inside this
        return await WaitForNextOrBack(collector, interaction, page, updatedQuestions, quiz, !preSubmission).catch(() => failed=true);
        // if it failed, they didn't submit and return nothing as they timed out
        if(failed) return null;
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
const DisplayQuestionEmbed = async (interaction, page, scrapedQuestions, quiz,  questionIndex=0, essayIndex=0) => {
    return new Promise(async (resolve, reject) => {
        // await interaction.editReply({components: []})
        const questionData = scrapedQuestions[questionIndex]
        let channelResponse = false;

        let quizStartEmbed = new EmbedBuilder()
            .setColor(primaryColour)
            .setTitle(questionData.questionName.length <= 256 ? questionData.questionName : `Question ${questionIndex}`)
            // .setURL(page.url())
            // .setThumbnail(recipientImg)
            .setDescription(questionData.questionPrompt || 'Type the answer into this channel');
        ;
        if(questionData.questionName.length > 256) {
            quizStartEmbed.addFields({ name: 'Quiz Title', value: questionData.questionName})
        }
        const quizImgAttachments = [];
        // do the image if the question has one
        if (questionData.questionImgs != undefined) {
            // five is the max
            for (let i = 0; i < questionData.questionImgs.length && i < 5; i++) {
                const imgBuffer = questionData.questionImgs[i];
                quizImgAttachments.push(new AttachmentBuilder(imgBuffer).setName(`questionImg${i}.png`).setDescription('Img for the current question'));
            }
            // for (const questionImgIndex in questionData.questionImgs) {
            //     // 4 means 5 done which I think is the limit discord allows
            //     if(questionImgIndex > 4) break;
            //     // const questionImg = questionData.questionImgs[questionImgIndex];
            //     // const imgSrc = await page.goto(questionImg)
            //     // const imgBuffer = await imgSrc.buffer();
            //     // const imgBuffer = questionData.questionImgs[questionImgIndex];
            //     quizImgAttachments.push(new AttachmentBuilder(imgBuffer).setName(`questionImg${questionImgIndex}.png`).setDescription('Img for the current question'));
            //     // if(questionImgIndex == 0) quizStartEmbed.setImage(`attachment://questionImg${questionImgIndex}.png`);
            //     // await page.goBack()
            // }
            // make the first image the main one, if there are others just add them to the message
            quizStartEmbed.setImage(`attachment://questionImg0.png`);
        }

        const buttonMoveRow = await CreateMoveRow(questionIndex, 'Next', quiz?.daily);
        const buttonAnswerRow = new ActionRowBuilder();

        let reply;
        //only cause I don't wanna regen, not the best way I guess but idk

        if(questionData.questionType == 'radio' || questionData.questionType == 'checkbox'){
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

            reply = await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow, buttonAnswerRow], files: quizImgAttachments});
                
        }
        else if(questionData.questionType == 'essay') {
            quizStartEmbed.setDescription('Essay Response, click the buttons to cycle through each section, copy the selected section (Don\'t copy the x or tick if it has that part), paste it back in but edit it so it\'s correct and enter. (The bot will read your message and enter it) **First Image is probably nested inside the embed but not part of the inside questions so don\'t get confused')
            if(questionData?.questionImgs?.length > 5) {
                //? probably should fix this because it deffo doesn't work at all! links url way too long (over 1024 characters each!)
                // quizStartEmbed.addFields({ name: `Image Links (because discord only allows one image in embed (+ 4 outside))`, value: questionData.questionImgs.join(' , ')})
                quizStartEmbed.addFields({ name: `Not all images could be displayed`, value: `(${questionData.questionImgs.length - 5} weren't shown). because the url is too long, it also means that it can't be sent on discord!`})
            }
            const essayResonseEmbeds = [ quizStartEmbed ]
            for (const lineSection in questionData.answerData) {
                // const stringItself = essayLinesSplit[lineSection];
                
                //* using javascript boolean 1 0 thing to push, so if it is the first one it won't have the extra
                const embedIndex = Math.floor(lineSection / (23 + (lineSection > 23)))

                if(essayResonseEmbeds.length == embedIndex) {
                    // .setTitle(questionData.questionName.length <= 256 ? questionData.questionName : `Question ${questionIndex}`)
                    //? does it need a title?
                    essayResonseEmbeds.push(new EmbedBuilder().setColor(primaryColour))
                }
                //* because the lines are only at 600 sections, there is enough room for people to edit and send back so no need to check > 1024
                // adding the line, if the line isn't first add the part number (+ 1 because of zero indexing)
                essayResonseEmbeds[embedIndex].addFields({ name: `Answer to edit${lineSection > 0 ? ' part ' + Number(lineSection) + 1 : ''}${lineSection == essayIndex ? '【 SELECTED 】' : ''}`, value: questionData.answerData[lineSection].value })
            }
            // so the user can cycle through the lines
            // using section++ -- because idk it's funny
            buttonAnswerRow.addComponents(
                new ButtonBuilder()
                .setCustomId('Section--')
                .setLabel('Back Section')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(essayIndex == 0),
                new ButtonBuilder()
                .setCustomId('Section++')
                .setLabel('Next Section')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(essayIndex == questionData.answerData.length - 1),
                //TODO add the reset button if someone makes a mistake editing
                new ButtonBuilder()
                .setCustomId('Reset Essay')
                .setLabel('Reset Essay')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true),
            )

            reply = await interaction.editReply({ content: ' ', embeds: essayResonseEmbeds, components: [buttonMoveRow, buttonAnswerRow], files: quizImgAttachments});
            // cycle through the fields, if it is the selected line, Display the selected part to the user
            // reply = quizImgAttachments != null ? await interaction.editReply({ content: ' ', embeds: essayResonseEmbeds, components: [buttonMoveRow, buttonAnswerRow], files: quizImgAttachments}) : await interaction.editReply({ content: ' ', embeds: essayResonseEmbeds, components: [buttonMoveRow, buttonAnswerRow]})
        }
        else if(questionData.questionType == 'text'){
            // when referring to the correct answers use answers[0].value because this will be the text
            let answer = questionData.answerData[0].value || 'Not Attemped Yet';
            if (questionData.answerData[0].correctStrings.includes(answer.toLowerCase())) answer += ' ✓'

            quizStartEmbed.addFields({ name: 'Answer', value: answer})

            // if(lastI) await lastI.deferUpdate();
            reply = await interaction.editReply({ content: ' ', embeds: [quizStartEmbed], components: [buttonMoveRow], files: quizImgAttachments});
        }
        else {
            console.error('Invalid Question Type ' + questionData.questionType);
        }
        
        //* If the channel isn't inside the guild, you need to create a custom channel
        const channel = interaction.inGuild() ? await interaction.channel : await interaction.user.createDM();
        //TODO maybe it can collect if you type in !save to the channel it will save, or other stuff!
        const msgCollector = await channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id, time: 180 * 1000 });
        msgCollector.on('collect', async m => {
            if(questionData.questionType == 'text' || questionData.questionType == 'essay') {
                questionData.correct = null;
                const editingIndex = questionData.questionType == 'essay' ? essayIndex : 0;
                questionData.answerData[editingIndex].value = m.content;
                if(questionData.questionType == 'essay') {
                    StopCollecting();
                    return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quiz, questionIndex, essayIndex));
                }
                // both text and essay use correctSTrings
                //! TODO need to actually disable this if showing hints 
                if(questionData.answerData[essayIndex].correctStrings.includes(m.content.toLowerCase())) m.content += ' ✓';
                quizStartEmbed.setFields({ name: 'Answer', value: m.content })
                await interaction.editReply({embeds: [quizStartEmbed]})
            }
        });
        const filter = i => i.user.id === interaction.user.id;
        // create collector to handle when button is clicked using the channel 180 seconds in mill
        const collector = await reply.createMessageComponentCollector({ filter, time: 180 * 1000 });
        let updatedButtons = buttonAnswerRow.components;
        //todo maybe don't await the defer updates? that way they can update while stuff is happening
        collector.on('collect', async (i) => {
            if (i.customId == 'Next') {
                StopCollecting();
                if (scrapedQuestions.length != questionIndex + 1) {
                    await i.deferUpdate();
                    return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quiz, questionIndex + 1));
                }
                else {
                    await UpdateQuizzesWithInputValues(page, scrapedQuestions)
                    return resolve(await DisplayQuizSummary(interaction, page, quiz, scrapedQuestions, true, i)); // finish the function and return the new updated questions
                }
            }
            else if (i.customId == 'Back') {
                StopCollecting();
                await i.deferUpdate();
                return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quiz, questionIndex - 1));
            }
            // there has got to be a better way of doing this
            else if (i.customId == 'Section++') {
                StopCollecting();
                await i.deferUpdate();
                return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quiz, questionIndex, essayIndex + 1));
            }
            else if (i.customId == 'Section--') {
                StopCollecting();
                await i.deferUpdate();
                return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quiz, questionIndex, essayIndex - 1));
            }
            else if (i.customId == 'Quit') {
                StopCollecting();
                await interaction.editReply({content: 'Quit Successfully', embeds: [], components: [], files: []})
                return resolve([scrapedQuestions]);
            }
            else if (i.customId == 'Overview') {
                // await i.update({ content: ' '});
                // await i.deferUpdate(); 
                StopCollecting();
                await UpdateQuizzesWithInputValues(page, scrapedQuestions)
                return resolve(await DisplayQuizSummary(interaction, page, quiz, scrapedQuestions, true, i))
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
                else if(questionData.questionType == 'essay') {
                    // there can be more than one correct line
                    const curCorrectAnswer = questionData.answerData[essayIndex]?.correctStrings[0];
                    questionData.answerData[essayIndex].value = curCorrectAnswer ?? questionData.answerData[essayIndex].value.replace('...', (Math.random() > 0.5).toString()) + ' extra filler';
                    
                    //this won't work for the set fields :/
                    // quizStartEmbed.setFields({ name: 'Answer', value: `${questionData.answerData[essayIndex].value}${curCorrectAnswer != null ? ' ✓' : ''}` })
                    // interaction.editReply({embeds: [quizStartEmbed]})
                    StopCollecting();
                    await i.deferUpdate();
                    return resolve(await DisplayQuestionEmbed(interaction, page, scrapedQuestions, quiz, questionIndex, essayIndex));
                }
                else {
                    let checkedAnswer = true;
                    let correctAnswerIds = await questionData.answerData.filter(answer => answer.correct === true)?.map(answer => answer.answerNumber)
                    // chooses all the correct answers, but if none are found than just add a random one, 
                    if(!correctAnswerIds || correctAnswerIds.length == 0) {
                        correctAnswerIds = questionData.answerData[Math.floor(Math.random() * questionData.answerData.length)].answerNumber ;
                        //that means we don't know if it isn't correct so don't show as green
                        checkedAnswer = undefined;
                    }
    
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
            if(collected.size == 0 && !channelResponse) {
                console.log("Timed Out On Question")
                return interaction.editReply({content: 'Timed out, answers not saved until you view the summary (overview)!', embeds: [], components: [], files: []})
            }
            else if (questionData.questionType != 'text' && questionData.questionType != 'essay') {
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

        function StopCollecting(m) {
            channelResponse = true;
            collector.stop();
            msgCollector.stop();
            if(interaction.inGuild() && m && interaction.userConfig.settings.config.DeleteSettingMessages) { m.delete() };
        }
    })
}

const GetQuizQuestions = async (page, chosenQuizUrl, databaseQuestions, autoFillEverything) => {
    await page.goto(chosenQuizUrl);
    let quizDisabled = await page.evaluate(() => {
        return document.querySelector('button[type=Submit].btn-primary').textContent == 'Back to the course'
    })
    // if you cant access the quiz, don't bother getting questions, it will say the quiz is disabled in message
    if(quizDisabled) return null;
    
    // doing network idle because error with go back to start scraping which is annoying
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.evaluate(() => document.querySelector('button[type=Submit].btn-primary').click()),
        //on end querySelectorAll[1] because the second one is the actual full sumbit, that first one is like a retry button
        //but first I have to go back and click
    ])

    await GoBackToStart(page);
    
    // boom that way I have the correct answers, but they need to be passed into next page scrape so that it can answer them as it goes
    return await GoToNextPageScrape(page, [], false, databaseQuestions, autoFillEverything)
}

const GetQuizzesList = async (page, termIDs) => {
    let quizzes = {
        due: [],
        done: [],
    }

    for (const termID of termIDs) {
        try {
            await page.goto(`${UtilFunctions.mainStaticUrl}/mod/quiz/index.php?id=${termID}`)    
        } catch (error) {
            console.log('page url is not working')
            return null; // no quizzes found
        }
    
        //INITIATE SCRAPING
        await page.waitForSelector('#region-main > * div > table > tbody > tr')
    
        quizzes = await page.evaluate((quizzes) => {
            let tableRows = document.querySelectorAll('#region-main > * div > table > tbody > tr');//#yui_3_17_2_1_1658806562256_56 > table > tbody
            for (trElem of tableRows){
                //if it is a table divider just skip it
                if(trElem.querySelector('.tabledivider')) continue;
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
        }, quizzes)
        
    }

    return quizzes
}

const DisplayQuizzes = async (interaction, quizzes, config, showDone=true) => {
    return new Promise(async (resolve, reject) => {
        let pageNum = 0;
        const quizzesEmbed = new EmbedBuilder()
        .setColor(primaryColour)
        .setTitle('Available Quizzes')
        .setDescription('Choose a Quiz from the select menu, you can redo the quizzes you have already done if you want to.' + 
        ' If you have hints enabled, when you click an answer the button will turn green or red (correct or false), if the bot doesn\'t know it already it will be blue (normal selected) ' + 
        '\nAlso if you encounter an interaction failed response, just click the button again, sometimes discord doesn\'t record interactions properly :angry: ')

        let quizSelectOptions = quizzes['due']?.map((quiz) => ({ label: quiz.displayName, description: 'This Quiz is still due', value: quiz.url }));
        if(showDone) quizSelectOptions = quizSelectOptions.concat(quizzes['done']?.map((quiz) => ({ label: quiz.displayName, description: 'This Quiz has already been finished', value: quiz.url })));
        //? '!selectedOptions.length' works too because of javascript but less readable
        if(quizSelectOptions.length == 0) {
           //there isn't any quizzes so yeah just tell them that
            quizzesEmbed.setDescription(`Couldn't find any quizzes! re-run the command and choose a different course!${showDone ? '' : '\nYou have disabled showing quizzes already done, re-enable that with /config and you might see quizzes again!'}`)
            await interaction.editReply({ content: '', embeds: [quizzesEmbed], components: []}) 
            return resolve(null)
        }

        // const selectRow = new ActionRowBuilder()
        //     .addComponents(
        //         new SelectMenuBuilder()
        //             .setCustomId('select')
        //             .setPlaceholder('Nothing selected')
        //             .setMaxValues(quizSelectOptions.length)
        //             .addOptions(...quizSelectOptions)
        // );

        // const quizSelectActionRows = UtilFunctions.GetSelectMenuOverflowActionRows(pageNum, quizSelectOptions, 'Choose the quizzes you want to do!')
        const maxDailys = config.vip ? 2 : 1;
        //falsy statement, if it aint zero
        if(config.stats.DailyQuizzesDoneToday) {
            //basically it goes is "2016-02-18" != "2016-02-19"
            if(config.stats.DailyQuizLastComplete.toISOString().split('T')[0] != new Date().toISOString().split('T')[0]) {
                config.stats.DailyQuizzesDoneToday = 0;
            }
        }
        const canDoDailyQuiz = config.stats.DailyQuizzesDoneToday < maxDailys;
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('quit')
                    .setLabel('quit')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('daily')
                    .setLabel('daily')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!canDoDailyQuiz)
        );
    
        // quizSelectActionRows.push(buttonRow)

        const reply = await interaction.editReply({ content: ' ', embeds: [quizzesEmbed],
         components: [ ...UtilFunctions.GetSelectMenuOverflowActionRows(pageNum, quizSelectOptions, 'Choose the quizzes you want to get done!', false, quizSelectOptions.length), buttonRow] });  
    
        const filter = i => i.user.id === interaction.user.id;
        const collector = await reply.createMessageComponentCollector({filter, max: 1, time: 180 * 1000 });
    
        collector.on('collect', async i => {
            // merge all of the quiz options into one array so that it can find the urls and extra info about the questions chosen
            if (i.customId == 'quit') {
                await interaction.editReply({ content: 'Quit Successfully', embeds: [], components: [] })
                return resolve(null)
            }
            else if(i.customId == 'daily') {
                //get the name and url from the choice and return the daily, add daily = true
                await i.deferUpdate();
                const { name, url } = quizzes['due'].length > 0 ? quizzes['due'][Math.floor(Math.random() * quizzes['due'].length)] : quizzes['done'][Math.floor(Math.random() * quizzes['done'].length)]
                await interaction.editReply({ content: `Going to ${name} to get quiz questions and attempt now!`, embeds: [], components: []});
                return resolve([{ name, url, daily: true}])
            }
            else if(i.customId == 'next_page') {
                pageNum++;
                await interaction.editReply({ components: [ ...UtilFunctions.GetSelectMenuOverflowActionRows(pageNum, quizSelectOptions, 'Choose the quizzes you want to get done!', false, quizSelectOptions.length), buttonRow]})
            }
            else if(i.customId == 'previous_page') {
                pageNum--;
                await interaction.editReply({ components: [ ...UtilFunctions.GetSelectMenuOverflowActionRows(pageNum, quizSelectOptions, 'Choose the quizzes you want to get done!', false, quizSelectOptions.length), buttonRow]})
            }
            //* Interaction has already been acknowlegded with just update, trying deferUpdate
            await i.deferUpdate({ content: `Going to ${i.values.join(', ')} to get quiz questions and attempt now!`, embeds: [], components: []})
            
            const quizOptions = [ ...quizzes['due'], ...(quizzes['done']) ]//Logging which questions the user chose 
            console.log(`The Quizzes: "${i.values.map(selectedUrl => quizOptions.find(quizOption => quizOption.url == selectedUrl).name).join('", "')}" Were Chosen`)
            //complete the function by returning the chosen terms with their urls and stuff
            resolve(i.values.map(selectedUrl => {
                return {
                    name: quizOptions.find(quizOption => quizOption.url == selectedUrl).name,
                    url: selectedUrl
                }
            }
            ))
        });
    
        collector.on('end', collected => {
            if(collected.size == 0) {
                // If they ran out of time to choose just return nothing
                interaction.editReply({ content: "Interaction Timed Out (You didn't choose anything for 180 seconds), re-run the quiz command again", embeds: [], components: []})
                resolve(null)
            }
        });
    });
}

const UpdateQuestionDivs = async (page, updatedQuestionsData) => {
    // only gets one item
    // const questionDivs = await page.waitForSelector('form div[id*="question"] div.content > div');
    await page.waitForSelector('form div[id*="question"] div.content > div', { visible: true});

    const questionDivs = await page.$$('form div[id*="question"] div.content > div')
    
    for (const questionDivContent of questionDivs) {

        
        const curQuestionPromptText = await questionDivContent.$eval('div.qtext', e => e.textContent);
        const updatedQuestion = updatedQuestionsData.find(question => question.questionName == curQuestionPromptText)
        const textAnswer = await questionDivContent.$('span.answer input')
        if(textAnswer){
            //set the text value to be the text answer that was given
            textAnswer.value = updatedQuestion.answerData[0].value
        }
        else if(updatedQuestion.questionType == 'essay') {
            const essayResponse = await questionDivContent.$('div.qtype_essay_response');
            const frameHandle = await essayResponse.evaluateHandle(node => node.querySelector('iframe'));
            const frame = await frameHandle.contentFrame();
            

            const bodyElem = await frame.$('body#tinymce');
            
            await bodyElem.evaluate(body => {
                //remove the p elems so that the text box is then cleared
                for (const pElem of body.querySelectorAll(':is( div[class="editor-indent"], p )')) {
                    pElem.remove()
                }
            })
            // Then click in the text box to type it out again
            // await frame.click('body#tinymce p')
            await bodyElem.focus();

            // await page.type(updatedQuestion.answerData.map(ad => ad.value).join(''))
            await page.keyboard.type(updatedQuestion.answerData.map(ad => ad.value).join(''))
            // const essayText = await frame.$$eval
            // questionImgs.push(...await frame.$$eval('body img', images => images.map(img => img.src)))
        }
        else {
            
            questionDivContent.$$eval('div.answer > div', (answerDivs, updatedQuestion) => {
                for (let i = 0; i < answerDivs.length; i++) {
                    answerDivs[i].querySelector(':is( input[type="checkbox"], input[type="radio"]').checked = updatedQuestion.answerData[i].value
                }
            }, updatedQuestion)
            // const answerDivs = Array.from(questionDivContent.$$('div.answer div'));
            // for (const answerDivIndex in answerDivs) {
            //     const answerDiv = answerDivs[answerDivIndex];
            //     //set the checked value of the input to be what the discord bot changed it too
            //     answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').checked = updatedQuestion.answerData[answerDivIndex].value
                
            // }
        }
    }
    // //update all the questions on the website using the values from the questions object
    // await page.evaluate((updatedQuestionsData) => {
    //     let questionDivs = Array.from(document.querySelectorAll('form div[id*="question"] div.content > div'));
    //     for (const questionDivContent of questionDivs) { 
    //         // const questionDivContent = questionDivs[questionDivContentIndex];
    //         const updatedQuestion = updatedQuestionsData.find(question => question.questionName == questionDivContent.querySelector('div.qtext').textContent)
    //         let textAnswer = questionDivContent.querySelector('span.answer input')
    //         if(textAnswer){
    //             //set the text value to be the text answer that was given
    //             textAnswer.value = updatedQuestion.answerData[0].value
    //         }
    //         else {
    //             const answerDivs = Array.from(questionDivContent.querySelectorAll('div.answer div'));
    //             for (const answerDivIndex in answerDivs) {
    //                 const answerDiv = answerDivs[answerDivIndex];
    //                 //set the checked value of the input to be what the discord bot changed it too
    //                 answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"]').checked = updatedQuestion.answerData[answerDivIndex].value
                    
    //             }
    //         }
    //     }
    // }, updatedQuestionsData)
}

//This one is checking whether or not our answers were correct or not
const UpdateQuestionCorrectnessDivs = async (page, updatedQuizResponses) => {
    await page.waitForSelector('form div[id*="question"] div.content > div');
    const questionDivs = await page.$$('form div[id*="question"] div.content')
    // for (const questionDivContent of questionDivs) {
    //     //qtext contains only the title of the question
    //     const questionName = await questionDivContent.$eval('div.qtext', e => e.textContent);
    //I think they just need page
    for (const questionDivContent of questionDivs) {
        // get the name to find the question in the question list if the order has changed
        const questionName = await questionDivContent.$eval('div.qtext', e => e.textContent);
        const updatedQuestion = updatedQuizResponses.find(q => q.questionName == questionName)

        // they all have different ways of being stored so yeah as correct in db
        if(updatedQuestion.questionType == 'text' || updatedQuestion.questionType == 'essay') {
            // if it was correct add whatever the string that was correct to the db
            if(await questionDivContent.$('i[title="Correct"]')){
                for (const line of updatedQuestion.answerData) {
                    line.correct = true;
                    if(!line.correctStrings.includes(line.value)) line.correctStrings.push(line.value);
                }
            } 
            else if(await questionDivContent.$('i[title="Incorrect"]')) {
                for (const line of updatedQuestion.answerData) {
                    line.correct = false;
                }
            }
        }
        else {
            await questionDivContent.$$eval('div.answer div[class*="r"]', (answerDivs, updatedQuestion) => {
                for (let i = 0; i < answerDivs.length; i++) {
                    const answerDiv = answerDivs[i];
                    let answerDivClass = answerDiv.getAttribute('class').toLowerCase()
                    
                    updatedQuestion.answerData[i].correct ??= answerDivClass.includes('incorrect') ? false : answerDivClass.includes('correct') ? true : null;
                    if(updatedQuestion.answerData[i].correct != null) {
                        //using query selector because inside eval
                        //note that this is the specific feedback to the answer itself, not as a whole
                        const answerOutcome = answerDiv.querySelector('div.specificfeedback')
                        if(answerOutcome != null){
                            updatedQuestion.answerData[i].reason = answerOutcome?.textContent
                        }
                    }    
                }
            }, updatedQuestion);
        }

        // undefined if it doesn't exist :/ 
        // const questionName = await questionDivContent.$eval('div.qtext', e => e.textContent);
        updatedQuestion.outcome = await questionDivContent.$eval('div.outcome.clearfix div.feedback', e => e?.textContent);

        //* I think I could check if it is div.rightanswer but this works anyways
        if(updatedQuestion?.outcome?.includes('The correct answer is:')) {
            const answerFromOutcome = updatedQuestion.outcome.split('The correct answer is: ')[1]
            const foundAnswer = updatedQuestion.answerData.find(answer => answer.label == answerFromOutcome)
            if(foundAnswer) foundAnswer.correct = true
        }
        //* if essay just assume that it gives you the answer
        if(updatedQuestion.questionType == 'essay' && updatedQuestion.outcome) {
            const essaySections = await UtilFunctions.SplitIntoCharSections(updatedQuestion.outcome, 600);
            for (let i = 0; i < essaySections.length; i++) {
                if(!updatedQuestion.answerData[i].correctStrings.includes(essaySections[i])) {
                    updatedQuestion.answerData[i].correctStrings.push(essaySections[i])
                }
            }
        }
    }

    return updatedQuizResponses;
    // return await page.evaluate((updatedQuizResponses) => {
    //     let questionDivs = document.querySelectorAll('form div[id*="question"] div.content');
    //     for (const questionDivContent of questionDivs) {
    //         updatedQuestion = updatedQuizResponses.find(question => question.questionName == questionDivContent.querySelector('div.qtext').textContent)
    //         let textAnswer = questionDivContent.querySelector('span.answer input')
    //         if(textAnswer){
    //             //set the text value to be the text answer that was given
    //             if(questionDivContent.querySelector('i[title="Correct"]')){
    //                 updatedQuestion.answerData[0].correct = true
    //                 if(!updatedQuestion.answerData[0].correctStrings.includes(updatedQuestion.answerData[0].value)) updatedQuestion.answerData[0].correctStrings.push(updatedQuestion.answerData[0].value)
    //             } 
    //             else if(questionDivContent.querySelector('i[title="Incorrect"]')) {
    //                 updatedQuestion.answerData[0].correct = false
    //             }
                
    //         }
    //         else {
    //             const answerDivs = Array.from(questionDivContent.querySelectorAll('div.answer div[class*="r"]'));
    //             for (const answerDivIndex in answerDivs) {
    //                 const answerDiv = answerDivs[answerDivIndex];
    //                 let answerDivClass = answerDiv.getAttribute('class').toLowerCase()
                    
    //                 updatedQuestion.answerData[answerDivIndex].correct ??= answerDivClass.includes('incorrect') ? false : answerDivClass.includes('correct') ? true : null;
    //                 if(updatedQuestion.answerData[answerDivIndex].correct != null) {
    //                     //note that this is the specific feedback to the answer itself, not as a whole
    //                     let answerOutcome = answerDiv.querySelector('div.specificfeedback')
    //                     if(answerOutcome != null){
    //                         updatedQuestion.answerData[answerDivIndex].reason = answerOutcome?.textContent
    //                     }
    //                 }    
    //             }

    //         }

    //         // undefined if it doesn't exist :/ 
    //         updatedQuestion.outcome = questionDivContent.querySelector('div.outcome.clearfix div.feedback')?.textContent;

    //         if(updatedQuestion.outcome) {
    //             if(updatedQuestion.outcome.includes('The correct answer is:')) {
    //                 let answerFromOutcome = updatedQuestion.outcome.split('The correct answer is: ')[1]
    //                 let foundAnswer = updatedQuestion.answerData.find(answer => answer.label == answerFromOutcome)
    //                 if(foundAnswer) foundAnswer.correct = true
    //             }
    //         }
    //     }

    //     return updatedQuizResponses;

    // }, updatedQuizResponses)
}

const ScrapeQuestionDataFromDivs = async (page, scrapedQuestions, dbAnswers, autoFillEverything=false) => {
    await page.waitForSelector('form div[id*="question"] div.content > div');
    
    let questionContainsImgs = false;
    const questionDivs = await page.$$('form div[id*="question"] div.content > div')
    for (const questionDivContent of questionDivs) {
        //qtext contains only the title of the question
        const questionName = await questionDivContent.$eval('div.qtext', e => e.textContent);
        
        // if it has answers is can set them correct, otherwise they will be null
        // I have to do this because it gives error if null
        const currentdbAnswer = dbAnswers != {} ? dbAnswers[questionName] : undefined

        //usually it's like Select One: or Choose Multiple: (that way the user knows what to do)
        const questionPrompt = await(await questionDivContent.$('div.prompt'))?.evaluate(node => node.textContent);

        //check if it is undefined before using it :/, not all have
        let questionImgs = await questionDivContent.$$eval('img', imgs => imgs.filter(img => !img.classList.contains('mceIcon') && img?.src).map(img => img.src));

        const essayResponse = await questionDivContent.$('div.qtype_essay_response')
        const textAnswer = await questionDivContent.$('span.answer input');
        let answerData = []
        let questionType = '';
        if(essayResponse) {
            await page.waitForSelector('div.qtype_essay_response iframe')
            //* get the element handle, and then get the actual frame document
            const frameHandle = await essayResponse.evaluateHandle(node => node.querySelector('iframe'))
            const frame = await frameHandle.contentFrame();
            //TODO fix this waitforselector, it is really weird though because according to the docs it should work, but others are having this error
            // await frame.waitForSelector('body#tinymce p')
            // await frame.contentWindow.document.waitForSelector('body#tinymce p')
            //? don't know if they have other elements than just <p>!
            questionType = 'essay'
            questionImgs.push(...await frame.$$eval('body img', images => images.map(img => img.src)))
            
            //? not sure if this works when the frame doesn't already have text and needs to wait
            const totalEssayText = await GetFrameText(frame);
            // get all of the text inside the box and join them with like new lines so they can be put in the embed with the lines seperated how it is on the site
            //* so yeah this means that it will be saved in sections in the db which is probably fine, can always  join them together, but it's quicker anyways to leave it like this
            const essaySections = await UtilFunctions.SplitIntoCharSections(totalEssayText, 600);
            //the db will also have the thing
            for (const index in essaySections) {
                answerData.push({
                    //more like section number
                    answerNumber: index,
                    correct: null,
                    correctStrings: currentdbAnswer?.correct[index] || [],
                    value: essaySections[index],
                    type: 'essay',
                })
            }
        }
        // only text answer contains this
        else if(textAnswer){
            questionType = 'text'
            answerData = [{
                answerNumber: 0,
                correct: null,
                correctStrings: currentdbAnswer?.correct || [], 
                label: questionDivContent.$('label').textContent,
                type: 'text',
                value: textAnswer.value // "erganomic design"
            }];
        }
        else {
            answerData = await questionDivContent.$$eval('div.answer > div', (answerDivs, currentdbAnswer) => answerDivs.map((answerDiv, answerNumber) => {
                const label = answerDiv.querySelector('div div').childNodes[1]?.textContent || answerDiv.querySelector('div div')?.textContent // only get the label and don't include the answer number
                const clickableButton = answerDiv.querySelector(':is( input[type="checkbox"], input[type="radio"] )')
                // the new answer will be correct if in correct strings, false if in false strings, or null not in any
                const newAnswerCorrect = currentdbAnswer?.correct.some(correctString => correctString == label) ? true : currentdbAnswer?.incorrect.some(incorrectString => incorrectString == label) ? false : null;
                
                return {
                    //use array instead of answer number but it says A. and stuff with isn't even a number
                    answerNumber: answerDiv.querySelector('span.answernumber')?.textContent || answerNumber.toString(),
                    correct: newAnswerCorrect,
                    label,
                    type: clickableButton.type,
                    value: clickableButton.checked // boolean
                };

            }), currentdbAnswer);
            //all the buttons should be the same type so only need the first to determine what type it is
            questionType = answerData[0].type;
        }


        scrapedQuestions.push({
            questionName,
            questionType,
            questionPrompt,
            questionImgs,
            answerData
        });
        
        //basically once this is true, it stays true
        questionContainsImgs = questionImgs.length > 0 || questionContainsImgs;
    }
    if(autoFillEverything) {
        for (const questionIndex in scrapedQuestions) {
            //for some reason editing the question in the for of loop doesn't update it inside the
            // actual scraped questions, so using the index and assigning it should work
            let question = scrapedQuestions[questionIndex]
            question = await GuessOrFillSpecificQuestion(question)
            // I feel like I could do
            //scrapedQuestions[questionIndex] = await GuessOrFillSpecificQuestion(scrapedQuestions[questoinIndex]) but idk
            scrapedQuestions[questionIndex] = question
        }
    }
    //TURN THE IMAGES URLS INTO ACTUAL BUFFERS TO SPEED UP STUFF
    if(questionContainsImgs) {
        //* get a new page so the outer function doesn't lose execution context
        const newPage = await (await page.browser()).newPage();
        for (const questionIndex in scrapedQuestions) {
            const question = scrapedQuestions[questionIndex];
            for (const imgUrlIndex in question.questionImgs) {
                const imgSrc = await newPage.goto(question.questionImgs[imgUrlIndex])
                //setting the thing to a buffer, I wanted to use for of statement but it doesn't mutate the question
                scrapedQuestions[questionIndex].questionImgs[imgUrlIndex] = await imgSrc.buffer();
            }
        }
        //make sure to return to the question page
        // await Promise.all([
        //     page.waitForNavigation(),
        //     page.goBack(),
        // ])
        //don't need to wait for the new page to close
        newPage.close()
    }
    return scrapedQuestions

    //doing it this way because waitForSelector() on frames don't work puppeteer
    async function GetFrameText(frame) {
        const tookTooLong = new Promise((resolve, reject) => {
            setTimeout(reject, 10000, 'Took too long to load frame text')
        })
        
        const getTextWhile = new Promise(async (resolve, reject) => {
            let text;
            do {
                text = await frame.$$eval('body#tinymce :is( div[class="editor-indent"], p )', pElems => pElems.map(p => p.textContent).filter(p=>p).join('\n'));
                //basically waiting for a little if text is null
                if(text == null) await new Promise((resolve, reject) => setTimeout(resolve, 100));
            }
            while (text == null)
            // while (!text) {
            //     text = await frame.$$eval('body#tinymce p', pElems => pElems.map(p => p.textContent).filter(p=>p).join('\n'));
            // }
            resolve(text)
        })

        return await Promise.race([tookTooLong, getTextWhile]);
    }
}

//! there is a problem where it waitf for navigation forever for some reason sometimes but not very often at all
const GoBackToStart = async (page) => {
    return new Promise(async (resolve, reject) => {
        const backButton = await page.$('form div.submitbtns > input[name="previous"]');
        if(backButton) {
            // await backButton.click() 
            await Promise.all([
                page.waitForNavigation(),
                backButton.click()
            ])
            // await Promise.all([
            //     page.waitForNavigation(),
            //     GoBackToStart(page)
            // ])
            // await page.waitForNavigation();
            //recursion, keep going back until the start
            resolve(await GoBackToStart(page));
        }
        else {
            resolve();
        }
    })

    // backButtonWasClicked = await page.evaluate(() => {
    //     let backButton = document.querySelector('form div.submitbtns > input[name="previous"]');
    //     if (backButton != undefined) {
    //         backButton.click();
    //         return true;
    //     }
    //     else {
    //         return false;
    //     }
    // })
    // if(backButtonWasClicked) {
    //     await page.waitForNavigation();
    //     //recursion, keep going back until the start
    //     await GoBackToStart(page);
    // }

}
const GoToNextPageScrape = async (page, scrapedQuestions, updateDivs, dbAnswers={}, autoFillEverything=false) => {
    //*FINISH IS ALSO A NEXT BUTTON
    const nextButton = await page.$('form div.submitbtns > input[name="next"]')
    if(nextButton) {
        //if we aren't updating the divs, just get the questions, if we aren't updating the divs, the dbAnswers will be passed usually
        if(!updateDivs || dbAnswers) {
            // if we are autofilling it will set the values of answers inside the question object, but won't directly update the buttons
            scrapedQuestions = scrapedQuestions.concat(await ScrapeQuestionDataFromDivs(page, [], dbAnswers, autoFillEverything))
        }
        //and so if we are autofilling we want to also update the divs
        if(updateDivs || autoFillEverything){
           await UpdateQuestionDivs(page, scrapedQuestions) 
        }
        //wait for the page to load and click the next button at the same time
        await Promise.all([
            page.waitForNavigation(),
            nextButton.click(),
        ])
        //it needs to wait for navigation otherwise the click is undefined
        return await GoToNextPageScrape(page, scrapedQuestions, updateDivs, dbAnswers, autoFillEverything)
    }
    else {
        return scrapedQuestions
    }
}

async function GuessOrFillSpecificQuestion(question) {
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
    else if(question.questionType == 'essay') {
        for (const section of question.answerData) {
            const curCorrectAnswer = section.correctStrings.length > 0 && section.correctStrings[0];

            if(curCorrectAnswer) {
                section.value = curCorrectAnswer;
                section.correct = true;
            }
            else {
                //you can't really replace random stuff idk
                // const replaceString = section.value.includes('…') ? '…' : (Math.random() > 0.5).toString().toUpperCase();
                if(section.value.includes('…')) {
                    section.value = section.value.replaceAll('…', (Math.random() > 0.5).toString().toUpperCase());
                } else {
                    section.value += '\nextra filla'
                }
                // console.log(replaceString)
                // console.log(section.value)
                // // extra filler so that it can show the answers basically
                // section.value = section.value.replace(replaceString, (Math.random() > 0.5).toString().toUpperCase());
                // console.log(section.value)
                //just in case it was set to true or whatever idk
                section.correct = null;
            }
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
                if(question.answerData.every(answer => answer.correct === false)) {
                   console.log('error with answerData, every anser is incorrect somehow?') 
                   question.answerData.map(answer => { answer.correct = null; return answer ; })
                }
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

async function WaitForNextOrBack(collector, interaction, page, updatedQuestions, quiz, finish) {
    return new Promise(async (resolve, reject) => {
        await collector.on('collect', async (i) => {
            if (i.customId == 'Next') {
                // await i.update({ content: ' ' }); // acknowledge it was clicked
                await i.deferUpdate();
                await collector.stop();
                if(finish) await interaction.editReply({ components: []})
                let correctedAnswers = await GetCorrectAnswersFromResultsPage(page, updatedQuestions)
                // display the quiz summary for the last time with the corrected answers
                return resolve(await DisplayQuizSummary(interaction, page, quiz, correctedAnswers, false));
            }
            else if (i.customId == 'Back') {
                // await i.update({ content: ' ' }); // just acknowledge the button click
                // await i.deferUpdate();
                await collector.stop();
                return resolve(await DisplayQuestionEmbed(interaction, page, updatedQuestions, quiz, updatedQuestions.length - 1));
            }
            else if (i.customId == 'AutoFill'){
                // await i.update({content: ' '});
                await i.deferUpdate()
                await collector.stop();
                return resolve(await AutoFillAnswers(interaction, page, quiz, updatedQuestions, i))
            }
            else if (i.customId == 'Quit') {
                await interaction.editReply({content: 'Quit Successfully, answers are saved when overview is looked at. (or if you have autosave)', components: [], embeds: []})
                return resolve([updatedQuestions])
            }
        });
        collector.on('end', collected => {
            if (collected.size == 0) {
                console.log('the submit view timed out');
                interaction.editReply({ content: 'Timed out! Answers save when visiting overview screen!', components: [], files: [] });
                return resolve([updatedQuestions])
            }
        });
    })
}

async function CreateMoveRow(questionIndex, nextButtonLabel='Next', disableAutofill=false) {
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
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAutofill), // disable if you can't go next
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

//Update a button in the rows when it is clicked, had to invent my own solution for discord.js V14 and then post it on stack overflow :)
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
