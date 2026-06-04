const redis = require("./redis");

async function getAllPrices(coinIds) {
  const toFetch = [];
  const prices = {};

  for (const coinId of coinIds) {
    const cached = await redis.get(`price:${coinId}`);
    if (cached) {
      console.log(`Cache hit: ${coinId}`);
      prices[coinId] = parseFloat(cached);
    } else {
      toFetch.push(coinId);
    }
  }

  if (toFetch.length > 0) {
    console.log(`Cache miss — fetching: ${toFetch.join(", ")}`);

    let data = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${toFetch.join(",")}&vs_currencies=usd`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        data = await response.json();
        break;
      } catch (err) {
        console.log(`CoinGecko attempt ${attempt} failed: ${err.message}`);
        if (attempt === 3) return prices;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (data) {
      for (const coinId of toFetch) {
        const price = data?.[coinId]?.usd;
        if (price) {
          await redis.set(`price:${coinId}`, price, "EX", 60);
          prices[coinId] = price;
        } else {
          console.log(`No price found for: ${coinId}`);
        }
      }
    }
  }

  return prices;
}

module.exports = { getAllPrices };