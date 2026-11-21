# ColdShore Online server

Co-op for up to 6 players per crew. This server hosts the game itself and runs the online sessions, so players just open its address in a browser and pick **Online Co-op** on the title screen.

What lives on the server: crews and invite codes, the shared settlement (Haven), the mission board, objectives, rewards, difficulty and player profiles. They're saved to `data/db.json`.

What lives in the players' browsers: rendering and movement. For each mission the server makes one player the **sim host**, whose game runs the zombie AI and streams it to the rest of the crew. If the sim host leaves, the server hands the job to another player mid-mission.

The design (story, chapters, mission types, upgrades, difficulty) is in `ONLINE_DESIGN.md`.

## Run it on your own computer

You need Node.js 18 or newer.

```
npm install
sh tools/pack.sh /path/to/your/coldshore/game/folder   # copies index.html and the .json assets into public/
npm start                                              # listens on port 8080
```

Open http://localhost:8080 and choose **Online Co-op**. The server field fills in automatically.

To play with friends on the same Wi-Fi, they open `http://<your computer's local IP>:8080`.

To play with friends elsewhere, either:
- forward port 8080 on your router to your computer, or
- run a tunnel, for example `npx localtunnel --port 8080` or `cloudflared tunnel --url http://localhost:8080`, and send them the https address it prints.

## Put it on the internet (Render)

1. Run `sh tools/pack.sh <game folder>` so `public/` has the game files.
2. Push this folder to a GitHub repository.
3. On render.com, choose New → Blueprint and pick the repository. `render.yaml` sets up a Docker web service with a 1 GB disk for the save data.
4. Share the `https://….onrender.com` address with your crew.

The game connects over `wss://` automatically when the page is served over https.

Any other Docker host works too (Fly.io, Railway, a VPS):

```
docker build -t coldshore-online .
docker run -p 8080:8080 -v coldshore-data:/data coldshore-online
```

## Settings

| Variable | Default | What it does |
|---|---|---|
| `PORT` | 8080 | HTTP and WebSocket port |
| `PUBLIC_DIR` | `./public` | Folder with the game files |
| `DATA_DIR` | `./data` | Where `db.json` is saved |

`GET /healthz` returns `ok`. `GET /api/stats` shows the number of crews and players online.

## Testing without a second player

`tools/bot.js` is a scripted player with no graphics:

```
node tools/bot.js creator BotName           # makes a crew and prints the code; starts a mission once you join
node tools/bot.js joiner ABC123 BotName     # joins your crew and walks to each objective
```

Set `URL=wss://your-server` to point it at a deployed server. Set `MID=scavenge` (or airdrop, defend, clear, convoy) to choose which contract the creator starts.

## Limits

- **The sim host's connection and computer set the zombie quality for everyone.** The server picks the player with the lowest ping.
- **Each player's game is trusted** for its own position and the damage it deals. That's fine among friends; it isn't anti-cheat.
- **The world is the same seeded map for everyone.** Outland chunks build the same way on every machine. Small props there can differ, which doesn't affect play.
