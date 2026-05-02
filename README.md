# <img src="readme-files/trackspot-banner.png" alt="Trackspot" width="650">

Trackspot is a highly customizable, self-hosted album tracking app.


<img src="readme-files/trackspot-quadrants.png" alt="Trackspot list and grid views in different themes" width="900">

It can be used as-is, or in tandem with its Spicetify extension, which links its tracking functionality directly into Spotify. No Premium required.

<img src="readme-files/album-actions.png" alt="Spotify album actions" width="700">

Trackspot makes it easy to keep track of the albums you listen to, with 100-point ratings and personal notes put front-and-center. Auto-log any album you listen to in Spotify, then browse your collection in list view or grid view. See your stats on the Stats page, or get a year-end wrap-up on the Wrapped page. Export your data at any time as a database backup or as a CSV for putting in a spreadsheet.

## Spicetify Extension

Trackspot can keep track of your albums even if you don't use Spotify, but is most useful alongside its Spicetify extension. Install Spicetify [here](https://spicetify.app/#install).

Once you have Spicetify installed in Spotify, open up the Spicetify Marketplace by clicking on the shopping cart button in the upper-left.

<img src="readme-files/spicetify-marketplace-button.png" alt="Spicetify Marketplace button" width="200">

Once in the Marketplace, search for Trackspot. If you don't see it, hit "Load more" and it should come up. Then, hit "Install".

<img src="readme-files/spicetify-marketplace-search.png" alt="Spicetify marketplace search" width="400">

Or, if you like doing things the old-fashioned way, you can install `trackspot-spicetify.js` manually via the instructions [here](https://spicetify.app/docs/customization/extensions).

## Installation on Windows

Download the latest Windows Trackspot release from the [releases page](https://github.com/eao/trackspot/releases) or by clicking [here](https://github.com/eao/trackspot/releases/latest/download/Trackspot-Windows-x64.zip). After it downloads, extract the contents of the .zip file to where you want Trackspot to live.

Then, open the extracted Trackspot folder and double-click `Windows - Start Trackspot.bat`.

<img src="readme-files/windows-bat-files.png" alt="Windows bat files" width="317">

The first run will install Trackspot's dependencies, which can take a few minutes. If Windows asks whether Node.js can access the network, allow it for private networks.

After that, Trackspot will start and open in your default browser. If you double-click `Windows - Start Trackspot.bat` when Trackspot is already running, it will just open the browser to Trackspot again.

And, when you want to stop Trackspot, double-click `Windows - Stop Trackspot.bat`.

## Installation on Linux

This section treats `/home/spotty/trackspot` as the canonical install path. You can make a new "spotty" user for that path, replace it with a different install path, or, for maximum ease of installation, run as root but put Trackspot in `/home/spotty/trackspot` anyway.

First, install [Node.js](https://nodejs.org/en/download). Trackspot supports `>=20.19 <26` and was tested with v24 LTS using nvm.

Then run:

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates build-essential python3
```

(You may need to omit `sudo` depending on your setup.)

If running as root, create the install directory:

```bash
mkdir -p /home/spotty/trackspot
```

Then clone the repository to the install directory and run `npm install`.

```bash
git clone -b main https://github.com/eao/trackspot.git /home/spotty/trackspot && cd /home/spotty/trackspot && npm install
```

Then start the server:

```bash
npm start
```

Trackspot should now be running on port 1060. Connect at `http://localhost:1060` if you are running this on desktop Linux, or `http://<server-ip>:1060` from another machine.

### Installation note for macOS

On macOS, install the Xcode command line tools and use Homebrew to install Git, Node.js, and npm:

```bash
xcode-select --install
brew install git node
```

Then clone the repository, run `npm install`, and start the server with `npm start` as shown above.

## Configuration

Trackspot works out of the box for local use. For host/port settings, data directory placement, home-server notes, CORS, upload limits, and security-related guidance, see [CONFIG.md](CONFIG.md).

Trackspot has no authentication layer. If you make it reachable beyond your own machine, put it behind a VPN, reverse proxy, or another access-control setup you trust.

# Finally, Proxmox LXC install with HTTPS via Tailscale Serve

These are notes for getting Trackspot set up on a Proxmox LXC quickly, using Tailscale Serve for HTTPS since it's difficult otherwise. If you are running the Trackspot server and Spotify on the same machine, then HTTP is fine. Otherwise, HTTPS is necessary for connecting the Spicetify extension to Trackspot.

Unfortunately this means you will always need to have Tailscale running on your client machine for the Spotify→Trackspot connection to work, but I found all other methods too cumbersome to bother with. If you have a suggestion for a better method, please make a GitHub issue.

This guide assumes you already have a Tailscale account set up and MagicDNS+HTTPS enabled in the Tailscale admin [DNS settings](https://login.tailscale.com/admin/dns). If you don't yet have that done, follow steps 1-4 of the instructions [here](https://tailscale.com/docs/how-to/set-up-https-certificates#configure-https), noting that your machine names may be published in the public ledger.

## LXC Creation

Create a Debian LXC either manually or by running the community script from https://community-scripts.org/scripts/debian in the Proxmox VE shell.

If you run the community script, it is highly recommended to do the **Advanced Install** so that you can set the hostname to `trackspot` rather than the default of `debian`, since the hostname is annoying to change later. You can also configure the disk size and RAM size with the Advanced Install.

Don't worry about stuff you don't understand in the Advanced Install; the defaults should work, so just hit Enter whenever in doubt. The default disk size and RAM size values are probably fine initially, but I personally gave Trackspot 10 GB disk size and 2 GB RAM to start.

If you go with the defaults, but later end up with a big album collection, you will want to increase the disk size. This can be done via the Proxmox GUI by going to Container → Resources → Volume Action → Resize, then entering how many GiB you want to add. (2 GiB ≈ 1000 albums.) And if you have RAM to spare in this economy, you can edit that by going to Container → Resources → click Memory → click Edit.

## Installation

Follow the instructions in the [Installation on Linux](#installation-on-linux) section. Personally, I just install and run Trackspot as root in the `/home/spotty/trackspot` directory.

## Add Tailscale

Add Tailscale to the Trackspot LXC either manually (if you know how) or by running the community script at https://community-scripts.org/scripts/add-tailscale-lxc. The community script should be run **in the Proxmox VE Shell,** not the Trackspot LXC.

Like the instructions say, after the install finishes, reboot the LXC, then run `tailscale up` in the LXC console and complete authorization.

## Tailscale Serve

Then, in the Trackspot LXC, assuming Trackspot is configured to run on port 1060, run:

```bash
tailscale serve --bg 1060
```

Then, abracadabra, it works! Assuming your Tailscale machine name is `trackspot`, Trackspot should be accessible with HTTPS through Tailscale at `https://trackspot.your-tailnet.ts.net`.

Also, if you're wondering, the `--bg` flag makes Tailscale Serve automatically resume sharing on reboot.  
Tailscale Serve documentation, if you're interested:  
https://tailscale.com/docs/features/tailscale-serve  
https://tailscale.com/docs/reference/tailscale-cli/serve  

## Configure Spicetify extension

After doing all this, don't forget to go into the Trackspot Spicetify extension settings and change the default server URL to `https://trackspot.your-tailnet.ts.net`.

And that should be it!

## Bonus: Fixing Tailscale SMB speeds with Windows

It's outside the purview of Trackspot, but if you are running Trackspot on a home Linux server and connecting via Tailscale from a Windows client, you may also have a NAS on your home network. If this is the case, and your NAS is also on your tailnet, your Windows machine may be prioritizing Tailscale routing over pure LAN, slowing down your file transfers. The following post details how to solve this issue:

https://danthesalmon.com/posts/windows-smb-tailscale/

Note that these instructions deal with an `Ethernet` connection. If you are connecting to your SMB share via Wi-Fi, you need to make sure that the `InterfaceMetric` value for `Wi-Fi` is lower than that of `Tailscale`.

## Bonus 2: Make Trackspot run on reboot

You probably don't want to have to manually start Trackspot every time the LXC reboots. The easiest way to fix that is to create a simple `systemd` service.

First, make sure Trackspot starts normally:

```bash
cd /home/spotty/trackspot
npm start
```

If it starts successfully, press `Ctrl+C` to stop it before continuing.

Next, find the exact path to Node:

```bash
which node
```

If you installed Node as root with `nvm`, it will probably print something like:

```text
/root/.nvm/versions/node/v24.15.0/bin/node
```

Copy whatever path your system prints. You will need it for the service file below.

Create the service file:

```bash
nano /etc/systemd/system/trackspot.service
```

Paste this into the file, replacing the `ExecStart=` Node path with the path from `which node` if yours is different. You should also change `WorkingDirectory=` if your Trackspot installation directory is different:

```ini
[Unit]
Description=Trackspot local album tracker
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/spotty/trackspot
ExecStart=/root/.nvm/versions/node/v24.15.0/bin/node server/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Save and exit nano:

```text
Ctrl+X
Y
Enter
```

Then tell systemd to reload its service list:

```bash
systemctl daemon-reload
```

Enable Trackspot to start on boot, and also start it right now:

```bash
systemctl enable --now trackspot.service
```

Check whether it worked:

```bash
systemctl status --no-pager -l trackspot.service
```

If everything is working, you should see `active (running)`.

You can also watch Trackspot's logs live with:

```bash
journalctl -u trackspot.service -f
```

And press `Ctrl+C` to quit `journalctl`.

Potentially useful commands for later:

```bash
systemctl restart trackspot.service
systemctl stop trackspot.service
systemctl disable trackspot.service
systemctl enable --now trackspot.service
```

If you update Node later, run `which node` again. If the path changed, run:

```bash
nano /etc/systemd/system/trackspot.service
```

In nano, update the `ExecStart=` line to the new path, then run:

```bash
systemctl daemon-reload
systemctl restart trackspot.service
```

If `systemctl status trackspot.service` shows `status=203/EXEC`, systemd probably cannot find the Node path in `ExecStart=`, so re-check `which node` and make sure the service file uses that exact path.

# License

Trackspot is licensed under the MIT License. See [LICENSE.md](LICENSE.md).
