import puppeteer from "puppeteer";

export const getSaleInfoFromMls = async (mlsId) => {
  const url = `https://www.mlslistings.com/Property/${mlsId}`;
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  console.log("started");

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
  const diffs = Object.entries(guesses).map(([userId, price]) => {
    return { userId, diff: Math.abs(price - soldPrice) };
  });

  // Sort by absolute difference (ascending)
  diffs.sort((a, b) => a.diff - b.diff);

  // Assign ranks
  const ranks = {};
  diffs.forEach((entry, index) => {
    ranks[entry.userId] = index + 1; // rank starts from 1
  });

  return ranks;
}

