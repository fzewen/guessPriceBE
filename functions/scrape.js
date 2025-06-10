export const getSaleInfoFromMls = async (mlsId) => {
  const url = `https://www.mlslistings.com/api/listing/basic/${mlsId}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log('Fetched data:', data);

    let price = "Unknown";
    let status = "Unknown";

    if (data && data.listings && data.listings.length > 0) {
      price = data.listings[0].price;
      status = data.listings[0].status;
    }

    console.log('Parsed price:', price, 'Status:', status);
    return { status, price, error: null };
  } catch (error) {
    console.error('Fetch error:', error);
    return { status: "Error", price: "Error", error: error.message };
  }
}

export const rankGuesses = (guesses, soldPrice) => {
  const diffs = Object.entries(guesses).map(([userId, price]) => ({
    userId,
    diff: Math.abs(price - soldPrice),
  }));

  diffs.sort((a, b) => a.diff - b.diff);

  const ranks = {};
  diffs.forEach((entry, index) => {
    ranks[entry.userId] = [index + 1, guesses[entry.userId]]; // Rank starts from 1
  });

  return ranks;
};

