# Trackspot Configuration

Trackspot can run with no configuration beyond installing dependencies and starting the server. For most local setups, copy `.env.example` to `.env` and adjust only the values you need.

```text
PORT=1060
HOST=0.0.0.0
DATA_DIR=./data
```

Relative paths in `.env`, including `DATA_DIR=./data`, are resolved from the Trackspot app directory. This keeps server startup and helper scripts pointed at the same data folder even when the process is launched by a service manager from another working directory.

## Server Binding

`PORT` controls the HTTP port. The default is:

```text
PORT=1060
```

`HOST` controls which network interface the server binds to. Trackspot defaults to:

```text
HOST=0.0.0.0
```

This makes the app reachable from your LAN or Tailscale network. Open it from another device with the server's LAN IP, Tailscale IP, or Tailscale DNS name:

```text
http://192.168.1.50:1060
http://100.x.y.z:1060
http://your-machine.your-tailnet.ts.net:1060
```

For local-only use, set:

```text
HOST=127.0.0.1
```

## Data Directory

`DATA_DIR` controls where Trackspot stores runtime data:

```text
DATA_DIR=./data
```

The data directory contains files such as:

- `albums.db`
- `images/`
- `preferences.json`
- `opacity-presets/`
- `themes/`
- uploaded background and theme preview assets

For a Linux service or home-server install, prefer an absolute data directory:

```text
HOST=0.0.0.0
PORT=1060
DATA_DIR=/var/lib/trackspot
```

## Security

Trackspot is designed for local or trusted-network use and has no authentication layer.

If you expose it beyond your own machine, bind carefully and put it behind a VPN, reverse proxy, or other access control you trust. Avoid exposing Trackspot directly to the public internet.

For single-machine use, bind to loopback only:

```text
HOST=127.0.0.1
```

For trusted LAN or Tailscale use, `HOST=0.0.0.0` is usually appropriate as long as network access is controlled elsewhere.

## CORS

`CORS_ALLOWED_ORIGINS` controls which browser origins may make state-changing API requests to Trackspot when the browser page origin is different from the Trackspot server origin.

For direct same-origin access, you usually do not need to list anything. For example, if you open Trackspot directly at one of these URLs, the browser page and the API requests share the same origin:

```text
http://192.168.1.50:1060
http://100.x.y.z:1060
http://trackspot.your-tailnet.ts.net:1060
```

If Trackspot is exposed through HTTPS by Tailscale Serve or another reverse proxy, the browser origin changes. For example, Tailscale Serve might expose Trackspot at:

```text
https://trackspot.your-tailnet.ts.net
```

In that case, add the exact HTTPS origin to `CORS_ALLOWED_ORIGINS`:

```text
CORS_ALLOWED_ORIGINS=https://trackspot.your-tailnet.ts.net
```

Use a comma-separated list if you need to allow more than one extra origin:

```text
CORS_ALLOWED_ORIGINS=https://trackspot.your-tailnet.ts.net,https://other.example.test
```

The app always allows Spotify Desktop origins and local loopback origins.

## Trusted Hosts

When `HOST` is set to a specific hostname or address, Trackspot rejects requests with unexpected `Host` headers. This helps avoid accidental cross-host access when the app is not bound to a wildcard interface.

If you run Trackspot behind a reverse proxy or access it through an additional hostname, add those hostnames to `TRUSTED_HOSTS`:

```text
TRUSTED_HOSTS=trackspot.local,100.64.0.10
```

`TRUSTED_HOSTS` is comma-separated. Include hostnames or IP addresses, not full URLs.

## Backup Upload Limit

Backup uploads are staged under `DATA_DIR` before restore or merge. The upload limit is configured in bytes:

```text
BACKUP_UPLOAD_MAX_BYTES=5368709120
```

The default is `5368709120`, which is 5 GiB.

## Spicetify With A Home Server

If Spotify Desktop and Trackspot run on the same machine, the Spicetify extension can usually use the local HTTP URL:

```text
http://localhost:1060
```

If Spotify Desktop runs on a different machine from Trackspot, the extension should use an HTTPS URL. Spotify Desktop loads its app UI over HTTPS, so calls from Spicetify to a remote `http://...` Trackspot server can be blocked by the browser as mixed content.

For a Tailscale Serve setup, set the Spicetify extension server URL to:

```text
https://trackspot.your-tailnet.ts.net
```

Then add that same origin to `.env`:

```text
CORS_ALLOWED_ORIGINS=https://trackspot.your-tailnet.ts.net
```

Restart Trackspot after editing `.env`, then import one album and open Trackspot from the extension to confirm the path.

## Style Presets

Run this after editing files in `styles/`:

```bash
npm run styles:sync
```

Startup validates the generated browser preset module but does not rewrite files under `public/`.
