const cron = require("node-cron");
const nodemailer = require("nodemailer");
const pool = require("./db");
const { getAllPrices } = require("./prices");
 
// ── Notifiers ──
 
function notifyConsole(coin, currentPrice, targetPrice, direction) {
  console.log(`🚨 ALERT TRIGGERED: ${coin.toUpperCase()}`);
  console.log(`   Direction: ${direction} $${targetPrice}`);
  console.log(`   Current price: $${currentPrice}`);
}
 
async function notifyEmail(coin, currentPrice, targetPrice, direction, to) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !to) {
    console.log("Email not configured or no user email, skipping");
    return;
  }
 
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
 
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: `🚨 InvestmentBot: ${coin.toUpperCase()} hit your target!`,
      text: `${coin.toUpperCase()} has gone ${direction} your target price.\n\nTarget: $${targetPrice}\nCurrent: $${currentPrice}\n\nThis alert has been auto-deleted.`,
    });
 
    console.log(`📧 Email alert sent to ${to} for ${coin}`);
  } catch (err) {
    console.error(`Email failed: ${err.message}`);
  }
}
 
async function notifyDiscord(coin, currentPrice, targetPrice, direction) {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.log("Discord not configured, skipping");
    return;
  }
 
  try {
    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `🚨 Price Alert: ${coin.toUpperCase()}`,
          color: direction === "above" ? 5763719 : 15548997,
          fields: [
            { name: "Direction", value: `Gone **${direction}** target`, inline: true },
            { name: "Target Price", value: `$${targetPrice}`, inline: true },
            { name: "Current Price", value: `$${currentPrice}`, inline: true },
          ],
          footer: { text: "InvestmentBot • Alert auto-deleted" },
          timestamp: new Date().toISOString(),
        }]
      }),
    });
 
    console.log(`💬 Discord alert sent for ${coin}`);
  } catch (err) {
    console.error(`Discord failed: ${err.message}`);
  }
}
 
// ── Cron Job ──
 
function startAlertCron() {
  cron.schedule("* * * * *", async () => {
    console.log("⏰ Checking price alerts...");
 
    try {
      const result = await pool.query("SELECT * FROM price_alerts");
      const alerts = result.rows;
 
      if (!alerts.length) {
        console.log("No alerts set");
        return;
      }
 
      const coinIds = [...new Set(alerts.map(a => a.coin.toLowerCase()))];
      const prices = await getAllPrices(coinIds);
 
      for (const alert of alerts) {
        const currentPrice = prices[alert.coin.toLowerCase()];
        if (!currentPrice) continue;
 
        const target = parseFloat(alert.target_price);
        const triggered =
          (alert.direction === "above" && currentPrice >= target) ||
          (alert.direction === "below" && currentPrice <= target);
 
        if (triggered) {
          // look up the user's email
          const userResult = await pool.query(
            "SELECT email FROM users WHERE id = $1",
            [alert.user_id]
          );
          const userEmail = userResult.rows[0]?.email;
 
          notifyConsole(alert.coin, currentPrice, target, alert.direction);
 
          await Promise.allSettled([
            notifyEmail(alert.coin, currentPrice, target, alert.direction, userEmail),
            notifyDiscord(alert.coin, currentPrice, target, alert.direction),
          ]);
 
          await pool.query("DELETE FROM price_alerts WHERE id = $1", [alert.id]);
          console.log(`✅ Alert ${alert.id} triggered and deleted`);
        }
      }
    } catch (err) {
      console.error("Alert cron error:", err);
    }
  });
 
  console.log("⏰ Price alert cron started");
}
 
module.exports = { startAlertCron };