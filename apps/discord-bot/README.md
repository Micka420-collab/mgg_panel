# MGG Discord control bot

Control your MGG game servers from Discord with **global** slash commands.
It talks to the public `/api/v1` using an **API key** you create in your MGG
account (Account → API keys). Single-tenant: the bot acts as that one account,
and the API key's scopes decide what it is allowed to do.

## Commands

| Command | Action |
|---------|--------|
| `/servers` | List your servers (name, game, state, id, address) |
| `/status <server>` | Live state, address and player count |
| `/start <server>` | Start a server |
| `/stop <server>` | Stop a server |
| `/restart <server>` | Restart a server |
| `/say <server> <message>` | Broadcast a message in-game (console `say`) |
| `/backup <server>` | Create a backup |

`<server>` matches by exact id, exact name, or a partial id/name (case-insensitive).

## Required API-key scopes

| Command | Scope |
|---------|-------|
| `/servers`, `/status` | `allocation.read` (+ `players.read` for the player count) |
| `/start` | `control.start` |
| `/stop`, `/restart` | `control.stop` |
| `/say` | `control.command` |
| `/backup` | `backup.create` |

## Configuration

| Env var | Required | Description |
|---------|----------|-------------|
| `DISCORD_TOKEN` | yes | Discord bot token |
| `DISCORD_CLIENT_ID` | yes | Discord application (client) id |
| `MGG_API_KEY` | yes | MGG API key (`aeth_…`) |
| `MGG_API_URL` | no | MGG panel base URL (default `http://localhost:3000`) |

## Setup

1. Create a Discord application + bot at <https://discord.com/developers>, copy
   the **bot token** and **application (client) id**. Invite it to your server
   with the `applications.commands` scope.
2. In MGG, create an API key with the scopes for the commands you want to use
   (see the table above).
3. Configure env and run:

```bash
cd apps/discord-bot
export DISCORD_TOKEN=...        # bot token
export DISCORD_CLIENT_ID=...    # application id
export MGG_API_KEY=aeth_...  # your MGG API key
export MGG_API_URL=http://localhost:3000

npm install
npm run build      # compile src -> dist
npm start          # registers global commands on boot, then runs the bot
```

Or build the Docker image (build context is this directory):

```bash
docker build -t mgg/discord-bot apps/discord-bot
```

The bot **registers its global slash commands on every boot**, so updates roll
out automatically. Global commands can take up to ~1 hour to first appear in a
guild; after that they update near-instantly.
