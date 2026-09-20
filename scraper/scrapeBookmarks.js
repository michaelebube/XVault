const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-key-syncbird.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();


const COOKIE = process.env.TWITTER_AUTH_TOKEN || ''

async function scrollUntilEnd(page, maxScrolls = 50, delay = 2000) {
  // Initial count before scrolling
  let previousCount = await page.$$eval('[data-testid="tweet"]', (tweets) => tweets.length);
  console.log(`🔍 Found ${previousCount} tweets before scrolling.`);

  // If we already have a few tweets and the scroll bar is short — skip scrolling
  const canScroll = await page.evaluate(() => {
    return document.documentElement.scrollHeight > window.innerHeight * 1.5;
  });

  if (!canScroll) {
    console.log('✅ Page is short — skipping scroll.');
    return;
  }

  let stableScrolls = 0;

  for (let i = 0; i < maxScrolls && stableScrolls < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(delay);

    const tweetCount = await page.$$eval('[data-testid="tweet"]', (tweets) => tweets.length);

    if (tweetCount === previousCount) {
      stableScrolls++;
    } else {
      stableScrolls = 0;
      previousCount = tweetCount;
    }

    console.log(`🔁 Scroll ${i + 1}: ${tweetCount} tweets detected`);

    // If no growth after a few scrolls, exit early
    if (stableScrolls >= 3) {
      console.log('🛑 No new tweets found — stopping scroll.');
      break;
    }
  }

  console.log('✅ Finished scrolling.');
}

  

async function scrapeBookmarks() {
  const browser = await chromium.launch({ headless: false })

  const context = await browser.newContext({
  storageState: undefined,
});


  await context.addCookies([
    {
      name: 'auth_token',
      value: COOKIE,
      domain: '.x.com',
      path: '/',
      httpOnly: true,
      secure: true
    }
  ])

  const page = await context.newPage()

await page.goto('https://x.com/home', { waitUntil: 'networkidle' });

  await page.goto('https://x.com/i/bookmarks', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 60000 })
  await scrollUntilEnd(page, 500, 3000);

  await page.waitForTimeout(5000)

  const tweets = await page.$$eval('[data-testid="tweet"]', (nodes) =>
    nodes.map((el) => {
      const text = el.innerText
      const link = el.querySelector('a[href*="/status/"]')?.href || ''
      const author = el.querySelector('div[dir="ltr"] span')?.innerText || 'Unknown'
      return {
        id: link.split('/').pop(),
        text,
        url: link,
        author,
        dateCreated: new Date().toISOString(),
        tags: []
      }
    })
  )



  for (const tweet of tweets) {
  const docRef = db.collection('bookmarks').doc(tweet.id);
  await docRef.set(tweet, { merge: true });
}

  console.log(`✅ Scraped ${tweets.length} tweets`)
  await browser.close()
}

scrapeBookmarks()