# YouTube Music Lookup

This extension searches YouTube Music for tracks that Spotify cannot play.

When a track row appears unavailable in Spotify, the extension adds a circular lookup button to the row actions, where the "Save to Library" button would be. Clicking it opens a YouTube Music search for the track title and artist names.

![YouTube Music Lookup preview](images/marketplace-preview.png)

## What It Does

- Adds a YouTube Music lookup button to unavailable Spotify track rows.
- Builds the search query from Spotify track metadata, falling back to row text when needed.
- Opens the search in your browser using Spicetify's external-link API when available.
- Keeps the button in sync as Spotify navigation changes or track rows load dynamically.
