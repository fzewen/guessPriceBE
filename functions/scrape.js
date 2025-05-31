import puppeteer from "puppeteer";

let counter = 0;
export const getSaleInfoFromMls = async (mlsId) => {
  counter++;
  const url = `https://www.mlslistings.com/Property/${mlsId}`;
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  console.log("STARTED IN NODE", counter);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    const data = await page.evaluate(() => {
      const status = document.getElementsByClassName('status-closed')[0]? "Sold" : "Unknown";
      const priceMatch = document
        .querySelector('meta[name="description"]')
        .getAttribute('content')
        .match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);
      const price = priceMatch?.[0] || "Unknown";
      return { status, price };
    });

    return { mlsId, ...data };
  } catch (err) {
    return { mlsId, status: "Error", price: "Error", error: err.message };
  } finally {
    await browser.close();
  }
}

export const rankGuesses = (guesses, soldPrice) => {
  // Convert to array of [userId, diff]
  console.log(typeof soldPrice);
  const diffs = Object.entries(guesses).map(([userId, price]) => {
    console.log(userId);
    console.log(price);
    console.log(soldPrice);
    console.log(Math.abs(price - soldPrice));
    return { userId, diff: Math.abs(price - soldPrice) };
  });

  console.log(diffs);

  // Sort by absolute difference (ascending)
  diffs.sort((a, b) => a.diff - b.diff);
  console.log("here");
  console.log(diffs);

  // Assign ranks
  const ranks = {};
  diffs.forEach((entry, index) => {
    console.log(guesses[entry.userId]);
    ranks[entry.userId] = [index + 1, guesses[entry.userId]]; // rank starts from 1
  });
  console.log(ranks);
  return ranks;
}

