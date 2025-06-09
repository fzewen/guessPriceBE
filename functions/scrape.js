import puppeteer from "puppeteer";

let counter = 0;
export const getSaleInfoFromMls = async (mlsId) => {
  counter++;
  const url = `https://www.mlslistings.com/Property/${mlsId}`;


  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: puppeteer.executablePath(), // Use Puppeteer's bundled Chromium
  });

  const page = await browser.newPage();

  // Capture browser console logs and print them in Node.js
  page.on("console", (msg) => {
    console.log("BROWSER LOG:", msg.text());
  });

  console.log("STARTED IN NODE", counter);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });

    const data = await page.evaluate(() => {
      // Match elements with class names starting with "status-"
      console.log("page.evaluate......"); // This will now be captured
      const statusElements = document.querySelectorAll('[class*=" status-"]');
      console.log("statusElements", statusElements.length); // This will now be captured
      const status = statusElements.length > 0 ? statusElements[0].textContent.trim() : "Unknown";

      const priceMatch = document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
        ?.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);
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

