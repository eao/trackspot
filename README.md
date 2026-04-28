## Trackspot

Trackspot is a local-first album tracking app for Spotify users. It runs as a small Express server and serves a vanilla JavaScript app directly from `public/`.

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

Copy `.env.example` to `.env` and adjust as needed:

```text
PORT=1060
HOST=0.0.0.0
DATA_DIR=./data
```

Relative paths in `.env`, including `DATA_DIR=./data`, are resolved from the Trackspot app directory. This keeps server startup and helper scripts pointed at the same data folder even when the process is launched by a service manager from another working directory.

Trackspot defaults to `HOST=0.0.0.0` so it is easy to reach from your LAN or Tailscale network; open it from another device with the server's LAN IP, Tailscale IP, or Tailscale DNS name:

```text
http://192.168.1.50:1060
http://100.x.y.z:1060
http://your-machine.your-tailnet.ts.net:1060
```

For local-only use, set `HOST=127.0.0.1` in `.env`.

## Home Server Notes

Trackspot has no authentication layer and is intended for local or trusted-network use. If you expose it beyond your own machine, bind carefully and put it behind a VPN, reverse proxy, or other access control you trust.

For a Linux service, prefer an absolute data directory:

```text
HOST=0.0.0.0
PORT=1060
DATA_DIR=/var/lib/trackspot
```

With `HOST=0.0.0.0`, same-origin access through LAN and Tailscale hostnames works without listing each address in `CORS_ALLOWED_ORIGINS`. Use `CORS_ALLOWED_ORIGINS` only for separate browser origins that need to call Trackspot APIs, such as nonstandard integrations.

If Spotify Desktop is on Windows and Trackspot runs on a Linux server, open the Trackspot settings menu in the Spicetify extension, set the server URL to `http://<server-hostname-or-ip>:1060`, then import one album and open Trackspot from the extension to confirm the path.

Run `npm run styles:sync` after editing files in `styles/`. Startup validates the generated browser preset module but does not rewrite files under `public/`.

## License

Trackspot is licensed under the MIT License. See [LICENSE.md](LICENSE.md).
