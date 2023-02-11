const { SlashCommandBuilder, ActionRowBuilder, PermissionFlagsBits, SelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlagsBitField, ComponentType, SlashCommandSubcommandBuilder, CommandInteractionOptionResolver } = require('discord.js');
const puppeteer = require('puppeteer');
const { GetSelectMenuOverflowActionRows, LoginToMoodle, AskForCourse, SendConfirmationMessage, TemporaryResponse, BrowserWithCache, mainStaticUrl, loginGroups } = require("../util/functions")
const { primaryColour, assignmentBorrowCost, assignmentSharedTokens, confirmationTokens, assignmentSubmissionTokens, fakeAssignmentPenalty, botOwners } = require("../util/constants");
const { ConvertName, GetConfigById } = require('./configSlash')
const mongoose = require('mongoose')
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios');

const data = new SlashCommandBuilder()
	.setName('read')
	.setDescription('Read the things on the moodle website, mark work as done easily :grin:')
    // .addBooleanOption(option =>
    //     option
    //         .setName('autocomplete')
    //         .setDescription('auto mark everything done straight away')
    //         .setRequired(false)
    // ) 

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
        const browser = await BrowserWithCache();
        const page = await browser.newPage();
        
        //every time a new tab page is opened close it instantly
        // browser.on("targetcreated", async (target)=>{
        //     page=await target.page();
        //     if(page) page.close();
        // });
        
        //Login to moodle and catch any errors that occur
        await LoginToMoodle(page, config).catch(reason => {
            console.log(reason);
            interaction.editReply({content: 'Internet was probably too slow and timed out, or something went wrong with your login'});
            browser.close();
        })

        //Choose which course for speed reading
        const chosenTerms = await AskForCourse(interaction, page, false).catch(reason => {
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

        //TODO later on get all the activities and display them for people to read and give an option to mark everything as done
        await page.goto(chosenTerms.URL)
        const linksToVisit = await page.evaluate(() => {
            for (const toggle of document.querySelectorAll('button[data-toggletype="manual:mark-done"]')) {
                toggle.click();
            }
            // to read all the things
            const linksToVisit = []
            for (let activity of document.querySelectorAll('li.activity')) {
                if(activity.querySelector('img[alt*=File], img[alt*=URL]')){
                    if(activity.querySelector('div[data-region*=completionrequirements]')?.textContent.toLowerCase().includes('to do')) {
                        // console.log(activity.querySelector('a').href)
                        linksToVisit.push(activity.querySelector('a').href)
                    }
                }
            }
            return linksToVisit;
        })

        for (const link of linksToVisit) {
            await page.goto(link);
        }
        
        await browser.close();
        await interaction.editReply({ content: `You read ${linksToVisit.length} activities (That were not read)`
        +` and all the (non-submittable) work has been marked done :D. Run /assignments missing to see what submission assignments you need to complete`})

    }
}
        