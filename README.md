# Discord AI Bot — Enterprise Edition

> Enterprise-grade Discord bot with server cloning and AI-powered server generation.
> OpenRouter (primary) + Groq (fallback) AI • MongoDB • Discord.js v14

---

## Features

### 🔄 Server Cloner
Fully clone any Discord server the bot is a member of:
- All categories, channels, and their positions
- All roles with colors, permissions, and hierarchy
- Permission overwrites on channels and categories
- Server icon, banner, description, verification level
- Emojis and stickers (up to server limits)
- AFK/system channel mappings
- Forum channels, voice channels, stage channels, announcement channels
- Pre-clone backup automatically created

### 🤖 AI Server Generator
Generate a complete server structure from a text prompt:
- Uses OpenRouter (Claude 3.5 Sonnet) as primary AI
- Automatically falls back to Groq (Llama 3.3 70B) on any failure
- Generates roles, categories, channels, topics, permissions
- Themed content that feels professionally hand-crafted
- Pre-generation backup automatically created

### 📦 Backup System
- Manual and automatic backups
- Serializes full server structure to MongoDB
- 30-day default expiry with configurable extension
- Restore from any saved backup

### 🛡️ Security
- Per-user rate limiting with cooldowns
- Suspicious activity detection and auto-blocking
- Input sanitization on all user inputs
- Token and API key masking in logs
- Admin/owner permission gates
- Bot permission validation before every destructive action

### 📊 Monitoring
- Full structured logging (Winston + daily rotate)
- AI provider health checks
- Queue status dashboard
- Per-server and global statistics
- MongoDB event logs with TTL cleanup

---

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB (local or Atlas)
- Discord Application with bot token
- OpenRouter API key (https://openrouter.ai)
- Groq API key (https://console.groq.com) — optional but recommended

### 1. Clone and Install

```bash
git clone <repo>
cd discord-ai-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required:
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
OPENROUTER_API_KEY=your_openrouter_key
MONGODB_URI=mongodb://localhost:27017/discord-ai-bot
```

### 3. Deploy Slash Commands

```bash
# Deploy to a specific test guild (instant):
DISCORD_GUILD_ID=your_guild_id npm run deploy-commands

# Deploy globally (takes up to 1 hour to propagate):
npm run deploy-commands -- --global
```

### 4. Start the Bot

```bash
# Development (with auto-restart):
npm run dev

# Production:
npm start

# With PM2:
npm run pm2:start
```

---

## Docker Deployment

### Single container (bring your own MongoDB):
```bash
docker build -t discord-ai-bot .
docker run -d --env-file .env discord-ai-bot
```

### Full stack with Docker Compose:
```bash
# Start bot + MongoDB:
docker compose up -d

# With MongoDB Express UI:
docker compose --profile dev up -d

# View logs:
docker compose logs -f bot
```

---

## Railway Deployment

1. Push to GitHub
2. Create a new project on [Railway](https://railway.app)
3. Add a MongoDB service (or use MongoDB Atlas)
4. Set all environment variables from `.env.example`
5. Deploy — Railway auto-detects Node.js

---

## VPS Deployment (Ubuntu/Debian)

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# Install MongoDB
# (follow official MongoDB docs for your distro)

# Install PM2
sudo npm install -g pm2

# Clone and setup
git clone <repo> && cd discord-ai-bot
npm install

# Configure
cp .env.example .env && nano .env

# Deploy commands
npm run deploy-commands -- --global

# Start with PM2
npm run pm2:start
pm2 save
pm2 startup
```

---

## Commands

| Command | Description | Permission |
|---|---|---|
| `/clone` | Clone a server by invite or ID | Administrator |
| `/generate` | AI-generate a server from a prompt | Administrator |
| `/backup create` | Backup this server | Administrator |
| `/backup list` | List your backups | Administrator |
| `/backup info` | Inspect a backup | Administrator |
| `/backup delete` | Delete a backup | Administrator |
| `/restore` | Restore a backup | Administrator |
| `/stats bot` | Bot statistics | Any |
| `/stats ai` | AI provider health | Any |
| `/stats queue` | Queue status | Any |
| `/stats server` | Server statistics | Any |
| `/help` | Command reference | Any |

---

## AI Failover Logic

```
Request received
    │
    ▼
OpenRouter available?
    ├─ YES → Try OpenRouter (up to 3 retries with backoff)
    │           ├─ SUCCESS → Return response
    │           └─ FAIL (timeout/rate limit/error) → Log failover
    │
    └─ NO/FAIL → Try Groq (up to 3 retries with backoff)
                    ├─ SUCCESS → Return response (marked as fallback)
                    └─ FAIL → Throw user-friendly error
```

All failovers are logged to MongoDB with full context.

---

## Project Structure

```
src/
├── index.js              — Entry point, bootstraps everything
├── client.js             — Discord client creation and process handlers
├── config.js             — Centralized config from env vars
│
├── ai/
│   ├── AIManager.js      — Orchestrates providers, retry, failover
│   └── providers/
│       ├── OpenRouterProvider.js  — Primary AI (OpenRouter)
│       └── GroqProvider.js        — Fallback AI (Groq)
│
├── commands/
│   ├── clone.js          — /clone command
│   ├── generate.js       — /generate command
│   ├── backup.js         — /backup subcommands
│   ├── restore.js        — /restore command
│   ├── stats.js          — /stats subcommands
│   └── help.js           — /help command
│
├── events/
│   ├── ready.js          — Bot ready, DB connect, activity rotation
│   ├── interactionCreate.js — Command routing, rate limit, error handling
│   ├── error.js          — Discord client error handler
│   ├── guildCreate.js    — Welcome message + DB record on join
│   └── guildDelete.js    — Log removal
│
├── handlers/
│   ├── CommandHandler.js — Dynamic command loading and cooldowns
│   └── EventHandler.js   — Dynamic event registration
│
├── systems/
│   ├── ServerCloner.js        — Full server clone implementation
│   ├── AIServerGenerator.js   — AI structure generation + application
│   ├── BackupSystem.js        — Serialization and restore
│   ├── QueueSystem.js         — p-queue based job queue
│   └── CacheSystem.js         — node-cache multi-namespace cache
│
├── database/
│   ├── connection.js          — Mongoose connection with auto-reconnect
│   └── models/
│       ├── Guild.js           — Per-server config and history
│       ├── User.js            — User data, bans, premium
│       ├── ServerBackup.js    — Full server backup documents
│       ├── Template.js        — Public server templates
│       └── Log.js             — Event log with TTL
│
├── security/
│   └── SecurityManager.js    — Permission checks, sanitization, abuse detection
│
└── utils/
    ├── Logger.js              — Winston logger with daily rotation
    ├── EmbedBuilder.js        — Discord embed factory
    ├── RateLimiter.js         — Per-user rate limits
    └── Validator.js           — Input validation (Joi + Discord-specific)
```

---

## Environment Variables

See [.env.example](.env.example) for full reference.

---

## License

MIT
