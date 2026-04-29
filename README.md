## Trackspot

Trackspot is a local-first album tracking app for Spotify users. It runs as a small Express server and serves a vanilla JavaScript app directly from `public/`.

Use it to keep a personal album collection, import albums from Spotify, browse your listening backlog, and customize the app with local themes and backgrounds. Trackspot stores its runtime data on your machine and is designed for local or trusted-network use.

## Requirements

- Node.js `>=20.19 <26`
- npm `>=10`
- Native build tools for `better-sqlite3` if your platform does not have a prebuilt binary available

## Install And Run

Trackspot does not have a build step. Once Node.js and npm are installed, you install the dependencies and start the local server.

First, install Node.js. Trackspot expects Node.js `>=20.19 <26`; Node.js 24 is a good choice. If you do not already have Node.js installed, download it from [nodejs.org](https://nodejs.org/) and install it with the default options.

After installing Node.js, open a new terminal and check that these commands work:

```bash
node --version
npm --version
```

If either command is missing, Node.js is not installed correctly yet.

### Linux/macOS

1. Open Terminal.
2. Go to the Trackspot folder. If you downloaded it to `Downloads`, the command probably looks like one of these:

```bash
cd "$HOME/Downloads/trackspot"
```

or:

```bash
cd "$HOME/Downloads/trackspot-main"
```

3. Install the app dependencies:

```bash
npm install
```

4. Start Trackspot:

```bash
npm start
```

Keep that terminal window open while you use the app. Press `Ctrl+C` in the terminal when you want to stop the server.

If you are on Linux and `npm install` fails while building `better-sqlite3`, install the usual native build tools and try again:

```bash
sudo apt update
sudo apt install python3 make g++
npm install
npm start
```

### Windows

1. Open PowerShell.
2. Go to the Trackspot folder. If you downloaded it to `Downloads`, the command probably looks like one of these:

```powershell
cd "$env:USERPROFILE\Downloads\trackspot"
```

or:

```powershell
cd "$env:USERPROFILE\Downloads\trackspot-main"
```

3. Install the app dependencies:

```powershell
npm install
```

4. Start Trackspot:

```powershell
npm start
```

Keep that PowerShell window open while you use the app. Press `Ctrl+C` in PowerShell when you want to stop the server.

If Windows asks whether Node.js can access the network, allow it for private/local networks.

### Open The App

When the server says it is listening, open this address in your browser:

```text
http://localhost:1060
```

## Configuration

Trackspot works out of the box for local use. For host/port settings, data directory placement, home-server notes, CORS, upload limits, and security-related guidance, see [CONFIG.md](CONFIG.md).

Trackspot has no authentication layer. If you make it reachable beyond your own machine, put it behind a VPN, reverse proxy, or another access-control setup you trust.

## License

Trackspot is licensed under the MIT License. See [LICENSE.md](LICENSE.md).
