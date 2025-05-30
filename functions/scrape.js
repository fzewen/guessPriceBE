const puppeteer = require("puppeteer");

async function getSaleInfoFromMls(mlsId) {
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

// Example usage
getSaleInfoFromMls("ML81952283").then(console.log);
