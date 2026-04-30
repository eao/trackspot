## Creating a Windows portable ZIP

To build a Windows x64 ZIP that includes portable Node.js, download the Node.js Windows x64 standalone ZIP, then run:

```powershell
npm run package:windows -- -NodeZipPath "C:\Users\Username\Downloads\node-v24.15.0-win-x64.zip"
```

The package will be created at `dist/Trackspot-Windows-x64.zip`.

Running the same command again replaces the previous ZIP. By default the final ZIP keeps only the runtime files Trackspot needs from Node.js; add `-KeepFullNodeRuntime` if you want to include the full Node.js standalone ZIP contents for debugging.