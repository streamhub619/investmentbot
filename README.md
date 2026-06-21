# InvestmentBot

A crypto portfolio tracker with live prices, profit/loss tracking, price alerts, and exchange integrations.

## Stack
- Node.js + Express
- PostgreSQL
- Redis
- Docker

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your values
3. Run `docker-compose up --build`
4. Open `http://localhost:3000`

## Features
- Track crypto investments with live CoinGecko prices
- Profit/loss calculation
- Price alerts via email and Discord
- Binance and Coinbase integration
- JWT authentication with per-user data
