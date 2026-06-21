const axios = require("axios");
const crypto = require("crypto");

// ── Binance ──
async function getBinanceTrades(apiKey, apiSecret) {
  const baseURL = "https://api.binance.com";
  const timestamp = Date.now();

  // get all trading pairs that end in USDT
  const exchangeInfo = await axios.get(`${baseURL}/api/v3/exchangeInfo`);
  const usdtPairs = exchangeInfo.data.symbols
    .filter(s => s.quoteAsset === "USDT" && s.status === "TRADING")
    .map(s => s.baseAsset.toLowerCase())
    .slice(0, 20); // limit to top 20 to avoid rate limits

  const trades = {};

  for (const coin of usdtPairs) {
    const symbol = `${coin.toUpperCase()}USDT`;
    const query = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(query)
      .digest("hex");

    try {
      const res = await axios.get(
        `${baseURL}/api/v3/myTrades?${query}&signature=${signature}`,
        { headers: { "X-MBX-APIKEY": apiKey } }
      );

      if (res.data.length > 0) {
        // aggregate: total qty bought, weighted avg price
        let totalQty = 0;
        let totalCost = 0;

        res.data.forEach(trade => {
          if (trade.isBuyer) {
            const qty = parseFloat(trade.qty);
            const price = parseFloat(trade.price);
            totalQty += qty;
            totalCost += qty * price;
          }
        });

        if (totalQty > 0) {
          trades[coin] = {
            amount: totalQty,
            purchase_price: totalCost / totalQty
          };
        }
      }
    } catch (err) {
      // skip pairs with no trades
    }
  }

  return trades;
}

// ── Coinbase ──
async function getCoinbaseTrades(apiKey, apiSecret) {
  const baseURL = "https://api.coinbase.com";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const path = "/v2/accounts";
  const message = timestamp + method + path + "";

  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  const headers = {
    "CB-ACCESS-KEY": apiKey,
    "CB-ACCESS-SIGN": signature,
    "CB-ACCESS-TIMESTAMP": timestamp,
    "CB-VERSION": "2016-02-18",
  };

  const res = await axios.get(`${baseURL}${path}`, { headers });
  const accounts = res.data.data;

  const trades = {};

  for (const account of accounts) {
    const amount = parseFloat(account.balance.amount);
    const currency = account.balance.currency.toLowerCase();

    if (amount > 0 && currency !== "usd") {
      // get average buy price
      try {
        const buyPath = `/v2/accounts/${account.id}/buys`;
        const buyTimestamp = Math.floor(Date.now() / 1000).toString();
        const buyMessage = buyTimestamp + method + buyPath + "";
        const buySignature = crypto
          .createHmac("sha256", apiSecret)
          .update(buyMessage)
          .digest("hex");

        const buyRes = await axios.get(`${baseURL}${buyPath}`, {
          headers: {
            "CB-ACCESS-KEY": apiKey,
            "CB-ACCESS-SIGN": buySignature,
            "CB-ACCESS-TIMESTAMP": buyTimestamp,
            "CB-VERSION": "2016-02-18",
          }
        });

        const buys = buyRes.data.data;
        if (buys.length > 0) {
          let totalCost = 0;
          let totalQty = 0;
          buys.forEach(buy => {
            const qty = parseFloat(buy.amount.amount);
            const cost = parseFloat(buy.total.amount);
            totalQty += qty;
            totalCost += cost;
          });

          trades[currency] = {
            amount,
            purchase_price: totalQty > 0 ? totalCost / totalQty : null
          };
        }
      } catch (err) {
        trades[currency] = { amount, purchase_price: null };
      }
    }
  }

  return trades;
}

module.exports = { getBinanceTrades, getCoinbaseTrades };