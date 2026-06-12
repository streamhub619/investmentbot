require("dotenv").config();
 
const express = require("express");
const pool = require("./db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { generateToken, authenticateToken } = require("./auth");
const { getAllPrices } = require("./prices");
const { startAlertCron } = require("./alerts");
const { sendPasswordResetEmail } = require("./mailer");
 
const app = express();
 
app.use(express.json());
app.use(express.static("public"));
 
// --- DB init ---
async function initDB() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (err) {
      console.log(`Waiting for database... attempt ${attempt}/10`);
      if (attempt === 10) throw new Error("Could not connect to database");
      await new Promise(r => setTimeout(r, 2000));
    }
  }
 
  // users FIRST
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
 
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
 
  // then investments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS investments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      purchase_price NUMERIC,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
 
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;`);
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`);
 
  // then price_alerts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coin TEXT NOT NULL,
      target_price NUMERIC NOT NULL,
      direction TEXT CHECK(direction IN ('above', 'below')) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
 
  console.log("Database ready");
}
 
initDB().then(() => startAlertCron());
 
// --- Input validation ---
function validateInvestment(name, amount, purchase_price = null) {
  const errors = [];
 
  if (!name || typeof name !== "string" || name.trim() === "") {
    errors.push("name is required and must be a non-empty string");
  }
 
  if (amount === undefined || amount === null) {
    errors.push("amount is required");
  } else if (isNaN(amount) || Number(amount) <= 0) {
    errors.push("amount must be a positive number");
  }
 
  if (purchase_price !== null && purchase_price !== undefined) {
    if (isNaN(purchase_price) || Number(purchase_price) <= 0) {
      errors.push("purchase_price must be a positive number");
    }
  }
 
  return errors;
}
 
// --- Auth routes ---
 
app.post("/auth/register", async (req, res) => {
  const { username, password, email } = req.body;
 
  if (!username || !password || !email) {
    return res.status(400).json({ error: "Email, username and password are required" });
  }
 
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
 
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email, created_at",
      [username.trim().toLowerCase(), hashedPassword, email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Username already taken" });
    }
    console.error(err);
    res.status(500).send("Error registering user");
  }
});
 
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
 
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
 
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username.trim().toLowerCase()]
    );
 
    const user = result.rows[0];
 
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
 
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
 
    const token = generateToken(user);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error logging in");
  }
});
 
// --- General routes ---
 
app.get("/time", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});
 
// --- Investment routes ---
 
app.post("/investments", authenticateToken, async (req, res) => {
  const { name, amount, purchase_price } = req.body;
 
  const errors = validateInvestment(name, amount, purchase_price);
  if (errors.length > 0) return res.status(400).json({ errors });
 
  try {
    const result = await pool.query(
      "INSERT INTO investments (user_id, name, amount, purchase_price) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.user.id, name.trim().toLowerCase(), Number(amount), purchase_price ? Number(purchase_price) : null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating investment");
  }
});
 
app.get("/investments", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM investments WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching investments");
  }
});
 
app.get("/portfolio/summary", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        name,
        SUM(amount) AS amount,
        ROUND(
          SUM(amount * purchase_price) / NULLIF(SUM(CASE WHEN purchase_price IS NOT NULL THEN amount ELSE 0 END), 0),
          2
        ) AS purchase_price
      FROM investments
      WHERE user_id = $1
      GROUP BY name
    `, [req.user.id]);
 
    const investments = result.rows;
 
    if (investments.length === 0) {
      return res.json({
        totalCurrentValue: "0.00",
        totalCostBasis: "n/a",
        totalProfitLoss: "n/a",
        assets: [],
      });
    }
 
    const coinIds = investments.map((inv) => inv.name.toLowerCase());
    const prices = await getAllPrices(coinIds);
 
    let totalCurrentValue = 0;
    let totalCostBasis = 0;
    const portfolio = [];
 
    for (const inv of investments) {
      const coinId = inv.name.toLowerCase();
      const currentPrice = prices[coinId];
 
      if (!currentPrice) continue;
 
      const quantity = Number(inv.amount);
      const currentValue = quantity * currentPrice;
      totalCurrentValue += currentValue;
 
      let profitLoss = null;
      let profitLossPct = null;
 
      if (inv.purchase_price) {
        const costBasis = quantity * Number(inv.purchase_price);
        totalCostBasis += costBasis;
        profitLoss = currentValue - costBasis;
        profitLossPct = ((profitLoss / costBasis) * 100).toFixed(2);
      }
 
      portfolio.push({
        coin: coinId,
        quantity,
        currentPrice,
        currentValue: currentValue.toFixed(2),
        purchasePrice: inv.purchase_price ? Number(inv.purchase_price) : null,
        profitLoss: profitLoss !== null ? profitLoss.toFixed(2) : "n/a",
        profitLossPct: profitLossPct !== null ? `${profitLossPct}%` : "n/a",
      });
    }
 
    res.json({
      totalCurrentValue: totalCurrentValue.toFixed(2),
      totalCostBasis: totalCostBasis > 0 ? totalCostBasis.toFixed(2) : "n/a",
      totalProfitLoss:
        totalCostBasis > 0
          ? (totalCurrentValue - totalCostBasis).toFixed(2)
          : "n/a",
      assets: portfolio,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching portfolio");
  }
});
 
app.put("/investments/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, amount, purchase_price } = req.body;
 
  const errors = validateInvestment(name, amount, purchase_price);
  if (errors.length > 0) return res.status(400).json({ errors });
 
  try {
    const result = await pool.query(
      "UPDATE investments SET name = $1, amount = $2, purchase_price = $3 WHERE id = $4 AND user_id = $5 RETURNING *",
      [name.trim().toLowerCase(), Number(amount), purchase_price ? Number(purchase_price) : null, id, req.user.id]
    );
 
    if (result.rows.length === 0) return res.status(404).send("Investment not found");
 
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating investment");
  }
});
 
app.delete("/investments/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
 
  try {
    const result = await pool.query(
      "DELETE FROM investments WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.user.id]
    );
 
    if (result.rows.length === 0) return res.status(404).send("Investment not found");
 
    res.send("Deleted successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting investment");
  }
});
 
// --- Alert routes ---
 
app.post("/alerts", authenticateToken, async (req, res) => {
  const { coin, target_price, direction } = req.body;
 
  if (!coin || !target_price || !direction) {
    return res.status(400).json({ error: "coin, target_price and direction are required" });
  }
 
  if (!["above", "below"].includes(direction)) {
    return res.status(400).json({ error: "direction must be 'above' or 'below'" });
  }
 
  try {
    const result = await pool.query(
      "INSERT INTO price_alerts (user_id, coin, target_price, direction) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.user.id, coin.trim().toLowerCase(), Number(target_price), direction]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating alert");
  }
});
 
app.get("/alerts", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send("Error fetching alerts");
  }
});
 
app.delete("/alerts/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).send("Alert not found");
    res.send("Alert deleted");
  } catch (err) {
    res.status(500).send("Error deleting alert");
  }
});

// Request password reset
app.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    // always respond the same way, even if user doesn't exist (prevents email enumeration)
    if (userResult.rows.length === 0) {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    const userId = userResult.rows[0].id;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [userId, token, expiresAt]
    );

    await sendPasswordResetEmail(email.trim().toLowerCase(), token);

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing password reset");
  }
});

// Reset password using token
app.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const { user_id } = result.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, user_id]);

    // delete the used token
    await pool.query("DELETE FROM password_reset_tokens WHERE token = $1", [token]);

    res.json({ message: "Password updated successfully. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error resetting password");
  }
});
 
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});