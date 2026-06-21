const cron = require("node-cron");
const pool = require("./db");
const { getBinanceTrades, getCoinbaseTrades } = require("./exchange");
const { decryptKey } = require("./encryption");

async function syncExchange(connection) {
  const apiKey = decryptKey(connection.api_key);
  const apiSecret = decryptKey(connection.api_secret);

  let trades = {};

  try {
    if (connection.exchange === "binance") {
      trades = await getBinanceTrades(apiKey, apiSecret);
    } else if (connection.exchange === "coinbase") {
      trades = await getCoinbaseTrades(apiKey, apiSecret);
    }
  } catch (err) {
    console.error(`Sync failed for ${connection.exchange}: ${err.message}`);
    return;
  }

  for (const [coin, data] of Object.entries(trades)) {
    // upsert — update if exists, insert if not
    await pool.query(`
      INSERT INTO investments (user_id, name, amount, purchase_price, source)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, name, source)
      DO UPDATE SET amount = $3, purchase_price = $4, updated_at = NOW()
    `, [connection.user_id, coin, data.amount, data.purchase_price, connection.exchange]);
  }

  await pool.query(
    "UPDATE exchange_connections SET last_synced_at = NOW() WHERE id = $1",
    [connection.id]
  );

  console.log(`✅ Synced ${Object.keys(trades).length} coins from ${connection.exchange} for user ${connection.user_id}`);
}

async function syncAllExchanges() {
  console.log("🔄 Syncing exchanges...");
  try {
    const result = await pool.query("SELECT * FROM exchange_connections");
    for (const connection of result.rows) {
      await syncExchange(connection);
    }
  } catch (err) {
    console.error("Exchange sync error:", err);
  }
}

function startSyncCron() {
  // sync every hour
  cron.schedule("0 * * * *", syncAllExchanges);
  console.log("🔄 Exchange sync cron started (every hour)");
}

module.exports = { startSyncCron, syncAllExchanges, syncExchange };