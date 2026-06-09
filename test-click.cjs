const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  await page.goto('http://localhost:3005');
  
  // Wait for the app to load
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    await page.waitForSelector('button[title="More Actions"]', { timeout: 5000 });
    console.log('Found button, clicking...');
    
    // We get the bounding box to see if it's visible
    const btn = await page.$('button[title="More Actions"]');
    const box = await btn.boundingBox();
    console.log('Button Box:', box);
    
    await btn.click();
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('Checking if dropdown exists...');
    const html = await page.content();
    if (html.includes('Edit Profile')) {
      console.log('Dropdown rendered in DOM!');
    } else {
      console.log('Dropdown NOT in DOM!');
    }
  } catch (err) {
    console.error(err);
  }
  
  await browser.close();
})();
