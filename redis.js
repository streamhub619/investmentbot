const Redis = require("ioredis");

const client = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    });

client.on("connect", () => console.log("Redis connected"));
client.on("error", (err) => console.error("Redis error:", err));

module.exports = client;