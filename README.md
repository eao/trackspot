## Trackspot

Trackspot is a local-first album tracking app for Spotify users. It runs as a small Express server and serves a vanilla JavaScript app directly from `public/`.

Use it to keep a personal album collection, import albums from Spotify, browse your listening backlog, and customize the app with local themes and backgrounds. Trackspot stores its runtime data on your machine and is designed for local or trusted-network use.

## Requirements

- Node.js `>=20.19 <26`
- npm `>=10`
- Native build tools for `better-sqlite3` if your platform does not have a prebuilt binary available

On Debian/Ubuntu-style Linux systems, the usual native build prerequisites are:

```bash
sudo apt install python3 make g++
```

## Quick Start

```bash
npm install
npm start
```

The default local URL is:

```text
http://localhost:1060
```

## Configuration

Trackspot works out of the box for local use. For host/port settings, data directory placement, home-server notes, CORS, upload limits, and security-related guidance, see [CONFIG.md](CONFIG.md).

Trackspot has no authentication layer. If you make it reachable beyond your own machine, put it behind a VPN, reverse proxy, or another access-control setup you trust.

## License

Trackspot is licensed under the MIT License. See [LICENSE.md](LICENSE.md).
