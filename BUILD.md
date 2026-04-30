## Creating a Windows portable ZIP

To build a Windows x64 ZIP that includes portable Node.js, download the Node.js Windows x64 standalone ZIP, then run:

```powershell
npm run package:windows -- -NodeZipPath "C:\Users\Username\Downloads\node-v24.15.0-win-x64.zip"
```

The package will be created at `dist/Trackspot-Windows-x64.zip`.

Running the same command again replaces the previous ZIP. By default the final ZIP keeps only the runtime files Trackspot needs from Node.js; add `-KeepFullNodeRuntime` if you want to include the full Node.js standalone ZIP contents for debugging.

## Building the ZIP with GitHub Actions

The `.github/workflows/windows-portable.yml` workflow builds the same Windows portable ZIP on GitHub's Windows runner.

To run it manually:

1. Push the workflow file to GitHub.
2. Open the repository on GitHub.
3. Go to **Actions**.
4. Select **Build Windows Portable ZIP**.
5. Click **Run workflow**.
6. Download `Trackspot-Windows-x64` from the completed run's artifacts.

When a GitHub Release is published, the workflow also runs automatically and attaches `Trackspot-Windows-x64.zip` to that release.
