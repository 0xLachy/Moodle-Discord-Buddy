const fs = require("fs")

const getFiles = (path, ending) => {
    return fs.readdirSync(path).filter(f=> f.endsWith(ending))
}

const LismLogin = async (page, url) => {
    await page.goto(url);
    // dom element selectors
    const USERNAME_SELECTOR = '#username';
    const PASSWORD_SELECTOR = '#password';
    const BUTTON_SELECTOR = 'body > div > div > div > div.uk-card-body.uk-text-left > div > div.uk-width-3-4 > form > div.uk-margin.uk-text-right > button';

    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(process.env.LISMNAME);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(process.env.PASSWORD);
    await Promise.all([
    page.click(BUTTON_SELECTOR),
    page.waitForNavigation()
    ])
}

module.exports = {
    getFiles,
    LismLogin
}