(() => {
// =============================================================================
// Trackspot — Spicetify Extension
// =============================================================================

const SpicetifyApi = new Proxy({}, {
  get(_target, prop) {
    return globalThis.Spicetify?.[prop];
  },
});

const DEFAULT_SERVER_URL = 'http://localhost:1060';
const DEFAULT_BACKUP_SERVER_URL = null;
const APP_NAME = 'Trackspot';
const EDIT_ALBUM_LABEL = `Log/Edit Album in ${APP_NAME}`;
const OPEN_APP_LABEL = `Open ${APP_NAME}`;
const PLAN_LABEL = 'Plan Album';
const LOG_LABEL = 'Log Album';
const MENU_LABEL = `${APP_NAME} settings`;
const MENU_ICON_NAME = 'trackspot-disc';
const MENU_ICON_SVG = '<circle cx="8" cy="8" r="6.667" fill="none" stroke="currentColor" stroke-width="1.333" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.333" fill="none" stroke="currentColor" stroke-width="1.333" stroke-linecap="round" stroke-linejoin="round"/>';
const FILE_PEN_LINE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"/><path d="M14.487 7.858A1 1 0 0 1 14 7V2"/><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"/><path d="M8 18h1"/></svg>';
const EXTERNAL_LINK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
const TRACK_TITLE_LINK_SELECTOR = 'a[href*="/track/"], a[href^="spotify:track:"]';
const TRACK_TITLE_SELECTOR = `.main-trackList-rowMainContentTitle, .main-trackList-rowTitle, ${TRACK_TITLE_LINK_SELECTOR}`;
const TRACK_ROW_SELECTOR = '.main-trackList-trackListRow, [data-testid="tracklist-row"], [role="row"]';
const TRACK_LINK_COPY_ENABLED_CLASS = 'trackspot-copy-share-link-enabled';
const TRACK_LINK_COPY_HOVER_STYLE_ID = 'trackspot-copy-share-link-hover-style';
const TRACK_LINK_COPY_POPUP_CLASS = 'trackspot-copy-share-link-popup';
const TRACK_LINK_COPY_POPUP_STYLE_ID = 'trackspot-copy-share-link-popup-style';
const TRACK_LINK_COPY_POPUP_LIFETIME_MS = 1000;
const TRACK_LINK_COPY_POPUP_FADE_DELAY_MS = 80;
const TRACK_LINK_COPY_POPUP_FADE_MS = 920;
const SPOTIFY_TRACK_URI_PREFIX = 'spotify:track:';
const TRACK_URI_PATTERN = /spotify:track:([A-Za-z0-9]+)/i;
const TRACK_URL_PATTERN = /(?:https?:\/\/open\.spotify\.com)?\/track\/([A-Za-z0-9]+)(?:[/?#][^\s"'<>]*)?/i;
const MAX_TRACK_OBJECT_SCAN_DEPTH = 7;
const MAX_TRACK_OBJECT_SCAN_NODES = 300;
const MAX_TRACK_ROW_DOM_SCAN_DEPTH = 8;
const TRACK_LINK_COPY_POPUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/><path d="M8 4H6a2 2 0 0 0-2 2v4"/><path d="M3 14H13"/><path d="M9 10l4 4-4 4"/></svg>`;
const TRACK_LINK_COPY_POPUP_BACKGROUND_IMAGE = `url("data:image/svg+xml,${encodeURIComponent(TRACK_LINK_COPY_POPUP_SVG)}")`;

// ---------------------------------------------------------------------------
// Style preference  ('subtle' | 'corner')  — persisted across sessions
// ---------------------------------------------------------------------------

const DEFAULT_BUTTON_STYLE = 'subtle';
const STYLE_STORAGE_KEY = 'trackspot_buttonStyle';
const DEFAULT_SERVER_URL_STORAGE_KEY = 'trackspot_defaultServerUrl';
const BACKUP_SERVER_URL_STORAGE_KEY = 'trackspot_backupServerUrl';
const ACTIVE_SERVER_URL_STORAGE_KEY = 'trackspot_activeServerUrl';
const ALBUM_INDEX_CACHE_STORAGE_PREFIX = 'trackspot_albumIndexCache_v1:';
const CSV_WORKER_ENABLED_STORAGE_KEY = 'trackspot_csvWorkerEnabled';
const AUTO_LIBRARY_SYNC_ENABLED_STORAGE_KEY = 'trackspot_autoLibrarySyncEnabled';
const AUTO_DELETE_REMOVED_ALBUMS_STORAGE_KEY = 'trackspot_autoDeleteRemovedAlbums';
const AUTO_STOP_ALBUM_PLAYBACK_AT_END_STORAGE_KEY = 'trackspot_autoStopAlbumPlaybackAtEnd';
const AUTO_LOG_ALBUM_AT_END_STORAGE_KEY = 'trackspot_autoLogAlbumAtEnd';
const ALBUM_END_PLAYBACK_EXCEPTION_TYPE_STORAGE_KEY = 'trackspot_albumEndPlaybackExceptionType';
const ALBUM_END_PLAYBACK_EXCEPTION_MINUTES_STORAGE_KEY = 'trackspot_albumEndPlaybackExceptionMinutes';
const COPY_SHARE_LINK_ON_TRACK_TITLE_CLICK_STORAGE_KEY = 'trackspot_copyShareLinkOnTrackTitleClick';
const COPY_MARKDOWN_STYLE_TRACK_LINK_STORAGE_KEY = 'trackspot_copyMarkdownStyleTrackLink';
const WELCOME_TOUR_SEEN_STORAGE_KEY = 'trackspot_hasSeenWelcomeTour';
const BULK_SYNC_ON_STARTUP_STORAGE_KEY = 'trackspot_bulkSyncOnStartup';
const BULK_SYNC_ON_NAVIGATION_STORAGE_KEY = 'trackspot_bulkSyncOnNavigation';
const BULK_SYNC_INTERVAL_ENABLED_STORAGE_KEY = 'trackspot_bulkSyncIntervalEnabled';
const BULK_SYNC_INTERVAL_HOURS_STORAGE_KEY = 'trackspot_bulkSyncIntervalHours';
const CSV_WORKER_ID_STORAGE_KEY = 'trackspot_csvWorkerId';
const CSV_WORKER_LAST_STARTED_JOB_KEY = 'trackspot_csvWorkerLastStartedJob';
const CSV_WORKER_LAST_FINISHED_JOB_KEY = 'trackspot_csvWorkerLastFinishedJob';
const DEFAULT_CSV_WORKER_ENABLED = false;
const DEFAULT_AUTO_LIBRARY_SYNC_ENABLED = false;
const DEFAULT_AUTO_DELETE_REMOVED_ALBUMS = false;
const DEFAULT_AUTO_STOP_ALBUM_PLAYBACK_AT_END = false;
const DEFAULT_AUTO_LOG_ALBUM_AT_END = false;
const ALBUM_END_PLAYBACK_EXCEPTION_TYPE_OPTIONS = Object.freeze(['singles', 'all']);
const DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_TYPE = 'singles';
const DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_MINUTES = 8;
const DEFAULT_COPY_SHARE_LINK_ON_TRACK_TITLE_CLICK = false;
const DEFAULT_COPY_MARKDOWN_STYLE_TRACK_LINK = true;
const DEFAULT_BULK_SYNC_ON_STARTUP = false;
const DEFAULT_BULK_SYNC_ON_NAVIGATION = false;
const DEFAULT_BULK_SYNC_INTERVAL_ENABLED = false;
const DEFAULT_BULK_SYNC_INTERVAL_HOURS = 6;
const WELCOME_TOUR_FALLBACK_ALBUM_URI = 'spotify:album:0ETFjACtuP2ADo6LFhL6HN';
const GRAPHQL_ALBUM_TRACKS_PAGE_SIZE = 50;
const CSV_WORKER_IDLE_DELAY_MS = 5000;
const CSV_WORKER_ACTIVE_DELAY_MS = 800;
const CSV_WORKER_BOOT_DELAY_MS = 1500;
const ALBUM_INDEX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_LIBRARY_SYNC_DEBOUNCE_MS = 900;
const BULK_SYNC_INTERVAL_HOURS_OPTIONS = Object.freeze([1, 6, 24]);
const STARTUP_LIBRARY_API_MAX_ATTEMPTS = 10;
const STARTUP_LIBRARY_API_RETRY_DELAY_MS = 1500;
const STARTUP_SERVER_RETRY_ATTEMPTS = 3;
const STARTUP_SERVER_RETRY_DELAY_MS = 2000;
const ALBUM_PLAYBACK_STOP_LEAD_MS = 120;
const ALBUM_PLAYBACK_STOP_RESCHEDULE_TOLERANCE_MS = 750;
const ALBUM_PLAYBACK_STOP_REPEAT_SUPPRESSION_MS = 2000;
const ALBUM_END_PLAYBACK_EXCEPTION_FETCH_RETRY_MS = 15000;
const SUCCESS_GREEN = '#1ED760';
const ERROR_RED = '#D32F2F';
const BUTTON_NEUTRAL_TEXT = '#f3f6ff';
const BUTTON_NEUTRAL_BORDER = 'rgba(255,255,255,0.14)';
const BUTTON_ACTIVE_BORDER = SUCCESS_GREEN;
const BUTTON_DISABLED_GREEN = 'rgba(30,215,96,0.24)';
const BUTTON_DISABLED_GREEN_BORDER = 'rgba(30,215,96,0.14)';
const BUTTON_DISABLED_TEXT = 'rgba(243,246,255,0.24)';
const BUTTON_DISABLED_BORDER = 'rgba(255,255,255,0.14)';
const DISABLED_BUTTON_OPACITY = '0.60';
const ACTION_BUTTON_HEIGHT_PX = 34;
const ACTION_BUTTON_TEXT_HEIGHT_PX = 31;
const ACTION_BUTTON_TEXT_MIN_WIDTH_PX = 61;
const ACTION_BUTTON_ICON_SIZE_PX = 34;
const ACTION_BUTTON_TEXT_PADDING_X_PX = 14;
const ACTION_BUTTON_TEXT_FONT_SIZE_PX = 14;
const ACTION_BUTTON_ORDER = Object.freeze(['plan', 'log', 'upload', 'open']);
const MENU_DIAGRAM_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAdsAAADICAYAAACgT0u1AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGHaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8P3hwYWNrZXQgYmVnaW49J++7vycgaWQ9J1c1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCc/Pg0KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyI+PHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj48cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0idXVpZDpmYWY1YmRkNS1iYTNkLTExZGEtYWQzMS1kMzNkNzUxODJmMWIiIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIj48dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPjwvcmRmOkRlc2NyaXB0aW9uPjwvcmRmOlJERj48L3g6eG1wbWV0YT4NCjw/eHBhY2tldCBlbmQ9J3cnPz4slJgLAAA6qElEQVR4Xu3deVxU9f7H8dcsDMOwDIugKCKK+xZuaYVSKQKZ5m7h0q00s9u9alq/MvX+rnXbb2n33tSb2eZyy90WRPNaae6mJq6AomAqAjosw7DMzO+PZH7MARWUkbE+z8fj/OH3+53vnFnkPd/v+Z5zVIAdIYQQws14enoSEhKCp6enssotlZSUkJ2dTUlJibIKlYStEEIId+Pj40PDhg1RqVTKKrdmt9u5cOEChYWFTuUStkIIIdyK0WgkODhYWXxbuXjxIiaTyfFvCVshhBBuw9/fnwYNGiiLb0s5OTlcvnwZALWyUgghhKgPRqPxNxO0AA0aNMBoNIKMbIUQQrgDHx8fGjVqpCy+KQ28dbQN8aFFoIEmRj3B3p746bV4an4dZ5ZYbeRbyrlYVMJZk4WTeWaOZReSU1Sq7OqmnD9/XsJWCCFE/fL09CQsLKxOFkP5eGrp0zyQnuEBRAYZlNU1kp5rZteZS/xwKo/CknJlda3Z7XYJWyGEEPWradOmN316TwNvHQ+0DSG2VTB1kNkA2O2wKfUi3xzLvunRroStEEKIehMcHOw4rnmjBndoxLBOoXUWskp2O6w6dI61h88rq2pMwlYIIUS98Pb2JjQ0VFlcY80DDfyhe9Mbni6urfRcMx/vzeRUnllZdV0StkIIIepFeHg4Op1OWVwj0c0DmdizmctGs1djt8PCXafZdipPWXVNErZCCCFuuYCAAIKCgpTFNfJA2xASuzRRFt9Sy/af5Ztj2criq5LzbIUQQtxSarWagIAAZXGNuEPQAiR2acIDbUOUxVclYSuEEOKW8vf3R62uffxENw90i6CtkNilCdHNA5XF1ar9qxVCCCFuwo2sPm4eaGBiz2bK4no3sWczmgdef4GWhK0QQohbxs/PD41Goyy+rj90b3rLF0PVhEr1675dj4StEOK24unpib+/P/7+/je8klXUH19fX2XRdQ3u0OiWnd5zIyKDDAzucO1LTcpqZCGE29PpdLRr147mzZvj7++Pt7c3AEVFRZhMJk6ePMnhw4cpL7/5S+sJ1/Hw8KBZs9pNBTfw1vHuwA5uOaqtzG6HqV8evuqVpiRshRBuLSwsjF69etGzZ08iIiLQ6/WYTCY0Gg0+Pj5YLBYyMjLYuXMn27dv59y5c8ou3J6HhwctWrQgMjISf39/CgsLSU1NJS0tjbKyMqe2arWa1q1b06FDBzw8PDh79iwnTpzgwoULTu3c0Y3cPm9ctzD6t7497m278cRFPt2XpSwGCVshhDuLiIhg0KBB9OzZE71ez+7du0lPTycnJ8dx+kjr1q258847KS4uZteuXaxevZrMzExlV27Lw8OD6Oho7rvvPiIiIvDx8cFsNpOVlcWmTZvYunUrpaW/jpZUKhWdOnXi4YcfJjIyEo1Gw8WLFzl69CibNm3i6NGjyu7dSuPGjTEYaj4d7OOpZf6QTm4/qq1gt8OkNYeqvXmBBvhfZaEQQtQ3b29vhgwZQp8+fSgvL+fLL7/km2++Ye/evZw8eZJTp06RlpbGqVOnKCgooFWrVjRv3hytVntbTSm3aNGCIUOGcMcdd3Dx4kUOHDiAl5cXLVq0oGnTpuzdu5fCwkK4srjomWeeoV27dly4cIGTJ0/i7e1Nu3bt8PT05MSJExQXFyufwm2EhITU6s4+/Vo1oHOon7LYbalUkG8pJzWnSFklYSuEcD8qlYr77ruP/v374+Pjw6pVq0hOTiY7Oxur1epoZ7PZyM/P58yZM5SWltK1a1cCAwMpKCjg5MmTTn26qx49etCrVy9MJhOrVq1iy5YtpKWl0aFDB0JDQzlx4gSZmZnY7XZ69OjBoEGDyM/PZ/78+ezYsYOzZ8/Spk0bAgMDOXv2rNuO6vV6fa1P+RnTNYxAg4eyuNYOZuYw+L2vWfTDkatuKWfzuKtlKHqP2q+Ursyg0/Jdeq6yWFYjCyHcT2BgIN26daNBgwbs2LGDbdu2YTKZsNurHvWy2+3k5+ezdetWdu3aRVBQEHfffTc+Pj7Kpm7Jx8cHvV7PuXPnSE1N5dy5cxw8eJDLly+jUqkICAhwjAbDw8NRqVRkZ2dz4MABMjIyHMdrvb296/zm63WptrfQa+Ctc+sVyFcTGWSggXfVVfIStkIItxMcHExgYCB2u51t27Zx8eLFaoO2gt1uJzc3l02bNqHRaG7quru3WkFBARaLhcDAQPR6PVy56IOXlxcqlYqcnBzHa798+TJcmU6uaOvp6UmDBg0oLy/HYrFU6tm91PY0rbYhrvmxdE+rUCbd36nK1rt1Y3SauonE6va9bnoWQog6FBgYiMFg4NKlS+Tl5dXo+KvVaiU7O5vCwkL0ej3BwbfHCtbTp09z8eJFwsLCiIqKwtfXl379+hEUFOQ4rclmswFw5MgRbDYbRqOR2NhYfH19iY6OJiQkhPz8fDIyMpTduw0Pj9pNB7eowVWZbkS7xoE8ek/bKtuw7pF46bTK5jekun2XsBVCuB2DwYCHhweFhYVVTn25lvLycgoKCvDw8MDP7/ZYWHPq1CkOHTpESUkJ3bt3p2XLlnTv3h2DwcC6devIy8tzjGzPnj3L2rVr0ev1xMTEEBYWRnx8PBaLhX379pGWlqbs3m1otbULsibGX0fut6Pq9l3CVgjhdtRqNSqVyjGiqw2bzYZKpbqhC93falqtls6dO9OpUye8vLwAKC0txWKxsGjRIpKTkykpKXG0LysrY/Xq1SxatMgx2tfr9ej1ejp06ECnTp3c9nXX9hKNwd61O8brTqrbd1mNLIRwO5GRkXTo0IHS0lJ27drFpUuXlE2q5evrS0xMDBqNhkOHDrn1imQPDw/69+9PYmIizZo1o6ysjPXr13PgwAH27dvH0aNHKS4upnHjxvTs2ZNmzZphsVjIzc0lIyODPXv2OI7htmnThuDgYNq0aYPNZuPkyZPXPMZdH4KCgmp12s+IOxqjVde8/bVcyDfz1YFfp9h/On2xykrkRT8coUeLhjQyVp3+vREatYr1R5wvMuKeP4GEEOI3LiYmhuHDh9OoUSNSUlJ4/fXX+fbbbykqKiI3Nxe1Ws1TTz3Fm2++yaRJk/jjH//I3LlzmTBhAjabjZycHAoKCli5ciWvvPIKKSkpNG7cmIceeoj7779f+XT1rjZBC+BZR4uV6kN1+161RAgh6plKpar1H+cKdrvd7aeRPTw8aNKkCcHBwWzdupWFCxeyf/9+p9XEgwcPJiYmBj8/P4qKiigrK8Pb25v4+HgGDhwIV15rcXExBw4cYMGCBfz44480atSIyMhIt3799elqq5EDDFWnfuuSfBpCCLdiMBho3749QUFBFBQU1GqBlNVqpaCgAH9/f6Kiomp9usmtYjAYHDdTiImJYf78+axfv56//vWvhIWF4eHhQa9evTAYDGzfvp2nnnqKcePGsWHDBjw8PIiNjQWgYcOGvPHGG6xfv5758+cTHR2NSqXCy8vLcQzYXdR2WrvEWvvj9TVxtdXI4UG1vxvR1VS37xK2Qgi3oVKpuOuuu2jfvj12u53vv/++VhfYv3z5MsnJyahUKlq1akXv3r1veITsSjqdDrVajcVicdpyc3MpLS0lICAAT09PVCoV33zzDRaLhbKyMnbt2oVKpcLb2xtvb2/KysrIycmp0k/Fc7iT2i52y7dc/3Qvd1XdvssCKSGE22jUqBEDBw6kbdu27Nq1i82bNzsWAdWE1WrFbDbTuHFjWrdujYeHBykpKZjNZmXTelVWVsaZM2fYsWMHW7ZscWw//fST47zivn374u/vz8mTJ0lPT8dutxMdHU3nzp25dOkSa9eupbS0lFOnTrF9+/Zq+6ltwLlSbW8a3zXMSIhP3UztVl4g1TUihK7NXHsOdsYlM9tO5TmVSdgKIdyCVqulX79+xMTEYLFYWLFiBceOHav19KPFYqGoqIju3btjNBqxWCykpqa6VfDYbDYKCgrIyclx2goLC7HZbJSXl9OmTRvCwsKIiIhg27Zt+Pn5MXnyZDQaDTt37mTXrl1X7aegoMCtXi9XbixRmwtbtAg0EBn061T7zaoctl46LedNZg5m5jhtR8/lEervjaEOLmxx4Jd8Dp7LdyqTsBVCuIVWrVoRHx9Ps2bN+Omnn0hJSUGlUuHj41OrzdvbG51OR1BQEC1btkSr1XLq1Cny8pxHGu4uPz+fHj160KBBA86cOUOfPn1o3749xcXFLFiwoManQ7mLivOBa8pXr6V7mL+y+IZUDtvMvEL2nsqusl02lxLdMhT/OlgotSk1hzOXne++JPezFULUO7VazZAhQ3j44YfR6/Xk5OSQn+88MqiNipAODg7GbDazdu1ali9frmzmtoKCgoiOjmb48OEYjUb+8Y9/0KZNG+Li4igsLGTp0qXs2LGD3Nyqd5dxV0ajsVaX0GzgrWPuoA7K4htyMDOHiR9vURY7aRMawJzBPWnW4OYXSk1Zf5icol/vQVxBwlYIUe+0Wi0DBw4kISHhqqesBAQEoNPpKCoqoqioCLvdjq+vLwaDgdLS0quO9Gw2G//973/5/PPPaz0lfaupVCpCQ0MZNmwYvXv3RqPRkJmZyRtvvIHBYGDKlCmEhYVhs9nYsmULq1at4ty5c8pu3JJerycsLExZfE1/7d/mtrvzT3qumb9sPK4slrAVQriHJk2a0KxZs6se1xs6dCgREREcO3aM//73v9hsNh544AFatGjBqVOnWLNmjfIhcOXyh2fOnOHs2bPKKrcTEBDAuHHjiI6OxmQyceTIEb7++mvHMec2bdowcOBA2rdvj9FoZOvWrXz44YcUFBQou3JLkZGRtVod/kDbEBK7NFEWu7Vl+8/yzbFsZbEcsxVCuIeCggIyMzM5ffp0tVvz5s1p1qwZNpuN9PR0NBoNXbp0Qa/Xs337dlavXl3lMadPnyYrK+u2CaOuXbvSv39/jEYjP/30E9u2bcNutxMSEkLDhg3RarVkZmZiNBpp3rw5fn5+nDx5kl9++UXZlVvy8vK66o+p6pwrKGFA24bUIp/rld0O7+84TWk159lK2AohbhutW7emcePG9OjRg+7du+Pt7c2FCxdYs2ZNrc7HdVfR0dF07NgRDw8PDAYDd9xxBz169HDaunbtSmBgID4+Ptjtdi5cuMDhw4eVXbkljUaDwVDzaeFSqw1fT22drUp2tU2pF9mTWf2pahK2QojbQnZ2NqWlpeTn5/PLL79w5swZUlNT2bp1Kzt37nT747E1ERERgVar5eLFixQUFDiOTyu3wsJCzp8/z7lz58jKyuLEiRPKrtyS1WrF3792K4zP5luIax3i9qNbux3+uT0Dc5lVWQVyzFYIcbvx9vbG0/PX0zMsFovbXbDiZgQFBeHj41Pj45p2u53CwsLbalVykyZNan0pycEdGjG8c6iy2K2s/Pkcaw+fVxY7SNgKIYS4Zfz8/AgJCVEWX5c7r0y+2grkyqpfYy+EEEK4QH5+PlZr9VOt1/Lx3kzc8UiB3f7rvl2PhK0QQohbymQyKYuu61SemYW7TiuL693CXac5lXf9QxkStkIIIW6py5cv39C1m7edymPZfvc5X3rZ/rNVbjhwNbIaWQghxC1VsXK8NqcBVUjNKcJSbqNTqJ+y6pa62sUrrkYWSAkhhKgX4eHhN3zf3ejmgUzs2eyWnxJkt/86dVzTEW0FCVshhBD1wtvbm9DQGz+lp3mggT90b3rLVimn55r5eG9mjY7RKknYCiGEqDfBwcEYjUZlca0M7tCIYZ1CXTbKtdth1aFrn0d7PRK2Qggh6lXTpk0dFyq5UQ28dTzQNoTYVsF1Frp2+6+XYPzmWHaVW+bVloStEEKIeuXp6UlYWFiNr5x1LT6eWvo0D6RneMANTy+n55rZdeYSP5zKo7CkXFlda3a7XcJWCCFE/fPx8aFRo0bK4pvSwFtH2xAfWgQaaGLUE+ztiZ9ei6fm17NeS6w28i3lXCwq4azJwsk8M8eyC296FKt0/vx5CVshhBDuwWg0EhwcrCy+rV28eBGTySQXtRBCCOEeTCYTOTk5yuLbVk5OjuNqWTKyFUII4VZ+CyPcihFtBQlbIYQQbsfHx4eGDRvWyaKpW8lut3PhwgUKCwudyiVshRBCuCVPT09CQkJu+rSgW6WkpITs7GxKSkqUVRK2Qggh3FtdXPjC1UwmExcvXlQWO0jYCiGEcHve3t4EBQXd8LWUXaW0tJTc3FyKioqUVU4kbIUQQtw2AgICCAgIQK2u35NpbDYbly5d4tKlS8qqaknYCiGEuK2o1Wr8/f0xGo1oNBpltUtZrVZMJlOt78krYSuEEOK25efnh6+vL15eXsqqOlVcXExBQQH5+fnKqhqRsBVCCHHb8/DwwNvbG4PBgJeX102fMmS32ykuLsZsNlNUVERZWZmySa1I2AohhPjN0ev1eHp6otPp8PDwQKvVotFoUKvVjiC22+3YbDasVivl5eWUlZVRWlpKSUkJFotF2eVNkbAVQgghXKx+l3MJIYQQvwMStkIIIYSLSdgKIYQQLiZhK4QQQriYhK0QQgjhYhK2QgghhItJ2AohhBAuJmErhBBCuJiErRBCCOFiErZCCCGEi0nYCiGEEC6matu2rVwbWQghhHAhGdkKIYQQLiZhK4QQQriYhK0QQgjhYhK2QgghhItJ2AohhBAuJmErhBBCuJiErRBCCOFiErZCCCGEi0nYCiGEEC4mYSuEEEK4mIStEEII4WIStkIIIYSLSdgKIYQQLiZhK4QQQriYhK0QQgjhYhK2QgghhItJ2AohhBAuJmErhBBCuJiErRBCCOFiErZCCCGEi0nYCiGEEC4mYSuEEEK4mIStEEII4WKqtm3b2pWFdaVx48Y8/fTT+Pr6Kqv46KOPOHDggLJYCCGE+M1xadgOGTIEf39/0tLSHGVWqxVvb2/Gjx/PqFGjnNoLIYQQv0UuDds+ffrw17/+lcLCQgoKCigsLMTPz4+AgAA2bNjAu+++q3yIEEII8Zvj0rAF+OGHH5g0aRLZ2dlcvHgRgHnz5sk0shBCiN+NW7JA6vDhw46gFa4RFxfHtGnT6Nmzp7JKCCFEPbslYVsdb29vZZFLxcXFkZSUxA8//HDV7ZNPPlE+7LYQFRXFhAkTeOihh3jiiSeU1b8r3bp1Y9WqVSQlJREXF6esdtK1a1cWLlzIli1b+P777/noo4/o2LGjspkQQtw0l4atj4+PssjhVodtBavVitlsrnazWCzK5reFy5cvYzKZsNvtZGdnK6tvG6GhoYwePVpZ7DKPPfYY7dq1A6C4uJiAgACaNGmibOYSt/q1CiHqV72ErcViqbewzcvL46WXXiI+Pr7KNnHiRGXz20JGRgZPPPEEMTExzJw5U1l9W+jatSuvvfYasbGxyiqXiIqKIjQ0FKvVyurVq4mPj+fRRx/l559/Vjatc7f6tQoh6l+9hG1eXl69ha1wP7GxscyYMYMWLVqgUqmU1S6h0WhQqVTY7XaKiooAMJlMnDt3Ttm0TtXHaxVC1D+XrkaOiopi5syZDB8+3Kl8woQJhISE8Le//c2p3JXi4uKYMmUKZrOZV199lX379imbOLz44ov079+fnJwcXn/9dae2zz//PAkJCWRnZ/Pmm2+yb98+3nnnHbp3786XX37JDz/8wOOPP06rVq3QarUUFxfz448/8sEHH1T5Qx4aGsrjjz/O3Xff7fhhkpeXx6ZNm1i6dCkmk8nRtvJz2Gw24uLisNlsLFy4kDVr1jjVv/XWWwA899xzDBw4kL1797J582YeeeQRmjRpglqtJjMzk4ULF7J161b++Mc/kpCQgK+vL2VlZezevZs33njD6fkBBgwYwPDhw2nWrBlarZbS0lJSU1P5+OOP2bVrl6Nd5fd63rx5DBw4kC5duqDT6bBYLHz//ff885//xGQyMWbMGMaMGYPBYHB6LoC9e/fy7LPPAtCxY0dGjx5N586dHe9VYWEh27Zt4/3333fsa7du3ZgxYwYGg4G5c+eSnJzs1CeV3kuloqIix2OMRiOjR48mNjaWwMBAuPJ827dvZ/HixVU+ywEDBjBkyBAiIiLQ6XRYrVays7NZtWoVX3zxBUCNXuvjjz/OmDFjuHTpUpXvacXneerUKR599FFQvNeLFi0iMTGR8PBwfv75Z/70pz9BLb9noaGhTJgwgXvuuQcvLy+sViuXL1+utq0QouZcOrIdMGAAK1asUBbz3Xff0blzZ/R6vbLKLbz//vucOHGCkJAQhg0b5ijv27cvffr0obi4mGXLllUJbKPRyIwZM2jbti1lZWUUFxej1+vp27cvc+bMISIiwtE2MjKSV199lbi4OAwGA8XFxVgsFgIDAxk1ahQzZ87EaDQ69c+Vq3LFxcWhUqkoLy/H399f2aQKPz8/Jk2aROPGjSkpKcFmsxEeHs7jjz/OpEmTGDx4MDqdjpKSEjw8PLjrrruqTKmPHz+eqVOnEhkZ6TjurVKp6NChA7NmzWLQoEFO7QHUajUTJkzgzjvvxGq1UlJSgl6vp1+/fjz22GMABAUFAVBSUgJAeXl5lWPoUVFRzJo1i3vuuQe9Xk9xcTElJSX4+PjQv39/nn766UrPen0WiwWz2YzVasVutzv+bbFYKC8vx2g0Mnv2bEaNGkVgYCAWi4Xi4mIMBgP9+/fnlVdeITIy0tHfuHHjmDJlCq1atcJms2E2m7HZbISGhvLoo4863puavNYbpVKpGDlyJGFhYRQXF+Pl5YXRaKzV98xoNDJ9+nT69u2LTqfDbDZTWlpKYGAgAwcOpFevXsqnFULUkMvCtnHjxvTr14/vvvtOWUVqaipnz57lvvvuU1a5XGBgIH/729/YsGGD07ZmzRr69u0LV6YTP/roI3Jzc+nWrRvDhg3DaDQyZMgQvL292bp1K+vWrVN2TdeuXfHw8GDRokXExcURFxfHp59+SnFxMS1btmTw4MGOtk888QQtWrTg9OnTvPDCC8THxxMXF8c777zDpUuX6N69uyOQKmvTpg1Hjhxh3LhxPPjgg3z00UfKJlW0bNmSgoICZsyYQXx8PEuXLqW0tJRmzZrx4IMPsn37dkaMGMGIESPYt28fGo3GsXCIKz8yKvZ99erVDB8+nPj4eMaMGcOOHTvw9vYmMTGxykregIAAGjVqxPLly4mLi2PcuHEcOnQIjUZD+/bt4co51/Hx8WzcuBGAzMxMxzH0GTNmwJUpX4vFwurVqxkzZgzx8fH079+fL7/8ErvdTvfu3enWrZvTc1/LjBkzeOmll8jLy8NqtfKf//yH+Ph4hgwZwubNm3nsscfo2rUrubm5vPnmm8TFxREfH8/s2bM5e/YsLVu2dFr1rdVq+eWXX5g7dy79+/cnPj6eJ598kqNHj+Lr68u9994LNXytN8rX15egoCD+9a9/ER8fz/jx4zGZTLX6nvXo0YN27do5RvgVbZ9//nmOHTuG1WpVPq0QooZcFrZxcXGsWbOGCxcuKKvgyuhWOb18K2g0GgwGQ5VNr9ej1Wod7Xbu3Mk333yDRqNhyJAhJCYm0r59e06cOMH777/v1GcFvV7PmjVr+OyzzxxlH374ITt27ECtVhMVFYXRaOS+++6jc+fOFBQU8MknnzhNwa5bt47169c7QqTyaBjAZrPx1VdfVZnGvJaSkhJWrlzJzp07Adi+fTu5ublotVqys7P56KOPMJlMmEwmUlJSKC8vx8/PzxFg999/P35+fuzdu5e5c+c6phLPnTvH/PnzycjIICQkhHvuucfpeVUqFXv27GHBggWO9ikpKVitVjw9PZ3aXktubi5vvfUWc+fOdXrd33//PSaTCYPBQIMGDZwec6Pat2/PXXfdhdVqZdWqVXz99deOuq1bt7Js2TKKiopo166dY6S3e/du/vKXv7BmzRpH2/T0dHbv3k15ebljROtKnp6eHDlyhJUrVzrKavs9qziOXV5eTmFhoaPtrl27mDp1Kt9++62jTAhROy4J2169etG/f3+WLl2qrHJYv349FouF8ePHK6tc6uLFi0ydOpU+ffo4bQkJCVWO7y1atIj9+/fTpEkTRowYweXLlx3BVJ309HTH8bnKDh06hMViwdfXl5YtW9K8eXNHyE+fPr3KKHvUqFFoNBr8/f1p3ry5U1+nT5+u9R+9M2fOOD3myJEjWCwWrFYru3fvJiMjw6m9UlhYGHa7na5du1bZ1wULFhAeHo5WqyU8PNzpcWazma1btzqVlZSUYLfXbplARkYGubm5TJo0iUWLFrF+/Xo2bNjAyy+/jL+/PzqdjoYNGyofdkOaNm2Kn58fGo2GsWPHVnm9zzzzDF5eXvj4+Dg+m5SUFAIDA/nLX/7CkiVL+Oabb5w+R29vb6KiopRPVaeKi4vZvXu3U1ltv2fHjx8nNzcXf39/XnrpJZYsWcJzzz1H165dnfoVQtSeS8L2iSeeYOnSpeTm5iqrnLz11luMGDGCzp07K6vcxq5duygrK0Or1XLhwgWOHj2qbOKQkZFRbRAXFRVhs9mqjMC0Wm2VEbbBYMDLywuVSoVGo0Gn0zn1lZWV5fTvmigoKKh2v+x2u+P44fWoVCr0en2VfTUYDHh4eADg5eXl9Biz2Vwn5/1GRkbyyiuv8PDDD9O6dWv8/f0dz10xGqs8K1EXrjYDUvGcGo3G8XoHDRrEnDlz6Nu3L+Hh4fj4+GC4MluiUqkcn6Urmc1mMjMzlcVQi+9ZRkYG77zzDkePHkWlUhEeHs7AgQN5++23+fvf/+50nFoIUTt1HrYvvPAC2dnZfPXVV8qqKjIyMvj4448ZO3asssotdOvWjVGjRmG32zl58iRt27atsnCosoiIiGoXNXl7e6NWqzGbzeTk5DjKMzMzGTduXJVR9rVG2+Xl5U7/vlWsVivLly+vso+Vt4qVw3Vt2LBhtGzZEpPJxIcffsioUaPo06cPU6dOddllQPPy8njxxRervMaK7f7772fx4sUYjUaGDh2Kr68vJ06cYM6cOY42H3/8cZ1+XsofM5XZbDZsNpuyGGr5Pfvpp5+YOHEi48ePZ8mSJaSnpwPQvXt3EhMTFT0LIWqqTsM2OjqaPn36sHDhQmXVVS1fvtwxZedOjEYjiYmJBAcHO073MJlMxMTEVLvylisjsJEjRyqL6dSpE3q9noKCAtLS0jh16hRms5kGDRpUu7AnISGBhQsX8tZbb9GqVStl9S2XlZWFRqOhQ4cOVX5MVKzcXbx4scs+w0aNGqFSqdixYweffPKJ47htRETEVc/lvlGZmZnk5+fj5+dX7YxLr169+Mc//sE///lPevbsScuWLfH19aW4uJhVq1Y5Tdc3bdr0hke0arUatfr//3t269aNO+64w6nN9dT2e3b//fcTExMDVw6J/Pvf/+axxx5jzZo12Gw2WrRooexCCFFDdRq2Q4cOZd68eZw5c0ZZdU3vv/8+Y8eOrfaPW30ZOXIkXbp04fz586xatYoffviB7777DoPBwNChQ6udUrt06RJDhgxxCp0nnniCu+66C5vNxoEDBzCZTGzZsoWjR4+i1+sZPXo0AwYMcLTv3bs3Y8eOpW3bthQWFpKamuqoqy/btm0jPz+fDh06MH36dEJDQ+FK0E6cOJF7772XwMBATp8+rXxojRUWFmK1WjEYDI5g6N27N1wZVXPl2HHFc8fGxjJ69OhrjvZuxJEjR9i3bx8qlYqBAwc6fZYdO3bksccec3xPK1bo2u12dDqd0w+jyZMn07t372ovXHGt11oRkEaj0XEucMWlHSvO962p2n7PIiIimD59OlOmTHH6jAMCAlCpVJjN5kq9CyFqo87CdtiwYXTv3p2XXnqpygX+r7ctXrwYvV5/Sy6if7VTfzZs2MCSJUuIioqiT58+DBgwAJvNxoYNG0hJSQHgo48+4sSJEzRv3pynnnpK2TV79+7lwoULjB8/nuTkZJKTkxk3bhxeXl6kpaWxdu1aR9sFCxZw8uRJGjRowPPPP09ycjIbNmxgzpw5NGnShLS0NJYsWeLUf31JSkpi7dq1WK1WYmJiWLJkCRs2bGDlypU8+OCDlJeXOy7ocaNOnDhBUVERDRs25PXXXyc5OdkxS7B//34sFgudOnXi008/ZcOGDcyYMQOdTnfddQE3YuHChfz00094e3szfvx4Nm7cyIYNG3jvvfdo164d58+fZ8mSJZhMJg4cOMCJEyfQaDQMGzaM5ORkNm7cyNChQ8nNzaW4uFjZ/TVf608//URGRgZarZaHH36Y5ORkPv30U6Kiojhx4oSyq+uqzfessLAQnU7H0KFDWbp0KRs2bGDFihX07duX0tJSfvzxR2X3QogaqpOw9fHx4cknn1QW11qXLl2Ij49XFtepay188fLyomnTpjz22GMEBASwf/9+Pv74Y8djTSYTa9eupaCggC5dulRZSV1eXs7f//53Dh486FhAY7FY2Lx5M7Nnz3Za9Zuens6MGTNITk6msLAQvV6Pl5cXRUVFbNy4kZkzZzqOl7mDRYsW8e6775Keno5KpcJgMKBWq0lPT2fevHl8+OGHyofUyubNm1mxYgX5+fnodDpUKpXj9S9btox169Y56jw9PTl//jwffPAB+fn5yq5umslkYs6cOXz++efk5eXh6emJl5cXJSUlbN++nZdfftlxGhVXTu/avXs3ZWVleHl5oVarOXjwIJ9//nm1x1Gv9VpNJhMLFizgwIEDWK1W9Ho9JSUlrFq1irS0NGVX11Wb79kXX3zB7NmzOXz4MGVlZRiuLH47f/48ixYtYtmyZcruhRA1VCeXa5w2bRoPPfSQsviG7N+/n8mTJyuL3Vp1l0oUQgghKtTJyPZ652nWRkBAgLJICCGEuK3VSdhWvjLNzVKemC+EEELc7upkGhmgXbt21S4aqo21a9eyZcsWZbHbk2lkIYQQ11JnYSuEEEKI6tXJNLIQQgghrk7CVgghhHAxCVshhBDCxSRshRBCCBeTsBVCCCFcTMJWCCGEcDEJWyGEEMLFJGyFEEIIF5OwFUIIIVxMwlYIIYRwMQlbIYQQwsUkbIUQQggXk7AVQgghXEzCVgghhHAxCVshhBDCxSRshRBCCBeTsBVCCCFcTNWnTx+7slAIIYQQdcNut8vIVgghhHAllUolYSuEEEK4moStEEII4WIStkIIIYSLSdgKIYQQLiZhK4QQQriYhK0QQgjhYhK2QgghhItJ2AohhBAuJmErhBBCuJiErRBCCOFiErZCCCGEi0nYCiGEEC4mYSuEEEK4mIStEEII4WIStkIIIYSLSdgKIYQQLiZhK4QQQriYqk+fPnZlYV3w8/MjNjaWHj160KpVKwIDAwHIy8sjNTWVPXv2sGnTJvLz85UPFUIIcRvYuTOFDh0j8fXxUlYJBZeE7YQJE0hMTEStvvbA2WazsWzZMj744ANllRBCCDe3c2cKBoOe5i2aSOBeR52GbUREBDNmzKBNmzYAbNu2je+//55Dhw5x4cIFABo2bEjHjh259957iY6OBuD48eO8+uqrZGRkOPUnhBDCfe3cmUJJSS4BAU0kcK+jzsI2IiKCv//97zRo0IDjx4/z/vvvc+DAAWUzJ1FRUTz99NO0adOGnJwcpk2bJoErbpk777yT6OhoUlJS2Lhxo7JaCHEdFWELSOBeR52F7b///W/atGnDtm3bmDVrFjabTdmkWmq1mpdffpno6GiOHz/Ok08+qWxy05577jkefPBBZXEVZWVlLFu2jMWLFyurXKZ///5MmTIFs9nMa6+9xr59+5RNhIssXryYyMhIzp07x5w5czhy5IiyiRDiGiqHLRK413Ttg6o1NGHCBNq0acPx48drFbRcOW47a9Ysjh8/Tps2bZgwYYKyyU0rLS3FbDY7NovFgt1ux2azOZWbzWZKS0uVDxfXERsby/33368svqVCQ0MZPXq0shiAbt26ce+99yqLyc3NxWazcenSJc6ePausFkLU0qVLZzl18iwFhcXKqt+9mx7Z+vn5sW7dOtRqNZMnT77u1PHVREVFMW/ePGw2Gw899JBLVyk//vjjJCYmcvny5XofTd7uI9s//elPxMXFsXr16ls6I1BZly5dmDx5MgB/+MMfnOpiY2N58skn2b17N2+99ZZTnRDi5ihHthVkhFvVTY9sY2NjUavVbNu27YaDFuDAgQNs27YNtVpNbGysslq4GaPRyF/+8hcGDx6MXq9XVt8ysbGxzJgxg+bNmyureOSRR5g6dSohISHKKiGEC8kIt6qbHtm+/vrr3HXXXbzyyits2rRJWQ3A1KlT6d+/PwAbN27k3XffVTaBK6O8l156iR07dvDCCy8oq+vM1Ua2lUeZH374IY888gjh4eH8/PPP/PnPf4Yrf8AfeOABGjdujFarpby8nIyMDP7zn/9U+/oHDBjA0KFDadasGR4eHlXaX21kazQamTlzJj169KCwsJDFixezevVqQkNDGT9+PPfccw9eXl7YbDby8vLYvHkzS5cuxWQyOfX55ptv0rNnT/r374+vry92u52srCz+85//8PXXXyt3lzvvvJM//OEPREZGotfrsdlsXLhwgY0bNzpGrhERETz//PO0b98elUrl9PiioiLmzp1b7YKjmux7hYr3LSIiAq1WS2lpKampqXz88cfs3r0bgDFjxjB69GgMBkOlZ7m2ysflK47l7927l2nTpoHiOzBv3jwGDRpEVFQUOp0Oi8XCDz/8wD//+U+nfTUajYwbN87xHlutVsdn3LRpUxITE8nKynIadQ8YMICHH36YsLAw1Go1FouF9PR0p9cnhLu72si2goxw/99Nj2xbtWoFQEpKirIKrgTt4MGDMRgMGAwGBg8ezNSpU5XNADh06BBU6rO+qFQqRo4cSdOmTSkuLsbLywuj0cjUqVOZOHEiTZs2paysDLPZDEDLli158skn6dWrl1M/jz/+OH/+859p2bIlAGazmfLyciIjI4mPj3dqqzRp0iS6d+9OYWEh//73v1m9ejVGo5Fp06bRt29f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';

function getStyleStorageApi() {
  return SpicetifyApi.Platform?.LocalStorageAPI || null;
}

function normalizeServerUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed || null;
}

function getButtonStyle() {
  const storageApi = getStyleStorageApi();
  const namespacedStyle = storageApi?.getItem(STYLE_STORAGE_KEY);
  if (namespacedStyle === 'subtle' || namespacedStyle === 'corner') {
    return namespacedStyle;
  }

  return DEFAULT_BUTTON_STYLE;
}

function setButtonStyle(style) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(STYLE_STORAGE_KEY, style);
  }
}

function getDefaultServerUrl() {
  const storageApi = getStyleStorageApi();
  return normalizeServerUrl(storageApi?.getItem(DEFAULT_SERVER_URL_STORAGE_KEY)) || DEFAULT_SERVER_URL;
}

function setDefaultServerUrl(url) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(DEFAULT_SERVER_URL_STORAGE_KEY, normalizeServerUrl(url) || DEFAULT_SERVER_URL);
  }
}

function getBackupServerUrl() {
  const storageApi = getStyleStorageApi();
  return normalizeServerUrl(storageApi?.getItem(BACKUP_SERVER_URL_STORAGE_KEY)) || DEFAULT_BACKUP_SERVER_URL;
}

function setBackupServerUrl(url) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(BACKUP_SERVER_URL_STORAGE_KEY, normalizeServerUrl(url));
  }
}

function getServerUrls() {
  const urls = [getDefaultServerUrl(), getBackupServerUrl()].filter(Boolean);
  return [...new Set(urls)];
}

function getCsvWorkerEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(CSV_WORKER_ENABLED_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_CSV_WORKER_ENABLED;
}

function setCsvWorkerEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(CSV_WORKER_ENABLED_STORAGE_KEY, enabled);
  }
}

function getPlanOnSaveClickEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(AUTO_LIBRARY_SYNC_ENABLED_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_AUTO_LIBRARY_SYNC_ENABLED;
}

function setPlanOnSaveClickEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(AUTO_LIBRARY_SYNC_ENABLED_STORAGE_KEY, enabled);
  }
}

function getBulkSyncOnStartupEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(BULK_SYNC_ON_STARTUP_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_BULK_SYNC_ON_STARTUP;
}

function setBulkSyncOnStartupEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(BULK_SYNC_ON_STARTUP_STORAGE_KEY, enabled);
  }
}

function getBulkSyncOnNavigationEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(BULK_SYNC_ON_NAVIGATION_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_BULK_SYNC_ON_NAVIGATION;
}

function setBulkSyncOnNavigationEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(BULK_SYNC_ON_NAVIGATION_STORAGE_KEY, enabled);
  }
}

function getBulkSyncIntervalEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(BULK_SYNC_INTERVAL_ENABLED_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_BULK_SYNC_INTERVAL_ENABLED;
}

function setBulkSyncIntervalEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(BULK_SYNC_INTERVAL_ENABLED_STORAGE_KEY, enabled);
  }
}

function getBulkSyncIntervalHours() {
  const storageApi = getStyleStorageApi();
  const raw = Number(storageApi?.getItem(BULK_SYNC_INTERVAL_HOURS_STORAGE_KEY));
  if (BULK_SYNC_INTERVAL_HOURS_OPTIONS.includes(raw)) {
    return raw;
  }
  return DEFAULT_BULK_SYNC_INTERVAL_HOURS;
}

function setBulkSyncIntervalHours(hours) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    const next = BULK_SYNC_INTERVAL_HOURS_OPTIONS.includes(Number(hours))
      ? Number(hours)
      : DEFAULT_BULK_SYNC_INTERVAL_HOURS;
    storageApi.setItem(BULK_SYNC_INTERVAL_HOURS_STORAGE_KEY, next);
  }
}

function getAutoDeleteRemovedAlbumsEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(AUTO_DELETE_REMOVED_ALBUMS_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_AUTO_DELETE_REMOVED_ALBUMS;
}

function setAutoDeleteRemovedAlbumsEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(AUTO_DELETE_REMOVED_ALBUMS_STORAGE_KEY, enabled);
  }
}

function getAutoStopAlbumPlaybackAtEndEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(AUTO_STOP_ALBUM_PLAYBACK_AT_END_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_AUTO_STOP_ALBUM_PLAYBACK_AT_END;
}

function setAutoStopAlbumPlaybackAtEndEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(AUTO_STOP_ALBUM_PLAYBACK_AT_END_STORAGE_KEY, enabled);
  }
}

function getAutoLogAlbumAtEndEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(AUTO_LOG_ALBUM_AT_END_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_AUTO_LOG_ALBUM_AT_END;
}

function setAutoLogAlbumAtEndEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(AUTO_LOG_ALBUM_AT_END_STORAGE_KEY, enabled);
  }
}

function normalizeAlbumEndPlaybackExceptionType(value) {
  return ALBUM_END_PLAYBACK_EXCEPTION_TYPE_OPTIONS.includes(value)
    ? value
    : DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_TYPE;
}

function normalizeAlbumEndPlaybackExceptionMinutes(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_MINUTES;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_MINUTES;
  }

  return Math.max(0, Math.floor(numeric));
}

function getAlbumEndPlaybackExceptionType() {
  const storageApi = getStyleStorageApi();
  return normalizeAlbumEndPlaybackExceptionType(
    typeof storageApi?.getItem === 'function'
      ? storageApi.getItem(ALBUM_END_PLAYBACK_EXCEPTION_TYPE_STORAGE_KEY)
      : null
  );
}

function setAlbumEndPlaybackExceptionType(value) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(
      ALBUM_END_PLAYBACK_EXCEPTION_TYPE_STORAGE_KEY,
      normalizeAlbumEndPlaybackExceptionType(value)
    );
  }
}

function getAlbumEndPlaybackExceptionMinutes() {
  const storageApi = getStyleStorageApi();
  return normalizeAlbumEndPlaybackExceptionMinutes(
    typeof storageApi?.getItem === 'function'
      ? storageApi.getItem(ALBUM_END_PLAYBACK_EXCEPTION_MINUTES_STORAGE_KEY)
      : null
  );
}

function setAlbumEndPlaybackExceptionMinutes(value) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(
      ALBUM_END_PLAYBACK_EXCEPTION_MINUTES_STORAGE_KEY,
      normalizeAlbumEndPlaybackExceptionMinutes(value)
    );
  }
}

function getCopyShareLinkOnTrackTitleClickEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(COPY_SHARE_LINK_ON_TRACK_TITLE_CLICK_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_COPY_SHARE_LINK_ON_TRACK_TITLE_CLICK;
}

function setCopyShareLinkOnTrackTitleClickEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(COPY_SHARE_LINK_ON_TRACK_TITLE_CLICK_STORAGE_KEY, enabled);
  }
}

function getCopyMarkdownStyleTrackLinkEnabled() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(COPY_MARKDOWN_STYLE_TRACK_LINK_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return DEFAULT_COPY_MARKDOWN_STYLE_TRACK_LINK;
}

function setCopyMarkdownStyleTrackLinkEnabled(enabled) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(COPY_MARKDOWN_STYLE_TRACK_LINK_STORAGE_KEY, enabled);
  }
}

let csvWorkerId = null;
const workerJobMarkers = {
  [CSV_WORKER_LAST_STARTED_JOB_KEY]: '',
  [CSV_WORKER_LAST_FINISHED_JOB_KEY]: '',
};

function getCsvWorkerId() {
  if (!csvWorkerId) {
    csvWorkerId = globalThis.crypto?.randomUUID?.()
      || `trackspot-worker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return csvWorkerId;
}

function getWorkerJobMarker(key) {
  return typeof workerJobMarkers[key] === 'string' ? workerJobMarkers[key] : null;
}

function setWorkerJobMarker(key, value) {
  workerJobMarkers[key] = typeof value === 'string' ? value : '';
}

function getHasSeenWelcomeTour() {
  const storageApi = getStyleStorageApi();
  const stored = storageApi?.getItem(WELCOME_TOUR_SEEN_STORAGE_KEY);
  if (typeof stored === 'boolean') return stored;
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return false;
}

function setHasSeenWelcomeTour(seen) {
  const storageApi = getStyleStorageApi();
  if (storageApi) {
    storageApi.setItem(WELCOME_TOUR_SEEN_STORAGE_KEY, seen);
  }
}

function resetSettings() {
  setButtonStyle(DEFAULT_BUTTON_STYLE);
  setDefaultServerUrl(DEFAULT_SERVER_URL);
  setBackupServerUrl(DEFAULT_BACKUP_SERVER_URL);
  setCsvWorkerEnabled(DEFAULT_CSV_WORKER_ENABLED);
  setPlanOnSaveClickEnabled(DEFAULT_AUTO_LIBRARY_SYNC_ENABLED);
  setAutoDeleteRemovedAlbumsEnabled(DEFAULT_AUTO_DELETE_REMOVED_ALBUMS);
  setAutoStopAlbumPlaybackAtEndEnabled(DEFAULT_AUTO_STOP_ALBUM_PLAYBACK_AT_END);
  setAutoLogAlbumAtEndEnabled(DEFAULT_AUTO_LOG_ALBUM_AT_END);
  setAlbumEndPlaybackExceptionType(DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_TYPE);
  setAlbumEndPlaybackExceptionMinutes(DEFAULT_ALBUM_END_PLAYBACK_EXCEPTION_MINUTES);
  setCopyShareLinkOnTrackTitleClickEnabled(DEFAULT_COPY_SHARE_LINK_ON_TRACK_TITLE_CLICK);
  setCopyMarkdownStyleTrackLinkEnabled(DEFAULT_COPY_MARKDOWN_STYLE_TRACK_LINK);
  setBulkSyncOnStartupEnabled(DEFAULT_BULK_SYNC_ON_STARTUP);
  setBulkSyncOnNavigationEnabled(DEFAULT_BULK_SYNC_ON_NAVIGATION);
  setBulkSyncIntervalEnabled(DEFAULT_BULK_SYNC_INTERVAL_ENABLED);
  setBulkSyncIntervalHours(DEFAULT_BULK_SYNC_INTERVAL_HOURS);
  setWorkerJobMarker(CSV_WORKER_LAST_STARTED_JOB_KEY, '');
  setWorkerJobMarker(CSV_WORKER_LAST_FINISHED_JOB_KEY, '');
}

function createTrackUriFromId(trackId) {
  if (typeof trackId !== 'string') return null;
  const trimmed = trackId.trim();
  if (!trimmed) return null;
  return `${SPOTIFY_TRACK_URI_PREFIX}${trimmed}`;
}

function extractTrackId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(TRACK_URI_PATTERN);
  if (uriMatch) return uriMatch[1];

  const urlMatch = trimmed.match(TRACK_URL_PATTERN);
  if (urlMatch) return urlMatch[1];

  try {
    const parsedUrl = new URL(trimmed);
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    const trackIndex = segments.findIndex((segment) => segment === 'track');
    if (trackIndex !== -1 && segments[trackIndex + 1]) {
      return segments[trackIndex + 1];
    }
  } catch {
    return null;
  }

  return null;
}

function extractTrackUri(value) {
  const trackId = extractTrackId(value);
  return trackId ? createTrackUriFromId(trackId) : null;
}

function extractShareUrlFromTrackUri(trackUri) {
  const trackId = extractTrackId(trackUri);
  return trackId ? `https://open.spotify.com/track/${trackId}` : null;
}

function sanitizeMarkdownLinkText(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .trim();
}

function getTrackTitleTextFromElement(titleElement) {
  if (!isElementLike(titleElement)) return null;
  const text = sanitizeMarkdownLinkText(titleElement.textContent);
  return text || null;
}

function formatCopiedTrackLinkText({ titleElement, trackUri, shareUrl }) {
  if (!getCopyMarkdownStyleTrackLinkEnabled()) {
    return shareUrl;
  }

  const titleText = getTrackTitleTextFromElement(titleElement) || 'Spotify Track';
  return `[${titleText}](${trackUri})`;
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === 'object';
}

function isElementLike(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.nodeType === 1 &&
    typeof value.tagName === 'string'
  );
}

function collectTrackReactInternals(element) {
  if (!isElementLike(element)) return [];
  return Object.keys(element)
    .filter((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$'))
    .map((key) => element[key]);
}

function deepSearchForTrackUri(root, options = {}) {
  const maxDepth = options.maxDepth ?? MAX_TRACK_OBJECT_SCAN_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_TRACK_OBJECT_SCAN_NODES;
  const queue = [{ value: root, depth: 0 }];
  const seen = new WeakSet();
  let visited = 0;

  while (queue.length > 0 && visited < maxNodes) {
    const current = queue.shift();
    const { value, depth } = current;

    if (typeof value === 'string') {
      const trackUri = extractTrackUri(value);
      if (trackUri) {
        return trackUri;
      }
      continue;
    }

    if (!isObjectLike(value)) {
      continue;
    }

    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    visited++;

    if (depth >= maxDepth) {
      continue;
    }

    const entries = Array.isArray(value) ? value : Object.values(value);
    for (const child of entries) {
      if (typeof child === 'function') continue;
      queue.push({
        value: child,
        depth: depth + 1,
      });
    }
  }

  return null;
}

function collectInspectableTrackValues(element) {
  if (!isElementLike(element)) return [];

  const values = [
    element.getAttribute?.('href') || null,
    element.getAttribute?.('aria-label') || null,
    element.getAttribute?.('title') || null,
    element.dataset ? { ...element.dataset } : null,
    element.attributes
      ? Object.fromEntries(Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]))
      : null,
    ...collectTrackReactInternals(element),
  ];

  return values.filter((value) => value != null && value !== '');
}

function collectTrackUriDescendantElements(element) {
  if (!isElementLike(element) || typeof element.querySelectorAll !== 'function') {
    return [];
  }

  return Array.from(element.querySelectorAll(TRACK_TITLE_LINK_SELECTOR)).slice(0, 6);
}

function collectTrackUriCandidateElements(target) {
  if (!isElementLike(target)) return [];

  const elements = [];
  const seen = new Set();
  const push = (element) => {
    if (!isElementLike(element) || seen.has(element)) return;
    seen.add(element);
    elements.push(element);
  };

  const titleElement = target.closest?.(TRACK_TITLE_SELECTOR) || null;
  const rowElement = target.closest?.(TRACK_ROW_SELECTOR) || null;
  const outerRoleRowElement = target.closest?.('[role="row"]') || null;

  push(target);
  push(target.closest?.('a'));
  push(titleElement);
  push(rowElement);
  push(outerRoleRowElement);

  for (const descendant of collectTrackUriDescendantElements(titleElement)) {
    push(descendant);
  }
  for (const descendant of collectTrackUriDescendantElements(rowElement)) {
    push(descendant);
  }

  let current = target.parentElement;
  let depth = 0;
  while (current && depth < MAX_TRACK_ROW_DOM_SCAN_DEPTH) {
    push(current);
    current = current.parentElement;
    depth++;
  }

  return elements;
}

function resolveTrackUriFromElement(target) {
  for (const element of collectTrackUriCandidateElements(target)) {
    for (const value of collectInspectableTrackValues(element)) {
      const trackUri = deepSearchForTrackUri(value);
      if (trackUri) {
        return trackUri;
      }
    }
  }

  return null;
}

function getClipboardApi() {
  return SpicetifyApi.Platform?.ClipboardAPI || null;
}

async function copyTextToClipboard(text) {
  const clipboardApi = getClipboardApi();
  const clipboardMethods = [
    clipboardApi?.copy,
    clipboardApi?.copyText,
    clipboardApi?.writeText,
  ];

  for (const method of clipboardMethods) {
    if (typeof method !== 'function') continue;
    await method.call(clipboardApi, text);
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error('No clipboard API is available in this Spotify client build.');
}

function ensureTrackLinkCopyHoverStyle(doc = document) {
  if (!doc?.head) return null;

  const existing = doc.getElementById(TRACK_LINK_COPY_HOVER_STYLE_ID);
  if (existing) return existing;

  const style = doc.createElement('style');
  style.id = TRACK_LINK_COPY_HOVER_STYLE_ID;
  style.textContent = `
    .${TRACK_LINK_COPY_ENABLED_CLASS} ${TRACK_TITLE_SELECTOR},
    .${TRACK_LINK_COPY_ENABLED_CLASS} ${TRACK_TITLE_SELECTOR} * {
      cursor: pointer !important;
    }
  `;
  doc.head.appendChild(style);
  return style;
}

function ensureTrackLinkCopyPopupStyle(doc = document) {
  if (!doc?.head) return null;

  const existing = doc.getElementById(TRACK_LINK_COPY_POPUP_STYLE_ID);
  if (existing) return existing;

  const style = doc.createElement('style');
  style.id = TRACK_LINK_COPY_POPUP_STYLE_ID;
  style.textContent = `
    .${TRACK_LINK_COPY_POPUP_CLASS} {
      position: fixed;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background-color: rgba(18, 18, 18, 0.96);
      background-image: ${TRACK_LINK_COPY_POPUP_BACKGROUND_IMAGE};
      background-position: center;
      background-repeat: no-repeat;
      background-size: 18px 18px;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.38);
      opacity: 1;
      transform: translateY(-50%) translateX(0);
      transition: opacity ${TRACK_LINK_COPY_POPUP_FADE_MS}ms ease, transform ${TRACK_LINK_COPY_POPUP_FADE_MS}ms ease;
      pointer-events: none;
      z-index: 9999;
    }

    .${TRACK_LINK_COPY_POPUP_CLASS}.is-fading {
      opacity: 0;
      transform: translateY(-50%) translateX(8px);
    }
  `;
  doc.head.appendChild(style);
  return style;
}

function syncTrackLinkCopyTitleUi(doc = document) {
  const root = doc?.documentElement;
  if (!root) return;
  root.classList.toggle(TRACK_LINK_COPY_ENABLED_CLASS, getCopyShareLinkOnTrackTitleClickEnabled());
}

function showTrackLinkCopyPopup(titleElement, options = {}) {
  if (!isElementLike(titleElement)) return null;

  const doc = options.document || titleElement.ownerDocument || document;
  const win = options.window || doc.defaultView || window;
  if (!doc?.body || !win) return null;

  ensureTrackLinkCopyPopupStyle(doc);
  for (const existing of Array.from(doc.querySelectorAll(`.${TRACK_LINK_COPY_POPUP_CLASS}`))) {
    existing.remove();
  }

  const popup = doc.createElement('div');
  popup.className = TRACK_LINK_COPY_POPUP_CLASS;

  const rect = titleElement.getBoundingClientRect();
  popup.style.left = `${Math.round(rect.right + 10)}px`;
  popup.style.top = `${Math.round(rect.top + (rect.height / 2))}px`;

  doc.body.appendChild(popup);

  win.setTimeout(() => {
    popup.classList.add('is-fading');
  }, TRACK_LINK_COPY_POPUP_FADE_DELAY_MS);

  win.setTimeout(() => {
    popup.remove();
  }, TRACK_LINK_COPY_POPUP_LIFETIME_MS);

  return popup;
}

function todayLocalISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateISOFromTimestamp(timestamp, fallback = todayLocalISO()) {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return fallback;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalDateTimeLabel(timestamp) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} at ${hours}:${minutes} local time`;
}

function parseStoredJson(raw, fallback = null) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function createAlbumIndexCacheStorageKey(serverUrl) {
  return `${ALBUM_INDEX_CACHE_STORAGE_PREFIX}${serverUrl}`;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isAlbumContextUri(uri) {
  return typeof uri === 'string' && uri.startsWith('spotify:album:');
}

function getPlayerStateTrack(playerState = SpicetifyApi.Player?.data) {
  if (!playerState || typeof playerState !== 'object') return null;
  return playerState.track ?? playerState.item ?? null;
}

function getPlayerProgressMs(playerState = SpicetifyApi.Player?.data) {
  if (!playerState || typeof playerState !== 'object') {
    return Number(SpicetifyApi.Player?.getProgress?.()) || 0;
  }

  const fallbackProgress = Number(SpicetifyApi.Player?.getProgress?.()) || 0;
  const position = Number(playerState.position_as_of_timestamp);
  const timestamp = Number(playerState.timestamp);
  const duration = Number(playerState.duration);

  if (!Number.isFinite(position) || !Number.isFinite(timestamp)) {
    return fallbackProgress;
  }

  const driftMs = playerState.is_paused
    ? 0
    : Math.max(0, Date.now() - timestamp);
  const nextProgress = position + driftMs;

  if (!Number.isFinite(duration) || duration <= 0) {
    if (Number.isFinite(fallbackProgress) && Math.abs(fallbackProgress - nextProgress) > 1000) {
      return fallbackProgress;
    }
    return nextProgress;
  }

  const boundedFallbackProgress = Math.min(duration, fallbackProgress);
  const boundedNextProgress = Math.min(duration, nextProgress);

  if (Number.isFinite(boundedFallbackProgress) && Math.abs(boundedFallbackProgress - boundedNextProgress) > 1000) {
    return boundedFallbackProgress;
  }

  return boundedNextProgress;
}

function getAlbumEndPlaybackExceptionThresholdMs() {
  return getAlbumEndPlaybackExceptionMinutes() * 60 * 1000;
}

function getNestedValue(value, path) {
  return path.reduce((current, key) => (
    current && typeof current === 'object' ? current[key] : undefined
  ), value);
}

function normalizeAlbumReleaseType(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('single')) return 'single';
  if (normalized.includes('album')) return 'album';
  if (normalized.includes('ep')) return 'ep';
  if (normalized.includes('compilation')) return 'compilation';
  return null;
}

function readAlbumReleaseTypeFromMetadata(...metadataObjects) {
  const preferredKeys = [
    'album_type',
    'album.release_type',
    'album.releaseType',
    'release_type',
    'releaseType',
    'type',
  ];

  for (const metadata of metadataObjects) {
    if (!metadata || typeof metadata !== 'object') continue;

    for (const key of preferredKeys) {
      const releaseType = normalizeAlbumReleaseType(metadata[key]);
      if (releaseType) return releaseType;
    }

    for (const [key, rawValue] of Object.entries(metadata)) {
      if (!/type/i.test(key)) continue;
      const releaseType = normalizeAlbumReleaseType(rawValue);
      if (releaseType) return releaseType;
    }
  }

  return null;
}

function readPositiveDurationMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readDurationMsFromGraphqlTrackItem(item) {
  const candidatePaths = [
    ['track', 'duration', 'totalMilliseconds'],
    ['track', 'duration', 'milliseconds'],
    ['track', 'durationMs'],
    ['itemV2', 'data', 'duration', 'totalMilliseconds'],
    ['itemV2', 'data', 'duration', 'milliseconds'],
    ['itemV2', 'data', 'durationMs'],
    ['data', 'duration', 'totalMilliseconds'],
    ['data', 'duration', 'milliseconds'],
    ['data', 'durationMs'],
    ['duration', 'totalMilliseconds'],
    ['duration', 'milliseconds'],
    ['durationMs'],
    ['track', 'metadata', 'duration'],
    ['metadata', 'duration'],
  ];

  for (const path of candidatePaths) {
    const durationMs = readPositiveDurationMs(getNestedValue(item, path));
    if (durationMs !== null) return durationMs;
  }

  return null;
}

function extractAlbumEndPlaybackExceptionInfoFromGraphql(graphqlData) {
  const albumUnion = graphqlData?.data?.albumUnion;
  const items = Array.isArray(albumUnion?.tracksV2?.items)
    ? albumUnion.tracksV2.items
    : [];

  let totalDurationMs = 0;
  let hasAllTrackDurations = items.length > 0;
  for (const item of items) {
    const durationMs = readDurationMsFromGraphqlTrackItem(item);
    if (durationMs === null) {
      hasAllTrackDurations = false;
      break;
    }
    totalDurationMs += durationMs;
  }

  return {
    albumType: readAlbumReleaseTypeFromMetadata(albumUnion),
    totalDurationMs: hasAllTrackDurations && totalDurationMs > 0
      ? totalDurationMs
      : null,
  };
}

function getAlbumEndPlaybackExceptionAlbumUri(playerState = SpicetifyApi.Player?.data) {
  const track = getPlayerStateTrack(playerState);
  const metadata = track?.metadata ?? {};
  const albumUri = metadata.album_uri ?? null;
  const contextUri = playerState?.context_uri ?? metadata.context_uri ?? null;

  if (!isAlbumContextUri(contextUri)) return null;
  if (albumUri && albumUri !== contextUri) return null;

  return albumUri ?? contextUri;
}

function getAlbumEndPlaybackExceptionLiveInfo(playerState = SpicetifyApi.Player?.data) {
  const track = getPlayerStateTrack(playerState);
  return {
    albumType: readAlbumReleaseTypeFromMetadata(
      track?.metadata,
      playerState?.context_metadata,
      playerState?.page_metadata
    ),
    totalDurationMs: null,
  };
}

const albumEndPlaybackExceptionInfoByUri = new Map();

function requestAlbumEndPlaybackExceptionInfo(playerState = SpicetifyApi.Player?.data) {
  const thresholdMs = getAlbumEndPlaybackExceptionThresholdMs();
  const albumUri = getAlbumEndPlaybackExceptionAlbumUri(playerState);
  if (thresholdMs <= 0 || !isAlbumContextUri(albumUri)) return null;
  if (!(SpicetifyApi?.GraphQL?.Request && SpicetifyApi?.GraphQL?.Definitions?.getAlbum)) {
    return null;
  }

  const liveInfo = getAlbumEndPlaybackExceptionLiveInfo(playerState);
  const existing = albumEndPlaybackExceptionInfoByUri.get(albumUri);
  if (existing) {
    if (!existing.albumType && liveInfo.albumType) {
      existing.albumType = liveInfo.albumType;
    }

    const needsRetry = existing.status === 'rejected'
      && Date.now() - (existing.lastRequestedAtMs ?? 0) >= ALBUM_END_PLAYBACK_EXCEPTION_FETCH_RETRY_MS;
    if (existing.status === 'resolved' || existing.status === 'pending' || !needsRetry) {
      return existing.promise ?? null;
    }
  }

  const nextEntry = {
    status: 'pending',
    albumType: liveInfo.albumType,
    totalDurationMs: existing?.totalDurationMs ?? null,
    lastRequestedAtMs: Date.now(),
    promise: null,
  };
  albumEndPlaybackExceptionInfoByUri.set(albumUri, nextEntry);

  nextEntry.promise = fetchAlbumData(albumUri)
    .then(graphqlData => {
      const graphqlInfo = extractAlbumEndPlaybackExceptionInfoFromGraphql(graphqlData);
      nextEntry.status = 'resolved';
      nextEntry.albumType = graphqlInfo.albumType ?? nextEntry.albumType ?? null;
      nextEntry.totalDurationMs = graphqlInfo.totalDurationMs ?? nextEntry.totalDurationMs ?? null;
      return nextEntry;
    })
    .catch(() => {
      nextEntry.status = 'rejected';
      return nextEntry;
    })
    .finally(() => {
      nextEntry.promise = null;
      syncAlbumPlaybackStopMonitor();
    });

  return nextEntry.promise;
}

function getAlbumEndPlaybackActionSuppressionState(playerState = SpicetifyApi.Player?.data) {
  const thresholdMs = getAlbumEndPlaybackExceptionThresholdMs();
  if (thresholdMs <= 0) return 'allow';

  const albumUri = getAlbumEndPlaybackExceptionAlbumUri(playerState);
  if (!isAlbumContextUri(albumUri)) return 'allow';

  const exceptionType = getAlbumEndPlaybackExceptionType();
  const liveInfo = getAlbumEndPlaybackExceptionLiveInfo(playerState);
  const cachedInfo = albumEndPlaybackExceptionInfoByUri.get(albumUri);
  const albumType = liveInfo.albumType ?? cachedInfo?.albumType ?? null;
  const totalDurationMs = cachedInfo?.totalDurationMs ?? null;

  if (exceptionType === 'singles' && albumType && albumType !== 'single') {
    return 'allow';
  }

  if (totalDurationMs === null) {
    const promise = requestAlbumEndPlaybackExceptionInfo(playerState);
    const nextInfo = albumEndPlaybackExceptionInfoByUri.get(albumUri);
    return promise || nextInfo?.status === 'pending' ? 'pending' : 'allow';
  }

  if (totalDurationMs >= thresholdMs) {
    return 'allow';
  }

  if (exceptionType === 'all') {
    return 'suppress';
  }

  if (albumType === 'single') {
    return 'suppress';
  }

  const promise = requestAlbumEndPlaybackExceptionInfo(playerState);
  const nextInfo = albumEndPlaybackExceptionInfoByUri.get(albumUri);
  return promise || nextInfo?.status === 'pending' ? 'pending' : 'allow';
}

function shouldSuppressAlbumEndPlaybackActions(playerState = SpicetifyApi.Player?.data) {
  return getAlbumEndPlaybackActionSuppressionState(playerState) === 'suppress';
}

function isAlbumPlaybackAtEndCandidate(playerState = SpicetifyApi.Player?.data) {
  const track = getPlayerStateTrack(playerState);
  const metadata = track?.metadata ?? {};
  const contextUri = playerState?.context_uri ?? metadata.context_uri ?? null;
  const albumUri = metadata.album_uri ?? null;

  if (!track?.uri || !isAlbumContextUri(contextUri) || albumUri !== contextUri) {
    return false;
  }

  const albumDiscNumber = parsePositiveInteger(metadata.album_disc_number);
  const albumDiscCount = parsePositiveInteger(metadata.album_disc_count);
  if (albumDiscNumber !== null && albumDiscCount !== null && albumDiscNumber !== albumDiscCount) {
    return false;
  }

  const albumTrackNumber = parsePositiveInteger(metadata.album_track_number);
  const albumTrackCount = parsePositiveInteger(metadata.album_track_count);
  if (albumTrackNumber !== null && albumTrackCount !== null) {
    return albumTrackNumber === albumTrackCount;
  }

  const nextTracks = Array.isArray(playerState?.next_tracks)
    ? playerState.next_tracks
    : [];
  return nextTracks.length === 0;
}

function shouldStopAlbumPlaybackAtEnd(playerState = SpicetifyApi.Player?.data) {
  if (!isAlbumPlaybackAtEndCandidate(playerState)) {
    return false;
  }

  return getAlbumEndPlaybackActionSuppressionState(playerState) === 'allow';
}

function buildAlbumPlaybackStopSignature(playerState = SpicetifyApi.Player?.data) {
  const track = getPlayerStateTrack(playerState);
  const contextUri = playerState?.context_uri ?? track?.metadata?.context_uri ?? '';
  if (!track?.uri || !contextUri) return null;

  return [
    playerState?.session_id ?? '',
    contextUri,
    track.uri,
  ].join('|');
}

function shouldSuppressRepeatedAlbumPlaybackStop({
  signature,
  suppressedSignature,
  remainingMs,
  suppressionWindowMs = ALBUM_PLAYBACK_STOP_REPEAT_SUPPRESSION_MS,
}) {
  return Boolean(
    signature &&
    suppressedSignature &&
    signature === suppressedSignature &&
    Number.isFinite(remainingMs) &&
    remainingMs <= suppressionWindowMs
  );
}

function createEmptyAlbumIndexState() {
  return {
    revision: null,
    albumsBySpotifyId: {},
    fetchedAt: 0,
  };
}

function normalizeAlbumIndexPayload(payload, fallbackFetchedAt = Date.now()) {
  const albums = payload?.albums && typeof payload.albums === 'object'
    ? payload.albums
    : {};

  const albumsBySpotifyId = Object.fromEntries(
    Object.entries(albums).filter(([spotifyId, album]) =>
      typeof spotifyId === 'string' &&
      spotifyId &&
      Number.isInteger(Number(album?.id)) &&
      typeof album?.status === 'string'
    ).map(([spotifyId, album]) => [
      spotifyId,
      {
        id: Number(album.id),
        status: album.status,
      },
    ])
  );

  return {
    revision: typeof payload?.revision === 'string' && payload.revision ? payload.revision : null,
    albumsBySpotifyId,
    fetchedAt: Number(payload?.fetchedAt) > 0 ? Number(payload.fetchedAt) : fallbackFetchedAt,
  };
}

function getStoredActiveServerUrl() {
  const storageApi = getStyleStorageApi();
  return normalizeServerUrl(storageApi?.getItem(ACTIVE_SERVER_URL_STORAGE_KEY));
}

function setStoredActiveServerUrl(serverUrl) {
  const storageApi = getStyleStorageApi();
  if (!storageApi) return;

  if (serverUrl) {
    storageApi.setItem(ACTIVE_SERVER_URL_STORAGE_KEY, serverUrl);
  } else {
    storageApi.setItem(ACTIVE_SERVER_URL_STORAGE_KEY, '');
  }
}

function loadAlbumIndexCache(serverUrl) {
  if (!serverUrl) return createEmptyAlbumIndexState();
  const storageApi = getStyleStorageApi();
  const parsed = parseStoredJson(
    storageApi?.getItem(createAlbumIndexCacheStorageKey(serverUrl)),
    createEmptyAlbumIndexState()
  );
  return normalizeAlbumIndexPayload(parsed, Number(parsed?.fetchedAt) || Date.now());
}

function saveAlbumIndexCache(serverUrl, state) {
  if (!serverUrl) return;
  const storageApi = getStyleStorageApi();
  if (!storageApi) return;

  storageApi.setItem(
    createAlbumIndexCacheStorageKey(serverUrl),
    JSON.stringify({
      revision: state?.revision ?? null,
      albums: state?.albumsBySpotifyId ?? {},
      fetchedAt: state?.fetchedAt ?? Date.now(),
    })
  );
}

function deriveAlbumUiState({
  hasCurrentAlbum,
  activeServerUrl,
  isResolving,
  record,
  serverConnectionState = 'unknown',
}) {
  if (!hasCurrentAlbum) return 'unavailable';
  if (serverConnectionState === 'offline') return 'offline';
  if (!activeServerUrl) return isResolving ? 'checking' : 'unresolved';
  if (!record) return 'missing';
  if (record.status === 'planned') return 'planned';
  if (record.status === 'completed') return 'completed';
  if (record.status === 'dropped') return 'dropped';
  return 'error';
}

function deriveIndexedAlbumUiState({
  spotifyAlbumId,
  activeServerUrl,
  isResolving,
  albumsBySpotifyId,
  serverConnectionState = 'unknown',
}) {
  const record = spotifyAlbumId
    ? albumsBySpotifyId?.[spotifyAlbumId] ?? null
    : null;

  return deriveAlbumUiState({
    hasCurrentAlbum: Boolean(spotifyAlbumId),
    activeServerUrl,
    isResolving,
    record,
    serverConnectionState,
  });
}

function getActionBehavior(actionKey, albumUiState) {
  switch (actionKey) {
    case 'upload':
      if (albumUiState === 'offline') return 'disabled';
      if (
        albumUiState === 'missing' ||
        albumUiState === 'checking' ||
        albumUiState === 'unresolved' ||
        albumUiState === 'error'
      ) {
        return 'import-completed-open';
      }
      if (albumUiState === 'planned' || albumUiState === 'completed' || albumUiState === 'dropped') {
        return 'open-existing';
      }
      break;
    case 'open':
      if (albumUiState === 'offline') return 'disabled';
      return 'open-app';
    case 'plan':
      if (
        albumUiState === 'missing' ||
        albumUiState === 'checking' ||
        albumUiState === 'unresolved' ||
        albumUiState === 'error'
      ) {
        return 'import-planned';
      }
      if (albumUiState === 'offline') return 'disabled';
      if (albumUiState === 'planned') return 'noop-already-planned';
      if (albumUiState === 'completed' || albumUiState === 'dropped') return 'noop-already-logged';
      break;
    case 'log':
      if (
        albumUiState === 'missing' ||
        albumUiState === 'checking' ||
        albumUiState === 'unresolved' ||
        albumUiState === 'error'
      ) {
        return 'open-log-create';
      }
      if (albumUiState === 'offline') return 'disabled';
      if (albumUiState === 'planned' || albumUiState === 'completed' || albumUiState === 'dropped') {
        return 'open-log-edit';
      }
      break;
    default:
      break;
  }

  return 'disabled';
}

function shouldAutoPlanLibraryAlbum({ enabled, albumUiState, inLibrary }) {
  if (!enabled || !inLibrary) return false;
  return (
    albumUiState === 'missing' ||
    albumUiState === 'checking' ||
    albumUiState === 'unresolved' ||
    albumUiState === 'offline' ||
    albumUiState === 'error'
  );
}

function shouldTriggerNavigationBulkSync({
  enabled,
  hasCurrentAlbum,
  hasLiveConnection,
  suppressUntilReconnect,
  isBulkSyncInFlight,
  record,
}) {
  if (!enabled || !hasCurrentAlbum || !hasLiveConnection || suppressUntilReconnect || isBulkSyncInFlight) {
    return false;
  }
  return !record;
}

function shouldAutoDeleteRemovedAlbum({ enabled, record }) {
  if (!enabled) return false;
  return Boolean(record && Number.isInteger(Number(record.id)) && record.status === 'planned');
}

function getLogModalDefaults(album = null, {
  todayIso = todayLocalISO(),
  initialStatus = 'completed',
} = {}) {
  if (!album) {
    const status = initialStatus || 'completed';
    return {
      status,
      repeats: 0,
      planned_at: status === 'planned' ? todayIso : '',
      listened_at: status === 'planned' ? '' : todayIso,
      rating: null,
      notes: null,
    };
  }

  const albumStatus = album.status ?? 'completed';
  const isPlannedAlbum = albumStatus === 'planned';

  return {
    status: isPlannedAlbum ? 'completed' : albumStatus,
    repeats: Number.isInteger(Number(album.repeats)) ? Number(album.repeats) : 0,
    planned_at: album.planned_at ?? '',
    listened_at: isPlannedAlbum ? todayIso : (album.listened_at ?? ''),
    rating: album.rating ?? null,
    notes: album.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

function getAccessToken() {
  const sessionToken = SpicetifyApi.Platform?.Session?.accessToken;
  if (sessionToken) {
    return sessionToken;
  }

  throw new Error('Spicetify.Platform.Session.accessToken is not available.');
}

// ---------------------------------------------------------------------------
// Extract album ID from a Spotify URI
// ---------------------------------------------------------------------------

function albumIdFromUri(uri) {
  const match = uri?.match(/spotify:album:([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Fetch album data directly via Spotify's GraphQL endpoint
// ---------------------------------------------------------------------------

function mergeAlbumGraphqlTrackPages(baseResult, mergedItems, totalCount) {
  const albumUnion = baseResult?.data?.albumUnion;
  if (!albumUnion?.tracksV2) {
    return baseResult;
  }

  return {
    ...baseResult,
    data: {
      ...baseResult.data,
      albumUnion: {
        ...albumUnion,
        tracksV2: {
          ...albumUnion.tracksV2,
          totalCount: totalCount ?? albumUnion.tracksV2.totalCount ?? mergedItems.length,
          items: mergedItems,
        },
      },
    },
  };
}

async function fetchAlbumData(albumUri) {
  const request = SpicetifyApi?.GraphQL?.Request;
  const definition = SpicetifyApi?.GraphQL?.Definitions?.getAlbum;

  if (!(request && definition)) {
    throw new Error('Spicetify GraphQL album lookup is not available in this Spotify client build.');
  }

  let offset = 0;
  let totalCount = null;
  let mergedItems = [];
  let mergedResult = null;

  for (;;) {
    const result = await request(
      definition,
      { uri: albumUri, locale: 'en', limit: GRAPHQL_ALBUM_TRACKS_PAGE_SIZE, offset },
    );

    if (result?.errors?.length) {
      throw new Error(result.errors[0].message || 'Unknown GraphQL error');
    }

    const pageItems = Array.isArray(result?.data?.albumUnion?.tracksV2?.items)
      ? result.data.albumUnion.tracksV2.items
      : [];
    const pageTotalCount = Number(result?.data?.albumUnion?.tracksV2?.totalCount);

    if (!mergedResult) {
      mergedResult = result;
    }
    if (Number.isInteger(pageTotalCount) && pageTotalCount >= 0) {
      totalCount = pageTotalCount;
    }

    mergedItems = mergedItems.concat(pageItems);

    if (!pageItems.length) {
      break;
    }
    if (totalCount === null || mergedItems.length >= totalCount) {
      break;
    }

    offset += pageItems.length;
  }

  return mergeAlbumGraphqlTrackPages(mergedResult, mergedItems, totalCount);
}

function isAlbumSavedInLibraryFromGraphql(graphqlData) {
  const saved = graphqlData?.data?.albumUnion?.saved;
  if (typeof saved === 'boolean') return saved;
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return null;
}

// ---------------------------------------------------------------------------
// Send album to server
// ---------------------------------------------------------------------------

async function sendToServer(albumUri, graphqlData) {
  const albumId    = albumIdFromUri(albumUri);
  const spotifyUrl = albumId
    ? `https://open.spotify.com/album/${albumId}`
    : null;
  const serverUrls = getServerUrls();

  const payload = {
    spotifyUrl,
    spotifyId: albumId,
    data: graphqlData.data,
  };

  for (const serverUrl of serverUrls) {
    let response;

    try {
      response = await fetch(`${serverUrl}/api/albums/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      continue;
    }

    let result;
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (response.status === 409) {
      return { id: result.existing_id, alreadyLogged: true, serverUrl };
    }

    if (!response.ok) {
      throw new Error(result.error || `Server error ${response.status}`);
    }

    return { id: result.id, alreadyLogged: false, serverUrl };
  }

  if (serverUrls.length === 1) {
    throw new Error(`Could not connect to ${APP_NAME}. Is the server running at ${serverUrls[0]}?`);
  }

  throw new Error(`Could not connect to ${APP_NAME}. Tried: ${serverUrls.join(' and ')}.`);
}

// ---------------------------------------------------------------------------
// CSV import worker
// ---------------------------------------------------------------------------

let csvWorkerTimer = null;
let csvWorkerInFlight = false;

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    error.isNetworkError = true;
    if (getServerUrlFromRequestUrl(url) === activeServerUrl) {
      setServerConnectionOffline();
    }
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  setServerConnectionOnline(getServerUrlFromRequestUrl(url));
  return data;
}

function notifyCsvJobStarted(job) {
  if (!job?.id) return;
  const marker = String(job.id);
  if (getWorkerJobMarker(CSV_WORKER_LAST_STARTED_JOB_KEY) === marker) return;
  setWorkerJobMarker(CSV_WORKER_LAST_STARTED_JOB_KEY, marker);
  SpicetifyApi.showNotification(`${APP_NAME} CSV import started in the background.`, false, 2600);
}

function notifyCsvJobTerminal(job) {
  if (!job?.id || (job.status !== 'completed' && job.status !== 'failed')) return;

  const marker = `${job.id}:${job.status}:${job.failed_rows ?? 0}:${job.warning_rows ?? 0}`;
  if (getWorkerJobMarker(CSV_WORKER_LAST_FINISHED_JOB_KEY) === marker) return;
  setWorkerJobMarker(CSV_WORKER_LAST_FINISHED_JOB_KEY, marker);

  if (job.status === 'failed') {
    SpicetifyApi.showNotification(`${APP_NAME} CSV import failed. Open the app for details.`, true, 4200);
    return;
  }

  if ((job.failed_rows ?? 0) > 0 || (job.warning_rows ?? 0) > 0) {
    SpicetifyApi.showNotification(`${APP_NAME} CSV import completed with issues. Open the app for details.`, true, 4200);
    return;
  }

  SpicetifyApi.showNotification(`${APP_NAME} CSV import completed.`, false, 2600);
}

function scheduleCsvWorker(delayMs = CSV_WORKER_IDLE_DELAY_MS) {
  if (csvWorkerTimer) {
    clearTimeout(csvWorkerTimer);
  }

  if (!getCsvWorkerEnabled()) {
    csvWorkerTimer = null;
    return;
  }

  csvWorkerTimer = setTimeout(() => {
    csvWorkerTimer = null;
    runCsvWorkerLoop();
  }, delayMs);
}

function stopCsvWorkerLoop() {
  if (csvWorkerTimer) {
    clearTimeout(csvWorkerTimer);
    csvWorkerTimer = null;
  }
}

function restartCsvWorkerLoop(delayMs = CSV_WORKER_BOOT_DELAY_MS) {
  stopCsvWorkerLoop();
  scheduleCsvWorker(delayMs);
}

async function claimCsvImportRow(serverUrl) {
  return requestJson(`${serverUrl}/api/imports/claim`, {
    method: 'POST',
    body: JSON.stringify({ workerId: getCsvWorkerId() }),
  });
}

async function reportCsvImportFailure(serverUrl, rowId, message) {
  try {
    const data = await requestJson(`${serverUrl}/api/imports/rows/${rowId}/fail`, {
      method: 'POST',
      body: JSON.stringify({
        workerId: getCsvWorkerId(),
        error: message,
      }),
    });
    notifyCsvJobTerminal(data.job);
  } catch (error) {
    if (error?.status === 409) {
      return;
    }
    console.warn('[Trackspot] Could not report CSV row failure:', error);
  }
}

async function processCsvImportRow(serverUrl, claim) {
  const { job, row } = claim;
  if (!row) return false;

  notifyCsvJobStarted(job);

  const albumUri = row.spotify_uri
    || (row.spotify_album_id ? `spotify:album:${row.spotify_album_id}` : null);
  if (!albumUri) {
    await reportCsvImportFailure(serverUrl, row.id, 'CSV row is missing a Spotify album URI.');
    return true;
  }

  let graphqlData;
  try {
    graphqlData = await fetchAlbumData(albumUri);
  } catch (error) {
    await reportCsvImportFailure(serverUrl, row.id, error.message || 'Spotify GraphQL lookup failed.');
    return true;
  }

  try {
    const result = await requestJson(`${serverUrl}/api/imports/rows/${row.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        workerId: getCsvWorkerId(),
        graphqlData,
      }),
    });
    notifyCsvJobTerminal(result.job);
  } catch (error) {
    if (error?.status === 409) {
      return true;
    }
    if (error?.data?.job) {
      notifyCsvJobTerminal(error.data.job);
    } else {
      console.warn('[Trackspot] CSV row completion could not reach server, waiting for lease expiry.', error);
    }
  }

  return true;
}

async function runCsvWorkerLoop() {
  if (csvWorkerInFlight || !getCsvWorkerEnabled()) return;
  csvWorkerInFlight = true;

  try {
    let processedRow = false;

    for (const serverUrl of getServerUrls()) {
      let claim;
      try {
        claim = await claimCsvImportRow(serverUrl);
      } catch {
        continue;
      }

      if (claim?.row) {
        processedRow = await processCsvImportRow(serverUrl, claim);
        break;
      }
    }

    scheduleCsvWorker(processedRow ? CSV_WORKER_ACTIVE_DELAY_MS : CSV_WORKER_IDLE_DELAY_MS);
  } finally {
    csvWorkerInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Current album URI (updated on navigation)
// ---------------------------------------------------------------------------

let currentAlbumUri = null;
const trackspotTooltipHosts = new Set();
let hasTooltipCleanupListeners = false;

// ---------------------------------------------------------------------------
// Attach a tooltip using Spicetify's Tippy instance with manual show/hide.
// ---------------------------------------------------------------------------

function cleanupTrackspotTooltipHost(host, { destroy = false } = {}) {
  if (!host) return;

  const instance = host.__trackspotTooltipInstance;
  try {
    instance?.hide?.();
  } catch {
    // Tooltip cleanup should never interrupt navigation or modal teardown.
  }

  if (destroy) {
    if (host.__trackspotTooltipOnMouseEnter) {
      host.removeEventListener('mouseenter', host.__trackspotTooltipOnMouseEnter);
    }
    if (host.__trackspotTooltipOnMouseLeave) {
      host.removeEventListener('mouseleave', host.__trackspotTooltipOnMouseLeave);
    }
    if (host.__trackspotTooltipOnFocusIn) {
      host.removeEventListener('focusin', host.__trackspotTooltipOnFocusIn);
    }
    if (host.__trackspotTooltipOnFocusOut) {
      host.removeEventListener('focusout', host.__trackspotTooltipOnFocusOut);
    }

    try {
      instance?.destroy?.();
    } catch {
      // Tooltip cleanup should never interrupt navigation or modal teardown.
    }

    trackspotTooltipHosts.delete(host);
    delete host.__trackspotTooltipInstance;
    delete host.__trackspotTooltipLabel;
    delete host.__trackspotTooltipOnMouseEnter;
    delete host.__trackspotTooltipOnMouseLeave;
    delete host.__trackspotTooltipOnFocusIn;
    delete host.__trackspotTooltipOnFocusOut;
  }
}

function hideTrackspotTooltips({ destroyDetached = false } = {}) {
  Array.from(trackspotTooltipHosts).forEach((host) => {
    const isDetached = !host.isConnected;
    if (destroyDetached && isDetached) {
      cleanupTrackspotTooltipHost(host, { destroy: true });
      return;
    }

    cleanupTrackspotTooltipHost(host);
  });
}

function attachTooltip(el, text) {
  el.removeAttribute('title');

  const host = document.createElement('span');
  host.style.display = 'inline-flex';
  host.style.alignItems = 'center';
  host.style.justifyContent = 'center';
  host.style.flex = '0 0 auto';

  const tooltipContent = document.createElement('div');
  tooltipContent.id = 'context-menu';
  tooltipContent.setAttribute('data-placement', 'top');
  tooltipContent.innerHTML =
    `<div class="main-contextMenu-tippy" style="text-align:center;">` +
    `<span id="hover-or-focus-tooltip" role="tooltip">${text}</span>` +
    `</div>`;
  host.__trackspotTooltipLabel = tooltipContent.querySelector('#hover-or-focus-tooltip');
  el.__trackspotTooltipHost = host;

  const instance = SpicetifyApi.Tippy(host, {
    content:          tooltipContent,
    theme:            '',
    animation:        false,
    trigger:          'manual',
    delay:            0,
    duration:         [300, 250],
    offset:           [0, 21],
    placement:        'top',
    hideOnClick:      false,
    hideOnContextMenu: true,
    ignoreAttributes: true,
    interactive:      false,
    zIndex:           9999,
    appendTo:         () => document.body,
    aria: {
      expanded: false,
      content:  'describedby',
    },
  });
  host.__trackspotTooltipInstance = instance;
  trackspotTooltipHosts.add(host);

  // Since trigger is 'manual', wire up show/hide ourselves.
  host.__trackspotTooltipOnMouseEnter = () => instance.show();
  host.__trackspotTooltipOnMouseLeave = () => instance.hide();
  host.__trackspotTooltipOnFocusIn = () => instance.show();
  host.__trackspotTooltipOnFocusOut = () => instance.hide();
  host.addEventListener('mouseenter', host.__trackspotTooltipOnMouseEnter);
  host.addEventListener('mouseleave', host.__trackspotTooltipOnMouseLeave);
  host.addEventListener('focusin', host.__trackspotTooltipOnFocusIn);
  host.addEventListener('focusout', host.__trackspotTooltipOnFocusOut);
  host.appendChild(el);
  return host;
}

function registerTooltipCleanupListeners() {
  if (hasTooltipCleanupListeners) return;

  window.addEventListener('blur', () => {
    hideTrackspotTooltips({ destroyDetached: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hideTrackspotTooltips({ destroyDetached: true });
    }
  });
  document.addEventListener('pointerdown', () => {
    hideTrackspotTooltips({ destroyDetached: true });
  }, true);

  hasTooltipCleanupListeners = true;
}

let activeServerUrl = null;
let albumIndexState = createEmptyAlbumIndexState();
let albumIndexRefreshInFlight = null;
let albumIndexRefreshTimer = null;
let albumIndexIsResolving = false;
let serverConnectionState = 'unknown';
let activeActionKey = null;
let logModalState = null;
let logModalDraftState = null;
let logModalScrollLockState = null;
let cornerActionGroup = null;
let albumNavigationToken = 0;
const autoLibrarySyncInFlight = new Set();
const pendingAutoDeleteRemovedAlbums = new Map();
const pendingAutoPlanSavedAlbums = new Map();
let bulkLibrarySyncIntervalTimer = null;
let suppressAutoBulkSyncUntilReconnect = false;
let startupBulkSyncAttempted = false;
let libraryBackfillInFlight = false;
let albumPlaybackStopTimeoutId = null;
let albumPlaybackStopTargetAtMs = null;
let albumPlaybackStopSignature = null;
let albumPlaybackStopSuppressedSignature = null;
let albumPlaybackAutoLogSuppressedSignature = null;
let hasAlbumPlaybackStopListeners = false;
let welcomeTourRunPromise = null;
let welcomeTourAutoOpenAttempted = false;
const libraryBackfillSubscribers = new Set();

function createLibraryBackfillUiState() {
  return {
    phase: 'idle',
    inFlight: false,
    processedCount: 0,
    totalCount: 0,
    plannedCount: 0,
    skippedCount: 0,
    failedItems: [],
    errorMessage: null,
    lastRunAt: null,
  };
}

let libraryBackfillUiState = createLibraryBackfillUiState();

const SUBTLE_ACTIONS_WRAP_ID = 'trackspot-subtle-actions-wrap';
const CORNER_ACTIONS_WRAP_ID = 'trackspot-corner-actions-wrap';
const LOG_MODAL_ID = 'trackspot-log-modal';
const CONFIRM_MODAL_ID = 'trackspot-confirm-modal';
const WELCOME_TOUR_MODAL_ID = 'trackspot-welcome-tour-modal';
const WELCOME_TOUR_HIGHLIGHT_ID = 'trackspot-welcome-tour-highlight';
const INLINE_INSERT_RETRY_DELAY_MS = 400;
const INLINE_INSERT_MAX_RETRIES = 20;
const WELCOME_TOUR_TARGET_RETRY_MS = 4000;
const WELCOME_TOUR_TARGET_POLL_MS = 150;
const WELCOME_TOUR_MODAL_MAX_WIDTH_PX = 560;
const WELCOME_TOUR_MODAL_VIEWPORT_PADDING_PX = 24;
const WELCOME_TOUR_MODAL_TARGET_GAP_PX = 18;
let hasAutoFellBackToFloating = false;
let inlineInsertRetryTimeout = null;
let inlineInsertRetryCount = 0;
let subtleObserver = null;
let hasDocumentClickListener = false;

const ACTION_CONFIG = Object.freeze({
  plan:   { label: 'Plan', tooltip: PLAN_LABEL, kind: 'text' },
  log:    { label: 'Log', tooltip: LOG_LABEL, kind: 'text' },
  upload: { label: '', tooltip: EDIT_ALBUM_LABEL, kind: 'icon', iconSvg: FILE_PEN_LINE_ICON_SVG },
  open:   { label: '', tooltip: OPEN_APP_LABEL, kind: 'icon', iconSvg: EXTERNAL_LINK_ICON_SVG },
});

function formatLibraryBackfillFailureLines(failedItems) {
  if (!Array.isArray(failedItems) || failedItems.length === 0) return '';
  const header = `\nFailed ${failedItems.length} album${failedItems.length === 1 ? '' : 's'}:`;
  const lines = failedItems.map((failure) => {
    const label = failure?.albumName || failure?.albumUri || 'Unknown album';
    const reason = failure?.errorMessage ? ` — ${failure.errorMessage}` : '';
    return `  • ${label}${reason}`;
  });
  return `${header}\n${lines.join('\n')}`;
}

function getLibraryBackfillStatusText(state = libraryBackfillUiState) {
  if (state.phase === 'loading') {
    return 'Loading your saved albums from Spotify...';
  }

  const failureSuffix = formatLibraryBackfillFailureLines(state.failedItems);

  if (state.phase === 'running') {
    return `Processing saved albums... ${state.processedCount}/${state.totalCount} albums processed${state.plannedCount || state.skippedCount ? ` (${state.plannedCount} planned, ${state.skippedCount} skipped)` : ''}.${failureSuffix}`;
  }

  if (state.phase === 'completed') {
    const lastRunLabel = formatLocalDateTimeLabel(state.lastRunAt);
    return `Finished processing saved albums: ${state.processedCount}/${state.totalCount} albums processed (${state.plannedCount} planned, ${state.skippedCount} skipped).${lastRunLabel ? `\nLast ran on ${lastRunLabel}.` : ''}${failureSuffix}`;
  }

  if (state.phase === 'error') {
    return state.errorMessage || `Couldn't plan your saved albums in ${APP_NAME}.`;
  }

  return 'Scans your saved albums oldest-first and plans anything missing from Trackspot.';
}

function setLibraryBackfillUiState(nextState) {
  libraryBackfillUiState = {
    ...libraryBackfillUiState,
    ...nextState,
  };
  for (const subscriber of libraryBackfillSubscribers) {
    subscriber(libraryBackfillUiState);
  }
}

function subscribeLibraryBackfillUiState(subscriber) {
  libraryBackfillSubscribers.add(subscriber);
  subscriber(libraryBackfillUiState);
  return () => {
    libraryBackfillSubscribers.delete(subscriber);
  };
}

function hydrateStoredAlbumIndexState() {
  const storedServerUrl = getStoredActiveServerUrl();
  const configuredServerUrls = getServerUrls();

  if (storedServerUrl && configuredServerUrls.includes(storedServerUrl)) {
    activeServerUrl = storedServerUrl;
    albumIndexState = loadAlbumIndexCache(storedServerUrl);
    serverConnectionState = 'unknown';
    return;
  }

  activeServerUrl = null;
  albumIndexState = createEmptyAlbumIndexState();
  serverConnectionState = 'unknown';
  setStoredActiveServerUrl(null);
}

function setResolvedAlbumIndexState(serverUrl, state) {
  activeServerUrl = serverUrl;
  albumIndexState = {
    revision: state?.revision ?? null,
    albumsBySpotifyId: { ...(state?.albumsBySpotifyId ?? {}) },
    fetchedAt: state?.fetchedAt ?? Date.now(),
  };
  serverConnectionState = 'online';
  suppressAutoBulkSyncUntilReconnect = false;
  setStoredActiveServerUrl(serverUrl);
  saveAlbumIndexCache(serverUrl, albumIndexState);
}

function clearResolvedAlbumIndexState() {
  activeServerUrl = null;
  albumIndexState = createEmptyAlbumIndexState();
  serverConnectionState = 'unknown';
  setStoredActiveServerUrl(null);
}

function setServerConnectionOffline() {
  serverConnectionState = 'offline';
}

function setServerConnectionOnline(serverUrl) {
  if (!serverUrl) return;
  activeServerUrl = serverUrl;
  serverConnectionState = 'online';
  suppressAutoBulkSyncUntilReconnect = false;
  setStoredActiveServerUrl(serverUrl);
}

function hasLiveServerConnection() {
  return serverConnectionState === 'online' && Boolean(activeServerUrl);
}

function getCurrentAlbumId() {
  return albumIdFromUri(currentAlbumUri);
}

function getCurrentAlbumRecord() {
  const spotifyAlbumId = getCurrentAlbumId();
  if (!spotifyAlbumId) return null;
  return albumIndexState.albumsBySpotifyId?.[spotifyAlbumId] ?? null;
}

function getAlbumRecordBySpotifyId(spotifyAlbumId) {
  if (!spotifyAlbumId) return null;
  return albumIndexState.albumsBySpotifyId?.[spotifyAlbumId] ?? null;
}

function getCurrentAlbumUiState() {
  return deriveAlbumUiState({
    hasCurrentAlbum: Boolean(currentAlbumUri),
    activeServerUrl,
    isResolving: albumIndexIsResolving,
    record: getCurrentAlbumRecord(),
    serverConnectionState,
  });
}

function getAlbumUiStateBySpotifyId(spotifyAlbumId) {
  return deriveIndexedAlbumUiState({
    spotifyAlbumId,
    activeServerUrl,
    isResolving: albumIndexIsResolving,
    albumsBySpotifyId: albumIndexState.albumsBySpotifyId,
    serverConnectionState,
  });
}

function mergeAlbumIntoIndex(album, serverUrl = activeServerUrl) {
  if (!serverUrl || !album?.spotify_album_id) return;

  const nextState = {
    revision: albumIndexState.revision,
    fetchedAt: Date.now(),
    albumsBySpotifyId: {
      ...albumIndexState.albumsBySpotifyId,
      [album.spotify_album_id]: {
        id: album.id,
        status: album.status,
      },
    },
  };

  if (serverUrl === activeServerUrl) {
    albumIndexState = nextState;
  }

  saveAlbumIndexCache(serverUrl, nextState);
}

function removeAlbumFromIndex(spotifyAlbumId, serverUrl = activeServerUrl) {
  if (!serverUrl || !spotifyAlbumId) return;

  const nextAlbumsBySpotifyId = { ...albumIndexState.albumsBySpotifyId };
  delete nextAlbumsBySpotifyId[spotifyAlbumId];

  const nextState = {
    revision: albumIndexState.revision,
    fetchedAt: Date.now(),
    albumsBySpotifyId: nextAlbumsBySpotifyId,
  };

  if (serverUrl === activeServerUrl) {
    albumIndexState = nextState;
  }

  saveAlbumIndexCache(serverUrl, nextState);
}

function buildServerConnectError(serverUrls) {
  const error = serverUrls.length === 1
    ? new Error(`Could not connect to ${APP_NAME}. Is the server running at ${serverUrls[0]}?`)
    : new Error(`Could not connect to ${APP_NAME}. Tried: ${serverUrls.join(' and ')}.`);
  error.isConnectionError = true;
  return error;
}

function isConnectionFailureError(error) {
  return Boolean(error?.isConnectionError || error?.isNetworkError);
}

function getAutoSyncConnectionErrorMessage(actionLabel, error) {
  return `Couldn't ${actionLabel} because ${APP_NAME} couldn't connect to the server. ${error?.message || ''}`.trim();
}

function getServerUrlFromRequestUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url, globalThis.location?.href).origin;
  } catch {
    return null;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForLibraryApiReady({
  maxAttempts = STARTUP_LIBRARY_API_MAX_ATTEMPTS,
  delayMs = STARTUP_LIBRARY_API_RETRY_DELAY_MS,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const libraryApi = SpicetifyApi.Platform?.LibraryAPI;
    if (libraryApi?.getContents) {
      return libraryApi;
    }

    if (attempt < maxAttempts) {
      await wait(delayMs);
    }
  }

  throw new Error('Spotify library API is not available.');
}

async function ensureServerReadyWithRetries({
  attempts = STARTUP_SERVER_RETRY_ATTEMPTS,
  delayMs = STARTUP_SERVER_RETRY_DELAY_MS,
} = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await ensureActiveServerResolved();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(delayMs);
      }
    }
  }

  throw lastError || buildServerConnectError(getServerUrls());
}

async function fetchAlbumIndex(serverUrl, cachedState = createEmptyAlbumIndexState()) {
  const headers = {};
  if (cachedState?.revision) {
    headers['If-None-Match'] = `"${cachedState.revision}"`;
  }

  let response;
  try {
    response = await fetch(`${serverUrl}/api/albums/index`, { headers });
  } catch (error) {
    error.isNetworkError = true;
    throw error;
  }

  if (response.status === 304) {
    return { notModified: true, state: cachedState };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return {
    notModified: false,
    state: normalizeAlbumIndexPayload(data),
  };
}

async function resolveAlbumIndexFromServers(serverUrls, { fetchIndex, loadCache }) {
  let lastError = null;

  for (const serverUrl of serverUrls) {
    const cachedState = loadCache(serverUrl);
    try {
      const result = await fetchIndex(serverUrl, cachedState);
      const resolvedState = result?.notModified
        ? cachedState
        : (result?.state?.albumsBySpotifyId
            ? {
                revision: result.state.revision ?? null,
                albumsBySpotifyId: { ...(result.state.albumsBySpotifyId ?? {}) },
                fetchedAt: result.state.fetchedAt ?? Date.now(),
              }
            : normalizeAlbumIndexPayload(result?.state));
      return {
        serverUrl,
        state: resolvedState,
        notModified: Boolean(result?.notModified),
        error: null,
      };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  return {
    serverUrl: null,
    state: null,
    notModified: false,
    error: lastError,
  };
}

async function refreshAlbumIndex() {
  if (albumIndexRefreshInFlight) return albumIndexRefreshInFlight;

  albumIndexIsResolving = true;
  renderActionButtons();

  albumIndexRefreshInFlight = resolveAlbumIndexFromServers(getServerUrls(), {
    fetchIndex: fetchAlbumIndex,
    loadCache: loadAlbumIndexCache,
  }).then(result => {
    if (!result?.serverUrl) {
      if (isConnectionFailureError(result?.error)) {
        setServerConnectionOffline();
      }
      return result;
    }

    setResolvedAlbumIndexState(result.serverUrl, result.state);
    return result;
  }).finally(() => {
    albumIndexIsResolving = false;
    albumIndexRefreshInFlight = null;
    renderActionButtons();
  });

  return albumIndexRefreshInFlight;
}

function restartAlbumIndexRefreshLoop() {
  if (albumIndexRefreshTimer) {
    clearInterval(albumIndexRefreshTimer);
  }

  albumIndexRefreshTimer = setInterval(() => {
    refreshAlbumIndex();
  }, ALBUM_INDEX_REFRESH_INTERVAL_MS);
}

async function ensureActiveServerResolved() {
  if (hasLiveServerConnection()) return activeServerUrl;

  const result = await refreshAlbumIndex();
  if (result?.serverUrl) return result.serverUrl;

  throw isConnectionFailureError(result?.error)
    ? buildServerConnectError(getServerUrls())
    : (result?.error || buildServerConnectError(getServerUrls()));
}

async function tryTaskAcrossConfiguredServers(task) {
  let lastError = null;

  for (const serverUrl of getServerUrls()) {
    try {
      const result = await task(serverUrl);
      return result;
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (isConnectionFailureError(lastError) || isRetryableServerError(lastError)) {
    setServerConnectionOffline();
    throw buildServerConnectError(getServerUrls());
  }

  throw lastError || buildServerConnectError(getServerUrls());
}

function isRetryableServerError(error) {
  return !error?.status;
}

async function withResolvedServer(task) {
  let serverUrl;

  try {
    serverUrl = await ensureActiveServerResolved();
  } catch {
    return tryTaskAcrossConfiguredServers(task);
  }

  try {
    return await task(serverUrl);
  } catch (error) {
    if (!isRetryableServerError(error)) throw error;

    const result = await refreshAlbumIndex();
    if (!result?.serverUrl) {
      return tryTaskAcrossConfiguredServers(task);
    }

    serverUrl = result.serverUrl;
    return task(serverUrl);
  }
}

function getAlbumSummaryFromGraphql(graphqlData) {
  const album = graphqlData?.data?.albumUnion;
  const artistNames = (album?.artists?.items ?? [])
    .map(item => item?.profile?.name)
    .filter(Boolean)
    .join(', ');

  return {
    spotify_album_id: null,
    album_name: album?.name ?? 'Unknown Album',
    artistsText: artistNames || 'Unknown Artist',
  };
}

function openTrackspotAlbum(serverUrl, id) {
  window.open(`${serverUrl}/collection/list?album=${id}`, '_blank');
}

function openTrackspotApp(serverUrl) {
  window.open(serverUrl, '_blank');
}

async function importAlbum(serverUrl, albumUri, graphqlData, overrides = {}) {
  const albumId = albumIdFromUri(albumUri);
  const spotifyUrl = albumId ? `https://open.spotify.com/album/${albumId}` : null;
  const payload = {
    spotifyUrl,
    spotifyId: albumId,
    data: graphqlData.data,
    ...overrides,
  };

  let response;
  try {
    response = await fetch(`${serverUrl}/api/albums/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    error.isNetworkError = true;
    if (serverUrl === activeServerUrl) {
      setServerConnectionOffline();
    }
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (response.status === 409) {
    setServerConnectionOnline(serverUrl);
    return { duplicate: true, existingId: result.existing_id, album: null };
  }

  if (!response.ok) {
    const error = new Error(result.error || `Server error ${response.status}`);
    error.status = response.status;
    throw error;
  }

  setServerConnectionOnline(serverUrl);
  return { duplicate: false, album: result };
}

async function fetchServerAlbum(serverUrl, albumId) {
  return requestJson(`${serverUrl}/api/albums/${albumId}`);
}

async function patchServerAlbum(serverUrl, albumId, payload) {
  return requestJson(`${serverUrl}/api/albums/${albumId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function deleteServerAlbum(serverUrl, albumId) {
  return requestJson(`${serverUrl}/api/albums/${albumId}`, {
    method: 'DELETE',
  });
}

async function fetchLibraryAlbumItems() {
  const libraryApi = SpicetifyApi.Platform?.LibraryAPI;
  if (!libraryApi?.getContents) {
    throw new Error('Spotify library API is not available in this Spotify client build.');
  }

  const items = [];
  let offset = 0;
  const limit = 200;

  for (;;) {
    const page = await libraryApi.getContents({ limit, offset });
    const pageItems = Array.isArray(page?.items) ? page.items : [];
    items.push(...pageItems);

    const totalLength = Number(page?.totalLength);
    const pageLimit = Number(page?.limit) || limit;
    offset += pageLimit;

    if (!Number.isFinite(totalLength) || offset >= totalLength || pageItems.length === 0) {
      break;
    }
  }

  return items;
}

function notifyInlineButtonFallback(reason) {
  const message = `Trackspot couldn't place the inline album buttons (${reason}), so it switched to the floating buttons instead.`;
  SpicetifyApi.showNotification(message, true, 6000);
}

function isRemoveFromLibraryControl(target) {
  const control = target?.closest?.('button,[role="button"]');
  if (!control) return false;

  const label = [
    control.getAttribute('aria-label'),
    control.getAttribute('title'),
    control.textContent,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!label) return false;
  return label.includes('remove') && label.includes('library');
}

function isSaveToLibraryControl(target) {
  const control = target?.closest?.('button,[role="button"]');
  if (!control) return false;

  const label = [
    control.getAttribute('aria-label'),
    control.getAttribute('title'),
    control.textContent,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!label) return false;
  return label.includes('library') && (label.includes('save') || label.includes('add'));
}

function clearInlineInsertionRetry() {
  if (inlineInsertRetryTimeout) {
    clearTimeout(inlineInsertRetryTimeout);
    inlineInsertRetryTimeout = null;
  }
  inlineInsertRetryCount = 0;
}

function switchToFloatingFallback(reason) {
  if (getButtonStyle() === 'corner' && hasAutoFellBackToFloating) return;

  clearInlineInsertionRetry();
  hasAutoFellBackToFloating = true;
  setButtonStyle('corner');
  applyButtonStyle('corner');
  notifyInlineButtonFallback(reason);
}

function resetInlineFallbackFlagIfNeeded() {
  if (getButtonStyle() === 'subtle') {
    hasAutoFellBackToFloating = false;
  }
}

function scheduleInlineInsertionRetry(reason) {
  if (inlineInsertRetryTimeout || getButtonStyle() !== 'subtle' || !currentAlbumUri) return;

  inlineInsertRetryTimeout = setTimeout(() => {
    inlineInsertRetryTimeout = null;

    if (getButtonStyle() !== 'subtle' || !currentAlbumUri) {
      clearInlineInsertionRetry();
      return;
    }

    if (injectSubtleButtons()) {
      clearInlineInsertionRetry();
      return;
    }

    inlineInsertRetryCount += 1;

    if (inlineInsertRetryCount >= INLINE_INSERT_MAX_RETRIES) {
      switchToFloatingFallback(reason);
      return;
    }

    scheduleInlineInsertionRetry(reason);
  }, INLINE_INSERT_RETRY_DELAY_MS);
}

function getActionBarButtonClassName() {
  return document.querySelector('[aria-label="Download"]')?.className
    || 'e-10180-legacy-button e-10180-legacy-button-tertiary e-10180-overflow-wrap-anywhere encore-internal-color-text-subdued';
}

function isIconAction(actionKey) {
  return ACTION_CONFIG[actionKey]?.kind === 'icon';
}

function populateActionButtonContent(btn, actionKey) {
  const config = ACTION_CONFIG[actionKey];
  if (!config) return;

  if (config.kind === 'icon' && config.iconSvg) {
    btn.innerHTML = config.iconSvg;
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('aria-hidden', 'true');
      svg.style.display = 'block';
      svg.style.pointerEvents = 'none';
      svg.style.flexShrink = '0';
    }
    return;
  }

  btn.textContent = config.label;
}

function createInlineActionButton(actionKey) {
  const btn = document.createElement('button');
  const isIcon = isIconAction(actionKey);
  btn.type = 'button';
  btn.dataset.action = actionKey;
  btn.className = getActionBarButtonClassName();
  btn.setAttribute('data-encore-id', 'buttonTertiary');
  btn.setAttribute('aria-label', ACTION_CONFIG[actionKey].tooltip);
  populateActionButtonContent(btn, actionKey);
  if (isIcon) {
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.style.width = '28px';
      svg.style.height = '28px';
    }
  }
  const heightPx = isIcon ? ACTION_BUTTON_HEIGHT_PX : ACTION_BUTTON_TEXT_HEIGHT_PX;
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.flex = '0 0 auto';
  btn.style.height = `${heightPx}px`;
  btn.style.minHeight = `${heightPx}px`;
  btn.style.minWidth = isIcon ? `${ACTION_BUTTON_ICON_SIZE_PX}px` : `${ACTION_BUTTON_TEXT_MIN_WIDTH_PX}px`;
  btn.style.width = isIcon ? `${ACTION_BUTTON_ICON_SIZE_PX}px` : 'auto';
  btn.style.padding = isIcon ? '0' : `0 ${ACTION_BUTTON_TEXT_PADDING_X_PX}px`;
  btn.style.borderRadius = '999px';
  btn.style.fontSize = isIcon ? '13px' : `${ACTION_BUTTON_TEXT_FONT_SIZE_PX}px`;
  btn.style.fontWeight = '700';
  btn.style.lineHeight = '1';
  btn.style.letterSpacing = '0.01em';
  if (!isIcon) {
    btn.style.border = '2.75px solid currentColor';
  }
  btn.addEventListener('click', () => handleActionButtonClick(actionKey));
  return attachTooltip(btn, ACTION_CONFIG[actionKey].tooltip);
}

function createFloatingActionButton(actionKey) {
  const btn = document.createElement('button');
  const isIcon = isIconAction(actionKey);
  btn.type = 'button';
  btn.dataset.action = actionKey;
  btn.setAttribute('aria-label', ACTION_CONFIG[actionKey].tooltip);
  populateActionButtonContent(btn, actionKey);
  btn.style.cssText = `
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:${isIcon ? ACTION_BUTTON_ICON_SIZE_PX : ACTION_BUTTON_TEXT_MIN_WIDTH_PX}px;
    width:${isIcon ? ACTION_BUTTON_ICON_SIZE_PX : 'auto'};
    height:${ACTION_BUTTON_HEIGHT_PX}px;
    padding:${isIcon ? '0' : `0 ${ACTION_BUTTON_TEXT_PADDING_X_PX}px`};
    border-radius:999px;
    border:2px solid ${BUTTON_NEUTRAL_BORDER};
    background:#121212;
    color:${BUTTON_NEUTRAL_TEXT};
    cursor:pointer;
    font-size:13px;
    font-weight:700;
    line-height:1;
    letter-spacing:0.01em;
    box-shadow:0 10px 24px rgba(0,0,0,0.35);
    transition:box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  `;
  btn.addEventListener('click', () => handleActionButtonClick(actionKey));
  return attachTooltip(btn, ACTION_CONFIG[actionKey].tooltip);
}

function createCornerActionGroup() {
  const wrap = document.createElement('div');
  wrap.id = CORNER_ACTIONS_WRAP_ID;
  wrap.style.cssText = `
    position:fixed;
    bottom:96px;
    right:24px;
    z-index:9999;
    display:flex;
    gap:8px;
    align-items:center;
  `;

  ACTION_BUTTON_ORDER.forEach(actionKey => {
    wrap.appendChild(createFloatingActionButton(actionKey));
  });

  document.body.appendChild(wrap);
  return wrap;
}

function getActionButtons(root) {
  if (!root) return [];
  return ACTION_BUTTON_ORDER
    .map(actionKey => root.querySelector(`[data-action="${actionKey}"]`))
    .filter(Boolean);
}

function getColorAlpha(color) {
  const rgbaMatch = typeof color === 'string'
    ? color.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9]*\.?[0-9]+)\s*\)$/i)
    : null;
  if (rgbaMatch) {
    const alpha = Number(rgbaMatch[1]);
    return Number.isFinite(alpha) ? alpha : 1;
  }
  return 1;
}

function getActionTooltip(actionKey, albumUiState, hasAlbum, isServerAvailable) {
  const defaultTooltip = ACTION_CONFIG[actionKey]?.tooltip || '';
  if (!hasAlbum) return defaultTooltip;
  if (!isServerAvailable) {
    const isGreen = (
      (actionKey === 'plan' && albumUiState === 'planned') ||
      (actionKey === 'log' && (albumUiState === 'completed' || albumUiState === 'dropped'))
    );
    return isGreen
      ? 'No connection to Trackspot server. Green due to cache state; may be out of date.'
      : 'No connection to Trackspot server.';
  }

  return defaultTooltip;
}

function setButtonTooltip(button, text) {
  button.setAttribute('aria-label', text);
  const tooltipHost = button.__trackspotTooltipHost || button;
  if (tooltipHost.__trackspotTooltipLabel) {
    tooltipHost.__trackspotTooltipLabel.textContent = text;
  }
}

function getButtonVisualState(actionKey, albumUiState, hasAlbum, isServerAvailable) {
  const behavior = getActionBehavior(actionKey, albumUiState);
  const isGreen = (
    (actionKey === 'plan' && albumUiState === 'planned') ||
    (actionKey === 'log' && (albumUiState === 'completed' || albumUiState === 'dropped'))
  );

  const disabled = !hasAlbum || !isServerAvailable || behavior === 'disabled';
  const useDisabledNeutral = disabled && !isGreen;
  return {
    disabled,
    isGreen,
    color: isGreen
      ? (!isServerAvailable ? BUTTON_DISABLED_GREEN : SUCCESS_GREEN)
      : (useDisabledNeutral ? BUTTON_DISABLED_TEXT : BUTTON_NEUTRAL_TEXT),
    borderColor: isGreen
      ? (!isServerAvailable ? BUTTON_DISABLED_GREEN_BORDER : BUTTON_ACTIVE_BORDER)
      : (useDisabledNeutral ? BUTTON_DISABLED_BORDER : BUTTON_NEUTRAL_BORDER),
    opacity: disabled && !isGreen ? DISABLED_BUTTON_OPACITY : '1',
  };
}

function renderActionButtons() {
  hideTrackspotTooltips({ destroyDetached: true });

  const hasAlbum = Boolean(currentAlbumUri);
  const albumUiState = getCurrentAlbumUiState();
  const isServerAvailable = hasLiveServerConnection();
  const groups = [
    document.getElementById(SUBTLE_ACTIONS_WRAP_ID),
    document.getElementById(CORNER_ACTIONS_WRAP_ID),
  ].filter(Boolean);

  groups.forEach(group => {
    const isInline = group.id === SUBTLE_ACTIONS_WRAP_ID;
    getActionButtons(group).forEach(button => {
      const actionKey = button.dataset.action;
      const isIcon = isIconAction(actionKey);
      const visualState = getButtonVisualState(actionKey, albumUiState, hasAlbum, isServerAvailable);
      const isActive = activeActionKey === actionKey;
      const icon = isIcon ? button.querySelector('svg') : null;
      const tooltipText = getActionTooltip(actionKey, albumUiState, hasAlbum, isServerAvailable);
      const baseColor = visualState.isGreen
        ? SUCCESS_GREEN
        : (isInline ? '' : BUTTON_NEUTRAL_TEXT);
      const iconOpacity = String(Number(visualState.opacity) * getColorAlpha(visualState.color));

      button.disabled = visualState.disabled || isActive;
      button.style.opacity = isIcon ? '1' : visualState.opacity;
      setButtonTooltip(button, tooltipText);

      if (isInline) {
        button.style.color = isIcon
          ? baseColor
          : (visualState.isGreen
              ? visualState.color
              : (visualState.disabled ? visualState.color : ''));
        if (!isIconAction(actionKey)) {
          button.style.borderColor = visualState.isGreen
            ? visualState.borderColor
            : (visualState.disabled ? visualState.borderColor : '');
        }
        button.style.background = isActive ? 'rgba(255,255,255,0.08)' : '';
      } else {
        button.style.color = isIcon
          ? baseColor
          : visualState.color;
        button.style.borderColor = visualState.borderColor;
        button.style.background = isActive ? '#1f1f1f' : '#121212';
      }

      if (icon) {
        icon.style.opacity = iconOpacity;
      }
    });
  });

  if (cornerActionGroup) {
    cornerActionGroup.style.display = getButtonStyle() === 'corner' && hasAlbum ? 'flex' : 'none';
  }
}

function findAlbumActionBar() {
  return (
    document.querySelector('.main-actionBar-ActionBarRow') ||
    document.querySelector('[data-testid="action-bar-row"]')
  );
}

function findActionBarChild(actionBar, selector) {
  const target = actionBar.querySelector(selector);
  if (!target) return null;

  let node = target;
  while (node && node.parentElement !== actionBar) {
    node = node.parentElement;
  }

  return node?.parentElement === actionBar ? node : null;
}

function findMoreButton(actionBar) {
  return (
    findActionBarChild(actionBar, '[aria-label*="More options"]') ||
    findActionBarChild(actionBar, '[aria-label*="More"]') ||
    findActionBarChild(actionBar, 'button[aria-expanded]')
  );
}

function findDownloadWrapper(actionBar) {
  return findActionBarChild(actionBar, '[aria-label="Download"]');
}

function isSubtleButtonsInserted(actionBar) {
  const wrapper = document.getElementById(SUBTLE_ACTIONS_WRAP_ID);
  return Boolean(wrapper && actionBar && actionBar.contains(wrapper));
}

function createSubtleButtonGroup() {
  const wrapper = document.createElement('div');
  wrapper.id = SUBTLE_ACTIONS_WRAP_ID;
  wrapper.style.cssText = 'display:flex;align-items:center;gap:12px;margin-right:22px;';

  ACTION_BUTTON_ORDER.forEach(actionKey => {
    wrapper.appendChild(createInlineActionButton(actionKey));
  });

  return wrapper;
}

function injectSubtleButtons() {
  const existingActionBar = findAlbumActionBar();
  if (existingActionBar && isSubtleButtonsInserted(existingActionBar)) {
    clearInlineInsertionRetry();
    renderActionButtons();
    return true;
  }

  if (!currentAlbumUri) return false;

  const actionBar = findAlbumActionBar();
  if (!actionBar) return false;

  const dlWrapper = findDownloadWrapper(actionBar);
  const moreBtn = findMoreButton(actionBar);
  if (!moreBtn && !dlWrapper) return false;

  const subtleWrapper = createSubtleButtonGroup();

  if (dlWrapper && dlWrapper !== actionBar) {
    actionBar.insertBefore(subtleWrapper, dlWrapper);
  } else if (moreBtn) {
    actionBar.insertBefore(subtleWrapper, moreBtn);
  } else {
    actionBar.appendChild(subtleWrapper);
  }

  if (!isSubtleButtonsInserted(actionBar)) {
    subtleWrapper.remove();
    return false;
  }

  clearInlineInsertionRetry();
  renderActionButtons();
  return true;
}

function removeSubtleButtons() {
  document.getElementById(SUBTLE_ACTIONS_WRAP_ID)?.remove();
}

function startSubtleObserver() {
  if (subtleObserver) return;
  subtleObserver = new MutationObserver(() => {
    if (getButtonStyle() !== 'subtle') return;
    if (currentAlbumUri && !document.getElementById(SUBTLE_ACTIONS_WRAP_ID)) {
      const injected = injectSubtleButtons();
      if (!injected) {
        scheduleInlineInsertionRetry('Spotify never exposed a stable album action-bar slot');
      }
    }
  });
  const root = document.querySelector('#main') || document.body;
  subtleObserver.observe(root, { childList: true, subtree: true });
}

function stopSubtleObserver() {
  subtleObserver?.disconnect();
  subtleObserver = null;
}

function removeLogModal() {
  if (logModalScrollLockState) {
    const { doc, htmlOverflowX, bodyOverflowX } = logModalScrollLockState;
    doc.documentElement.style.overflowX = htmlOverflowX;
    if (doc.body) {
      doc.body.style.overflowX = bodyOverflowX;
    }
    logModalScrollLockState = null;
  }

  document.getElementById(LOG_MODAL_ID)?.remove();
}

function lockLogModalHorizontalScroll(doc = document) {
  const root = doc?.documentElement;
  const body = doc?.body;
  if (!root || !body) return;

  if (!logModalScrollLockState || logModalScrollLockState.doc !== doc) {
    logModalScrollLockState = {
      doc,
      htmlOverflowX: root.style.overflowX,
      bodyOverflowX: body.style.overflowX,
    };
  }

  root.style.overflowX = 'hidden';
  body.style.overflowX = 'hidden';
}

function handleLogModalNavigation(nextAlbumUri, previousAlbumUri) {
  if (previousAlbumUri === nextAlbumUri) return;

  clearLogModalDraftForAlbum(previousAlbumUri);

  if (logModalState?.albumUri && logModalState.albumUri !== nextAlbumUri) {
    logModalState = null;
    removeLogModal();
  }
}

function removeConfirmModal() {
  document.getElementById(CONFIRM_MODAL_ID)?.remove();
}

function openConfirmModal({
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmButtonBackground = SUCCESS_GREEN,
  confirmButtonColor = '#121212',
}) {
  removeConfirmModal();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = CONFIRM_MODAL_ID;
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:10001;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:rgba(0,0,0,0.65);
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      width:min(520px, 100%);
      background:#181818;
      color:#f5f5f5;
      border:1px solid rgba(255,255,255,0.12);
      border-radius:16px;
      padding:22px;
      box-shadow:0 24px 56px rgba(0,0,0,0.45);
    `;

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:20px;font-weight:800;color:#ffffff;';
    titleEl.textContent = title;

    const messageEl = document.createElement('div');
    messageEl.style.cssText = 'margin-top:10px;font-size:14px;line-height:1.55;color:rgba(255,255,255,0.76);white-space:pre-wrap;';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:20px;';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = cancelLabel;
    cancelButton.style.cssText = 'height:42px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.textContent = confirmLabel;
    confirmButton.style.cssText = `height:42px;padding:0 18px;border-radius:999px;border:1px solid ${BUTTON_ACTIVE_BORDER};background:${confirmButtonBackground};color:${confirmButtonColor};cursor:pointer;font-weight:700;`;

    let settled = false;
    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', handleEscape);
      removeConfirmModal();
      resolve(result);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        cleanup(false);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });
    modal.addEventListener('click', (event) => event.stopPropagation());
    cancelButton.addEventListener('click', () => cleanup(false));
    confirmButton.addEventListener('click', () => cleanup(true));

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    modal.appendChild(titleEl);
    modal.appendChild(messageEl);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleEscape);
    confirmButton.focus();
  });
}

async function saveLogModal(refs) {
  if (!logModalState || logModalState.isSaving) return;

  const ratingRaw = refs.ratingInput.value.trim();
  const rating = ratingRaw === '' ? null : Number.parseInt(ratingRaw, 10);
  if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 100)) {
    refs.error.textContent = 'Rating must be an integer between 0 and 100.';
    refs.error.style.display = 'block';
    return;
  }

  const repeatsRaw = refs.repeatsInput.value.trim();
  const repeats = repeatsRaw === '' ? 0 : Number.parseInt(repeatsRaw, 10);
  if (!Number.isInteger(repeats) || repeats < 0) {
    refs.error.textContent = 'Repeat listens must be a non-negative integer.';
    refs.error.style.display = 'block';
    return;
  }

  const payload = {
    status: refs.statusInput.value || 'completed',
    repeats,
    planned_at: refs.plannedDateInput.value || null,
    listened_at: refs.dateInput.value || null,
    rating,
    notes: refs.notesInput.value.trim() || null,
  };

  logModalState.isSaving = true;
  refs.error.style.display = 'none';
  refs.saveButton.disabled = true;
  refs.saveButton.textContent = 'Saving…';

  try {
    let savedAlbum;
    if (logModalState.mode === 'create') {
      const imported = await importAlbum(logModalState.serverUrl, logModalState.albumUri, logModalState.graphqlData, payload);
      if (imported.duplicate) {
        const existingAlbum = await fetchServerAlbum(logModalState.serverUrl, imported.existingId);
        mergeAlbumIntoIndex(existingAlbum, logModalState.serverUrl);
        clearLogModalDraftForAlbum(logModalState.albumUri);
        logModalState = null;
        removeLogModal();
        renderActionButtons();
        SpicetifyApi.showNotification(`Already in ${APP_NAME}. Open Log again to edit it.`, false, 2800);
        return;
      }

      savedAlbum = imported.album;
    } else {
      savedAlbum = await patchServerAlbum(logModalState.serverUrl, logModalState.albumId, payload);
    }

    mergeAlbumIntoIndex(savedAlbum, logModalState.serverUrl);
    renderActionButtons();
    clearLogModalDraftForAlbum(logModalState.albumUri);
    removeLogModal();
    logModalState = null;
    refreshAlbumIndex();
    SpicetifyApi.showNotification(`Saved in ${APP_NAME}.`, false, 2200);
  } catch (error) {
    refs.error.textContent = error.message || `Couldn't save this album to ${APP_NAME}.`;
    refs.error.style.display = 'block';
  } finally {
    if (logModalState) {
      logModalState.isSaving = false;
    }
    refs.saveButton.disabled = false;
    refs.saveButton.textContent = 'Save';
  }
}

function openLogModal({ mode, serverUrl, album, graphqlData, albumUri = null, initialStatus = 'completed' }) {
  removeLogModal();

  const resolvedAlbumUri = albumUri
    || (album?.spotify_album_id ? `spotify:album:${album.spotify_album_id}` : null)
    || currentAlbumUri;
  const defaults = mergeLogModalDraftValues(
    getLogModalDefaults(album, { initialStatus }),
    getLogModalDraftForAlbum(resolvedAlbumUri)
  );
  const summary = album
    ? {
        album_name: album.album_name ?? 'Unknown Album',
        artistsText: Array.isArray(album.artists)
          ? album.artists.map(artist => artist?.name).filter(Boolean).join(', ') || 'Unknown Artist'
          : 'Unknown Artist',
      }
    : {
        ...getAlbumSummaryFromGraphql(graphqlData),
        spotify_album_id: albumIdFromUri(resolvedAlbumUri),
      };

  logModalState = {
    mode,
    serverUrl,
    albumId: album?.id ?? null,
    albumUri: resolvedAlbumUri,
    graphqlData: graphqlData ?? null,
    isSaving: false,
  };

  const overlay = document.createElement('div');
  overlay.id = LOG_MODAL_ID;
  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:10000;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:24px;
    background:rgba(0,0,0,0.65);
    pointer-events:none;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    width:min(760px, 100%);
    background:#181818;
    color:#f5f5f5;
    border:1px solid rgba(255,255,255,0.12);
    border-radius:16px;
    padding:22px;
    box-shadow:0 24px 56px rgba(0,0,0,0.45);
    pointer-events:auto;
    transform:${getLogModalHorizontalOffsetCss()};
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:22px;font-weight:800;color:#ffffff;';
  title.textContent = mode === 'edit' ? 'Edit Log' : 'Log Album';

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'margin-top:6px;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.72);';
  subtitle.textContent = `${summary.album_name} — ${summary.artistsText}`;

  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:18px;margin-top:20px;';

  const plannedDateField = document.createElement('div');
  plannedDateField.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  const plannedDateLabel = document.createElement('span');
  plannedDateLabel.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);';
  plannedDateLabel.textContent = 'Date planned';
  const plannedDateControls = document.createElement('div');
  plannedDateControls.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:0;';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:grid;grid-template-columns:minmax(0, 1.05fr) minmax(110px, 0.42fr) minmax(0, 1.35fr);gap:12px;align-items:start;';

  const makeField = (labelText, input) => {
    const field = document.createElement('label');
    field.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);';
    label.textContent = labelText;
    field.appendChild(label);
    field.appendChild(input);
    return field;
  };

  const makeInputStyles = extra => `
    width:100%;
    min-height:44px;
    padding:0 14px;
    border-radius:12px;
    border:1px solid rgba(255,255,255,0.12);
    background:#242424;
    color:#ffffff;
    font-size:15px;
    box-sizing:border-box;
    ${extra}
  `;

  const statusInput = document.createElement('select');
  statusInput.style.cssText = makeInputStyles('');
  ['completed', 'planned', 'dropped'].forEach(status => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusInput.appendChild(option);
  });
  statusInput.value = defaults.status;

  const repeatsInput = document.createElement('input');
  repeatsInput.type = 'text';
  repeatsInput.inputMode = 'numeric';
  repeatsInput.setAttribute('pattern', '[0-9]*');
  repeatsInput.setAttribute('aria-label', 'Repeat listens');
  repeatsInput.value = String(defaults.repeats);
  repeatsInput.style.cssText = makeInputStyles('max-width:140px;');

  const dateField = document.createElement('div');
  dateField.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  const dateLabel = document.createElement('span');
  dateLabel.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);';
  dateLabel.textContent = 'Date listened';
  const dateControls = document.createElement('div');
  dateControls.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:0;';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = defaults.listened_at || '';
  dateInput.style.cssText = makeInputStyles('flex:1 1 auto;');
  const plannedDateInput = document.createElement('input');
  plannedDateInput.type = 'date';
  plannedDateInput.value = defaults.planned_at || '';
  plannedDateInput.style.cssText = makeInputStyles('flex:1 1 auto;');
  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.textContent = 'Today';
  todayButton.style.cssText = 'height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;flex:0 0 auto;';
  todayButton.addEventListener('click', () => {
    dateInput.value = todayLocalISO();
    syncDraft();
  });
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear';
  clearButton.style.cssText = 'height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;flex:0 0 auto;';
  clearButton.addEventListener('click', () => {
    dateInput.value = '';
    syncDraft();
  });
  const plannedTodayButton = document.createElement('button');
  plannedTodayButton.type = 'button';
  plannedTodayButton.textContent = 'Today';
  plannedTodayButton.style.cssText = 'height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;flex:0 0 auto;';
  plannedTodayButton.addEventListener('click', () => {
    plannedDateInput.value = todayLocalISO();
    syncDraft();
  });
  const plannedClearButton = document.createElement('button');
  plannedClearButton.type = 'button';
  plannedClearButton.textContent = 'Clear';
  plannedClearButton.style.cssText = 'height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;flex:0 0 auto;';
  plannedClearButton.addEventListener('click', () => {
    plannedDateInput.value = '';
    syncDraft();
  });
  plannedDateControls.appendChild(plannedDateInput);
  plannedDateControls.appendChild(plannedTodayButton);
  plannedDateControls.appendChild(plannedClearButton);
  plannedDateField.appendChild(plannedDateLabel);
  plannedDateField.appendChild(plannedDateControls);
  dateControls.appendChild(dateInput);
  dateControls.appendChild(todayButton);
  dateControls.appendChild(clearButton);
  dateField.appendChild(dateLabel);
  dateField.appendChild(dateControls);

  const ratingInput = document.createElement('input');
  ratingInput.type = 'text';
  ratingInput.inputMode = 'numeric';
  ratingInput.setAttribute('pattern', '[0-9]*');
  ratingInput.setAttribute('aria-label', 'Rating');
  ratingInput.value = defaults.rating ?? '';
  ratingInput.placeholder = 'Leave blank for unrated';
  ratingInput.style.cssText = makeInputStyles('border-radius:12px 0 0 12px;border-right:none;');
  let syncDraft = () => {};

  const adjustRating = delta => {
    const current = ratingInput.value.trim() === '' ? 50 : Number.parseInt(ratingInput.value, 10);
    const next = Math.max(0, Math.min(100, current + delta));
    ratingInput.value = String(next);
    syncDraft();
  };

  const makeSpinnerButton = (label, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.textContent = label;
    button.style.cssText = `
      width:44px;
      height:22px;
      border:1px solid rgba(255,255,255,0.12);
      background:#242424;
      color:#fff;
      cursor:pointer;
      font-size:12px;
      font-weight:700;
      line-height:1;
      padding:0;
    `;
    button.addEventListener('click', onClick);
    return button;
  };

  const adjustRepeats = delta => {
    const current = repeatsInput.value.trim() === '' ? 0 : Number.parseInt(repeatsInput.value, 10);
    const safeCurrent = Number.isInteger(current) && current >= 0 ? current : 0;
    const next = Math.max(0, safeCurrent + delta);
    repeatsInput.value = String(next);
    syncDraft();
  };

  const ratingFieldWrap = document.createElement('div');
  ratingFieldWrap.style.cssText = 'display:flex;align-items:stretch;';
  const ratingStepGroupSmall = document.createElement('div');
  ratingStepGroupSmall.style.cssText = 'display:flex;flex-direction:column;';
  const ratingStepGroupLarge = document.createElement('div');
  ratingStepGroupLarge.style.cssText = 'display:flex;flex-direction:column;';

  const plusOneButton = makeSpinnerButton('+1', () => adjustRating(1));
  plusOneButton.style.borderRadius = '0';
  plusOneButton.style.borderBottom = 'none';
  const minusOneButton = makeSpinnerButton('-1', () => adjustRating(-1));
  minusOneButton.style.borderRadius = '0';
  const plusFiveButton = makeSpinnerButton('+5', () => adjustRating(5));
  plusFiveButton.style.borderRadius = '0 12px 0 0';
  plusFiveButton.style.borderLeft = 'none';
  plusFiveButton.style.borderBottom = 'none';
  const minusFiveButton = makeSpinnerButton('-5', () => adjustRating(-5));
  minusFiveButton.style.borderRadius = '0 0 12px 0';
  minusFiveButton.style.borderLeft = 'none';

  ratingStepGroupSmall.appendChild(plusOneButton);
  ratingStepGroupSmall.appendChild(minusOneButton);
  ratingStepGroupLarge.appendChild(plusFiveButton);
  ratingStepGroupLarge.appendChild(minusFiveButton);
  ratingFieldWrap.appendChild(ratingInput);
  ratingFieldWrap.appendChild(ratingStepGroupSmall);
  ratingFieldWrap.appendChild(ratingStepGroupLarge);

  const notesInput = document.createElement('textarea');
  notesInput.value = defaults.notes ?? '';
  notesInput.placeholder = 'Optional notes';
  notesInput.style.cssText = `
    width:100%;
    min-height:160px;
    padding:14px;
    border-radius:12px;
    border:1px solid rgba(255,255,255,0.12);
    background:#242424;
    color:#ffffff;
    font-size:15px;
    resize:vertical;
    box-sizing:border-box;
  `;

  ratingInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      adjustRating(1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustRating(-1);
      return;
    }

    if (event.key === 'PageUp') {
      event.preventDefault();
      adjustRating(5);
      return;
    }

    if (event.key === 'PageDown') {
      event.preventDefault();
      adjustRating(-5);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      notesInput.focus();
    }
  });

  ratingInput.addEventListener('wheel', (event) => {
    if (document.activeElement !== ratingInput) {
      return;
    }

    if (event.deltaY < 0) {
      event.preventDefault();
      adjustRating(5);
      return;
    }

    if (event.deltaY > 0) {
      event.preventDefault();
      adjustRating(-5);
    }
  }, { passive: false });

  repeatsInput.addEventListener('wheel', (event) => {
    if (document.activeElement !== repeatsInput) {
      return;
    }

    if (event.deltaY < 0) {
      event.preventDefault();
      adjustRepeats(1);
      return;
    }

    if (event.deltaY > 0) {
      event.preventDefault();
      adjustRepeats(-1);
    }
  }, { passive: false });

  const error = document.createElement('div');
  error.style.cssText = 'display:none;font-size:13px;line-height:1.45;color:#ff9a9a;';

  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:8px;';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = 'height:42px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;';
  cancelButton.addEventListener('click', () => {
    logModalState = null;
    removeLogModal();
  });
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  saveButton.style.cssText = `height:42px;padding:0 18px;border-radius:999px;border:1px solid ${BUTTON_ACTIVE_BORDER};background:${SUCCESS_GREEN};color:#121212;cursor:pointer;font-weight:700;`;
  const refs = {
    statusInput,
    repeatsInput,
    plannedDateInput,
    dateInput,
    ratingInput,
    notesInput,
    error,
    saveButton,
  };
  syncDraft = () => updateLogModalDraftForAlbum(resolvedAlbumUri, refs);
  statusInput.addEventListener('change', syncDraft);
  repeatsInput.addEventListener('input', syncDraft);
  plannedDateInput.addEventListener('input', syncDraft);
  dateInput.addEventListener('input', syncDraft);
  ratingInput.addEventListener('input', syncDraft);
  notesInput.addEventListener('input', syncDraft);
  saveButton.addEventListener('click', () => saveLogModal(refs));
  modal.addEventListener('wheel', (event) => {
    if (
      (event.target === ratingInput && document.activeElement === ratingInput)
      || (event.target === repeatsInput && document.activeElement === repeatsInput)
    ) {
      return;
    }

    event.preventDefault();
    window.scrollBy({
      top: event.deltaY,
      left: 0,
      behavior: 'auto',
    });
  }, { passive: false });

  repeatsInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      adjustRepeats(1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustRepeats(-1);
    }
  });

  form.appendChild(plannedDateField);
  topRow.appendChild(makeField('Status', statusInput));
  topRow.appendChild(makeField('Repeat listens', repeatsInput));
  topRow.appendChild(dateField);
  form.appendChild(topRow);
  form.appendChild(makeField('Rating', ratingFieldWrap));
  form.appendChild(makeField('Notes', notesInput));
  form.appendChild(error);
  actionRow.appendChild(cancelButton);
  actionRow.appendChild(saveButton);
  form.appendChild(actionRow);

  modal.appendChild(title);
  modal.appendChild(subtitle);
  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  lockLogModalHorizontalScroll(document);
  setTimeout(() => {
    ratingInput.focus();
    ratingInput.select?.();
  }, 0);
}

async function openLogFlowForAlbum(albumUri, {
  silentConnectionFailures = false,
} = {}) {
  const spotifyAlbumId = albumIdFromUri(albumUri);

  await withResolvedServer(async serverUrl => {
    const albumUiState = getAlbumUiStateBySpotifyId(spotifyAlbumId);
    const behavior = getActionBehavior('log', albumUiState);

    if (behavior === 'open-log-edit') {
      const record = getAlbumRecordBySpotifyId(spotifyAlbumId);
      if (!record?.id) {
        throw new Error(`Log is not available for this album right now.`);
      }
      const album = await fetchServerAlbum(serverUrl, record.id);
      openLogModal({ mode: 'edit', serverUrl, album, albumUri });
      return;
    }

    if (behavior === 'open-log-create') {
      const graphqlData = await fetchAlbumData(albumUri);
      openLogModal({ mode: 'create', serverUrl, graphqlData, albumUri });
      return;
    }

    throw new Error(`Log is not available for this album right now.`);
  }).catch(error => {
    if (silentConnectionFailures && isConnectionFailureError(error)) {
      console.warn('[Trackspot] Auto-log at album end could not reach the server.', error);
      return;
    }

    throw error;
  });
}

async function openLogFlow() {
  const albumUri = currentAlbumUri;
  await openLogFlowForAlbum(albumUri);
}

async function handleUploadAction() {
  const albumUri = currentAlbumUri;
  await withResolvedServer(async serverUrl => {
    const albumUiState = getCurrentAlbumUiState();
    const behavior = getActionBehavior('upload', albumUiState);

    if (behavior === 'open-existing') {
      const record = getCurrentAlbumRecord();
      SpicetifyApi.showNotification(`Opening ${APP_NAME}...`, false, 1800);
      openTrackspotAlbum(serverUrl, record.id);
      return;
    }

    if (behavior !== 'import-completed-open') {
      throw new Error(`Edit is not available for this album right now.`);
    }

    const graphqlData = await fetchAlbumData(albumUri);
    const result = await importAlbum(serverUrl, albumUri, graphqlData, {
      status: 'completed',
      repeats: 0,
      rating: null,
      notes: null,
      planned_at: null,
      listened_at: todayLocalISO(),
    });
    const albumId = result.album?.id ?? result.existingId;

    if (result.duplicate) {
      const existingAlbum = await fetchServerAlbum(serverUrl, result.existingId);
      mergeAlbumIntoIndex(existingAlbum, serverUrl);
      SpicetifyApi.showNotification(`Already in ${APP_NAME}. Opening it now...`, false, 2200);
    } else {
      mergeAlbumIntoIndex(result.album, serverUrl);
      SpicetifyApi.showNotification(`Logged to ${APP_NAME}. Opening it now...`, false, 2200);
    }

    renderActionButtons();
    refreshAlbumIndex();
    openTrackspotAlbum(serverUrl, albumId);
  });
}

async function handlePlanAction() {
  const albumUri = currentAlbumUri;
  await withResolvedServer(async serverUrl => {
    const albumUiState = getCurrentAlbumUiState();
    const behavior = getActionBehavior('plan', albumUiState);

    if (behavior === 'noop-already-planned') {
      SpicetifyApi.showNotification(`Already planned in ${APP_NAME}.`, false, 2200);
      return;
    }

    if (behavior === 'noop-already-logged') {
      SpicetifyApi.showNotification(`Already logged in ${APP_NAME}.`, false, 2200);
      return;
    }

    const graphqlData = await fetchAlbumData(albumUri);
    const result = await importAlbum(serverUrl, albumUri, graphqlData, {
      status: 'planned',
      repeats: 0,
      rating: null,
      notes: null,
      planned_at: todayLocalISO(),
      listened_at: null,
    });

    if (result.duplicate) {
      const existingAlbum = await fetchServerAlbum(serverUrl, result.existingId);
      mergeAlbumIntoIndex(existingAlbum, serverUrl);
      SpicetifyApi.showNotification(existingAlbum.status === 'planned'
        ? `Already planned in ${APP_NAME}.`
        : `Already logged in ${APP_NAME}.`, false, 2400);
    } else {
      mergeAlbumIntoIndex(result.album, serverUrl);
      SpicetifyApi.showNotification(`Saved to ${APP_NAME} as planned.`, false, 2200);
    }

    renderActionButtons();
    refreshAlbumIndex();
  });
}

async function maybePlanSavedAlbumFromSaveClick({
  albumUri,
  spotifyAlbumId,
  navigationToken,
}) {
  if (!albumUri || !spotifyAlbumId || !getPlanOnSaveClickEnabled()) return;
  if (autoLibrarySyncInFlight.has(spotifyAlbumId)) return;

  const initialUiState = getAlbumUiStateBySpotifyId(spotifyAlbumId);
  if (!shouldAutoPlanLibraryAlbum({
    enabled: true,
    albumUiState: initialUiState,
    inLibrary: true,
  })) {
    return;
  }

  autoLibrarySyncInFlight.add(spotifyAlbumId);

  try {
    await withResolvedServer(async (serverUrl) => {
      const refreshedUiState = getAlbumUiStateBySpotifyId(spotifyAlbumId);
      if (!shouldAutoPlanLibraryAlbum({
        enabled: true,
        albumUiState: refreshedUiState,
        inLibrary: true,
      })) {
        return;
      }

      const graphqlData = await fetchAlbumData(albumUri);
      const inLibrary = isAlbumSavedInLibraryFromGraphql(graphqlData);
      if (!shouldAutoPlanLibraryAlbum({
        enabled: true,
        albumUiState: getAlbumUiStateBySpotifyId(spotifyAlbumId),
        inLibrary,
      })) {
        return;
      }

      const result = await importAlbum(serverUrl, albumUri, graphqlData, {
        status: 'planned',
        repeats: 0,
        rating: null,
        notes: null,
        planned_at: todayLocalISO(),
        listened_at: null,
      });

      if (result.duplicate) {
        const existingAlbum = await fetchServerAlbum(serverUrl, result.existingId);
        mergeAlbumIntoIndex(existingAlbum, serverUrl);
      } else {
        mergeAlbumIntoIndex(result.album, serverUrl);
        if (navigationToken === albumNavigationToken && albumUri === currentAlbumUri) {
          SpicetifyApi.showNotification(`Saved from Your Library to ${APP_NAME} as planned.`, false, 2400);
        }
      }

      renderActionButtons();
      refreshAlbumIndex();
    });
  } catch (error) {
    console.warn('[Trackspot] Automatic Your Library sync failed.', error);
    if (isConnectionFailureError(error)) {
      SpicetifyApi.showNotification(
        getAutoSyncConnectionErrorMessage('auto-plan this saved album', error),
        true,
        4200,
      );
    }
  } finally {
    autoLibrarySyncInFlight.delete(spotifyAlbumId);
  }
}

async function planLibraryAlbumsFromSavedCollection({
  onProgress,
  notifyOnSuccess = true,
  notifyOnNoOp = true,
} = {}) {
  if (libraryBackfillInFlight) return;
  libraryBackfillInFlight = true;

  try {
    const resolvedServerUrl = await ensureActiveServerResolved();

    const knownAlbumIds = new Set(Object.keys(albumIndexState.albumsBySpotifyId ?? {}));
    const libraryItems = await fetchLibraryAlbumItems();
    const albumItems = libraryItems
      .filter(item => item?.type === 'album' && typeof item?.uri === 'string' && item.uri.startsWith('spotify:album:'))
      .sort((left, right) => {
        const leftAdded = String(left?.addedAt ?? '');
        const rightAdded = String(right?.addedAt ?? '');
        if (leftAdded !== rightAdded) return leftAdded.localeCompare(rightAdded);
        return String(left?.uri ?? '').localeCompare(String(right?.uri ?? ''));
      });

    let processedCount = 0;
    let plannedCount = 0;
    let skippedCount = 0;
    const failedItems = [];
    const reportProgress = () => {
      onProgress?.({
        processedCount,
        totalCount: albumItems.length,
        plannedCount,
        skippedCount,
        failedItems: failedItems.slice(),
      });
    };
    reportProgress();

    for (const item of albumItems) {
      const albumUri = item.uri;
      const spotifyAlbumId = albumIdFromUri(albumUri);
      if (!spotifyAlbumId) {
        processedCount += 1;
        reportProgress();
        continue;
      }
      if (knownAlbumIds.has(spotifyAlbumId)) {
        skippedCount += 1;
        processedCount += 1;
        reportProgress();
        continue;
      }

      try {
        const graphqlData = await fetchAlbumData(albumUri);
        const result = await importAlbum(resolvedServerUrl, albumUri, graphqlData, {
          status: 'planned',
          repeats: 0,
          rating: null,
          notes: null,
          planned_at: localDateISOFromTimestamp(item.addedAt),
          listened_at: null,
        });

        if (result.duplicate) {
          const existingAlbum = await fetchServerAlbum(resolvedServerUrl, result.existingId);
          mergeAlbumIntoIndex(existingAlbum, resolvedServerUrl);
          knownAlbumIds.add(spotifyAlbumId);
          skippedCount += 1;
        } else {
          mergeAlbumIntoIndex(result.album, resolvedServerUrl);
          knownAlbumIds.add(spotifyAlbumId);
          plannedCount += 1;
        }
      } catch (error) {
        if (isConnectionFailureError(error)) {
          throw error;
        }
        failedItems.push({
          albumUri,
          albumName: item?.name || null,
          errorMessage: error?.message || 'Unknown error.',
        });
        console.warn('[Trackspot] Bulk sync: album failed.', albumUri, error);
      }

      processedCount += 1;
      reportProgress();
    }

    renderActionButtons();
    refreshAlbumIndex();
    if ((plannedCount > 0 && notifyOnSuccess) || (plannedCount === 0 && notifyOnNoOp && failedItems.length === 0)) {
      SpicetifyApi.showNotification(
        plannedCount > 0
          ? `Planned ${plannedCount} library album${plannedCount === 1 ? '' : 's'} in ${APP_NAME}${skippedCount ? ` (${skippedCount} already existed).` : '.'}`
          : `No new saved albums needed planning in ${APP_NAME}.`,
        false,
        3200,
      );
    }
    if (failedItems.length > 0 && notifyOnSuccess) {
      SpicetifyApi.showNotification(
        `${APP_NAME} bulk sync: ${failedItems.length} album${failedItems.length === 1 ? '' : 's'} failed. See settings for details.`,
        true,
        4200,
      );
    }
    return {
      processedCount,
      totalCount: albumItems.length,
      plannedCount,
      skippedCount,
      failedItems,
    };
  } finally {
    libraryBackfillInFlight = false;
  }
}

async function maybeRunBulkLibrarySync(trigger, {
  notifyErrors = false,
  notifyOnSuccess = false,
  notifyOnNoOp = false,
} = {}) {
  if (libraryBackfillInFlight) return null;
  if ((trigger === 'navigation' || trigger === 'interval') && suppressAutoBulkSyncUntilReconnect) {
    return null;
  }

  try {
    if (trigger === 'startup') {
      await waitForLibraryApiReady();
      await ensureServerReadyWithRetries();
    } else if (!SpicetifyApi.Platform?.LibraryAPI?.getContents) {
      throw new Error('Spotify library API is not available.');
    }

    setLibraryBackfillUiState({
      phase: 'loading',
      inFlight: true,
      processedCount: 0,
      totalCount: 0,
      plannedCount: 0,
      skippedCount: 0,
      failedItems: [],
      errorMessage: null,
    });

    const result = await planLibraryAlbumsFromSavedCollection({
      notifyOnSuccess,
      notifyOnNoOp,
      onProgress: ({ processedCount = 0, totalCount = 0, plannedCount = 0, skippedCount = 0, failedItems = [] }) => {
        setLibraryBackfillUiState({
          phase: 'running',
          inFlight: true,
          processedCount,
          totalCount,
          plannedCount,
          skippedCount,
          failedItems,
          errorMessage: null,
        });
      },
    });

    setLibraryBackfillUiState({
      phase: 'completed',
      inFlight: false,
      processedCount: result?.processedCount ?? 0,
      totalCount: result?.totalCount ?? 0,
      plannedCount: result?.plannedCount ?? 0,
      skippedCount: result?.skippedCount ?? 0,
      failedItems: result?.failedItems ?? [],
      errorMessage: null,
      lastRunAt: Date.now(),
    });

    return result;
  } catch (error) {
    const message = error.message || `Couldn't plan your saved albums in ${APP_NAME}.`;
    setLibraryBackfillUiState({
      phase: 'error',
      inFlight: false,
      errorMessage: message,
    });

    if ((trigger === 'navigation' || trigger === 'interval') && isConnectionFailureError(error)) {
      suppressAutoBulkSyncUntilReconnect = true;
    }

    if (notifyErrors) {
      SpicetifyApi.showNotification(message, true, 3200);
    } else {
      console.warn(`[Trackspot] Automatic bulk library sync failed during ${trigger}.`, error);
    }
    return null;
  }
}

function restartBulkSyncIntervalLoop() {
  if (bulkLibrarySyncIntervalTimer) {
    clearInterval(bulkLibrarySyncIntervalTimer);
    bulkLibrarySyncIntervalTimer = null;
  }

  if (!getBulkSyncIntervalEnabled()) return;

  const hours = getBulkSyncIntervalHours();
  bulkLibrarySyncIntervalTimer = setInterval(() => {
    maybeRunBulkLibrarySync('interval');
  }, hours * 60 * 60 * 1000);
}

function scheduleStartupBulkSync() {
  if (startupBulkSyncAttempted || !getBulkSyncOnStartupEnabled()) return;
  startupBulkSyncAttempted = true;
  void maybeRunBulkLibrarySync('startup', { notifyErrors: true });
}

async function maybeTriggerNavigationBulkSync(navigationToken = albumNavigationToken) {
  const albumUri = currentAlbumUri;
  const shouldCheck = shouldTriggerNavigationBulkSync({
    enabled: getBulkSyncOnNavigationEnabled(),
    hasCurrentAlbum: Boolean(albumUri),
    hasLiveConnection: hasLiveServerConnection(),
    suppressUntilReconnect: suppressAutoBulkSyncUntilReconnect,
    isBulkSyncInFlight: libraryBackfillInFlight,
    record: getCurrentAlbumRecord(),
  });
  if (!shouldCheck || !albumUri) return;

  try {
    const graphqlData = await fetchAlbumData(albumUri);
    if (navigationToken !== albumNavigationToken || albumUri !== currentAlbumUri) return;
    if (isAlbumSavedInLibraryFromGraphql(graphqlData) !== true) return;
    if (getCurrentAlbumRecord()) return;
    await maybeRunBulkLibrarySync('navigation');
  } catch (error) {
    console.warn('[Trackspot] Navigation bulk-sync check failed.', error);
  }
}

async function maybeAutoDeleteRemovedAlbum({ albumUri, spotifyAlbumId, albumRecord, navigationToken }) {
  try {
    const graphqlData = await fetchAlbumData(albumUri);
    if (isAlbumSavedInLibraryFromGraphql(graphqlData) !== false) {
      return;
    }

    await withResolvedServer(async (serverUrl) => {
      const latestAlbum = await fetchServerAlbum(serverUrl, albumRecord.id);
      if (latestAlbum?.status !== 'planned') {
        mergeAlbumIntoIndex(latestAlbum, serverUrl);
        renderActionButtons();
        refreshAlbumIndex();
        return;
      }

      await deleteServerAlbum(serverUrl, albumRecord.id);
      removeAlbumFromIndex(spotifyAlbumId, serverUrl);
      renderActionButtons();
      refreshAlbumIndex();

      if (navigationToken === albumNavigationToken && albumUri === currentAlbumUri) {
        SpicetifyApi.showNotification(`Removed planned album from ${APP_NAME}.`, false, 2400);
      }
    });
  } catch (error) {
    console.warn('[Trackspot] Automatic removal sync failed.', error);
    if (isConnectionFailureError(error)) {
      SpicetifyApi.showNotification(
        getAutoSyncConnectionErrorMessage('auto-delete this removed album', error),
        true,
        4200,
      );
    }
  } finally {
    pendingAutoDeleteRemovedAlbums.delete(spotifyAlbumId);
  }
}

function queueAutoDeleteRemovedAlbum() {
  const enabled = getAutoDeleteRemovedAlbumsEnabled();
  const albumUri = currentAlbumUri;
  const spotifyAlbumId = getCurrentAlbumId();
  const albumRecord = getCurrentAlbumRecord();
  const navigationToken = albumNavigationToken;

  if (!albumUri || !spotifyAlbumId) return;
  if (!shouldAutoDeleteRemovedAlbum({ enabled, record: albumRecord })) return;

  const existingTimer = pendingAutoDeleteRemovedAlbums.get(spotifyAlbumId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timerId = setTimeout(() => {
    maybeAutoDeleteRemovedAlbum({
      albumUri,
      spotifyAlbumId,
      albumRecord: { ...albumRecord },
      navigationToken,
    });
  }, AUTO_LIBRARY_SYNC_DEBOUNCE_MS);

  pendingAutoDeleteRemovedAlbums.set(spotifyAlbumId, timerId);
}

function queueAutoPlanSavedAlbum() {
  const enabled = getPlanOnSaveClickEnabled();
  const albumUri = currentAlbumUri;
  const spotifyAlbumId = getCurrentAlbumId();
  const navigationToken = albumNavigationToken;

  if (!enabled || !spotifyAlbumId || !albumUri) return;

  const existingTimer = pendingAutoPlanSavedAlbums.get(spotifyAlbumId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timerId = setTimeout(() => {
    pendingAutoPlanSavedAlbums.delete(spotifyAlbumId);
    void maybePlanSavedAlbumFromSaveClick({
      albumUri,
      spotifyAlbumId,
      navigationToken,
    });
  }, AUTO_LIBRARY_SYNC_DEBOUNCE_MS);

  pendingAutoPlanSavedAlbums.set(spotifyAlbumId, timerId);
}

async function maybeCopyTrackShareLinkFromClick(event) {
  if (!getCopyShareLinkOnTrackTitleClickEnabled()) return false;
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;

  const rawTarget = event.target;
  if (!isElementLike(rawTarget)) return false;

  const titleElement = rawTarget.closest?.(TRACK_TITLE_SELECTOR);
  if (!titleElement) return false;

  const trackUri = resolveTrackUriFromElement(rawTarget);
  if (!trackUri) return false;

  const shareUrl = extractShareUrlFromTrackUri(trackUri);
  if (!shareUrl) return false;

  await copyTextToClipboard(formatCopiedTrackLinkText({
    titleElement,
    trackUri,
    shareUrl,
  }));
  showTrackLinkCopyPopup(titleElement);
  return true;
}

function handleDocumentClick(event) {
  void maybeCopyTrackShareLinkFromClick(event).catch((error) => {
    console.warn('[Trackspot] Failed to copy track share link.', error);
  });

  if (!currentAlbumUri) return;
  if (getAutoDeleteRemovedAlbumsEnabled() && isRemoveFromLibraryControl(event.target)) {
    queueAutoDeleteRemovedAlbum();
    return;
  }
  if (getPlanOnSaveClickEnabled() && isSaveToLibraryControl(event.target)) {
    queueAutoPlanSavedAlbum();
  }
}

async function handleActionButtonClick(actionKey) {
  if (!currentAlbumUri) {
    SpicetifyApi.showNotification('Open an album page to use Trackspot.', true, 2200);
    return;
  }

  if (activeActionKey) return;
  activeActionKey = actionKey;
  renderActionButtons();

  try {
    if (actionKey === 'upload') {
      await handleUploadAction();
    } else if (actionKey === 'plan') {
      await handlePlanAction();
    } else if (actionKey === 'log') {
      await openLogFlow();
    } else if (actionKey === 'open') {
      await withResolvedServer(async serverUrl => {
        openTrackspotApp(serverUrl);
      });
    }
  } catch (error) {
    console.error('[Trackspot]', error);
    SpicetifyApi.showNotification(`Couldn't complete that ${APP_NAME} action: ${error.message}`, true, 3200);
  } finally {
    activeActionKey = null;
    renderActionButtons();
  }
}

// ===========================================================================
// WELCOME TOUR
// ===========================================================================

function removeWelcomeTourModal() {
  document.getElementById(WELCOME_TOUR_MODAL_ID)?.remove();
  document.getElementById(WELCOME_TOUR_HIGHLIGHT_ID)?.remove();
}

function waitForDelay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitForCondition(predicate, {
  timeoutMs = WELCOME_TOUR_TARGET_RETRY_MS,
  intervalMs = WELCOME_TOUR_TARGET_POLL_MS,
} = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true;
    await waitForDelay(intervalMs);
  }
  return Boolean(predicate());
}

function getWelcomeTourActionGroupTarget() {
  if (getButtonStyle() === 'corner') {
    return document.getElementById(CORNER_ACTIONS_WRAP_ID)
      || document.getElementById(SUBTLE_ACTIONS_WRAP_ID);
  }

  return document.getElementById(SUBTLE_ACTIONS_WRAP_ID)
    || document.getElementById(CORNER_ACTIONS_WRAP_ID);
}

function getWelcomeTourActionButtonTarget(actionKey) {
  return getWelcomeTourActionGroupTarget()?.querySelector?.(`[data-action="${actionKey}"]`) ?? null;
}

function navigateToAlbumUri(albumUri) {
  const albumId = albumIdFromUri(albumUri);
  if (!albumId) return false;

  const history = SpicetifyApi.Platform?.History;
  if (!history?.push) return false;

  history.push(`/album/${albumId}`);
  return true;
}

async function ensureWelcomeTourAlbumContext() {
  const targetAlbumUri = currentAlbumUri || WELCOME_TOUR_FALLBACK_ALBUM_URI;
  if (!currentAlbumUri) {
    navigateToAlbumUri(targetAlbumUri);
  }

  await waitForCondition(() => currentAlbumUri === targetAlbumUri, {
    timeoutMs: 5000,
    intervalMs: 100,
  });
  await waitForDelay(700);
  return targetAlbumUri;
}

async function showWelcomeTourButtonVisibilityCheckStep() {
  return showWelcomeTourStep({
    title: 'Button visibility check',
    buildContent: (content) => {
      content.appendChild(createWelcomeTourParagraph('Do you see the buttons in the action bar? If not, action button insertion is currently broken and we will switch to floating buttons in the bottom-right.'));
    },
    buttons: [
      {
        label: 'No',
        action: 'switch-floating',
        onSelect: async () => {
          setButtonStyle('corner');
          applyButtonStyle('corner');
          await waitForDelay(400);
        },
      },
      { label: 'I see them', action: 'continue', primary: true },
    ],
    targetResolver: getWelcomeTourActionGroupTarget,
  });
}

async function showWelcomeTourFloatingPlacementStep() {
  return showWelcomeTourStep({
    title: 'Buttons are floating',
    buildContent: (content) => {
      content.appendChild(createWelcomeTourParagraph(`We are currently using the floating buttons. Keep them here or try to put them with Spotify's album action buttons?`));
    },
    buttons: [
      { label: 'Keep here', action: 'keep-here' },
      {
        label: 'Try to put with the album actions',
        action: 'try-inline',
        primary: true,
        onSelect: async () => {
          setButtonStyle('subtle');
          applyButtonStyle('subtle');
          await waitForDelay(400);
        },
      },
    ],
    targetResolver: getWelcomeTourActionGroupTarget,
  });
}

function createWelcomeTourParagraph(text) {
  const paragraph = document.createElement('div');
  paragraph.style.cssText = 'font-size:14px;line-height:1.6;color:rgba(255,255,255,0.78);';
  paragraph.textContent = text;
  return paragraph;
}

function createWelcomeTourMenuImage() {
  const image = document.createElement('img');
  image.src = MENU_DIAGRAM_DATA_URL;
  image.alt = 'Trackspot settings menu path';
  image.style.cssText = 'display:block;width:min(420px, 100%);border-radius:14px;border:1px solid rgba(255,255,255,0.12);background:#121212;';
  return image;
}

function clampWelcomeTourValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getWelcomeTourModalAnchorTarget(target) {
  const actionGroupTarget = getWelcomeTourActionGroupTarget();
  if (
    actionGroupTarget?.isConnected
    && (actionGroupTarget === target || actionGroupTarget.contains?.(target))
  ) {
    return actionGroupTarget;
  }
  return target;
}

function positionWelcomeTourModal(modal, target) {
  if (!modal?.isConnected) return;

  const padding = WELCOME_TOUR_MODAL_VIEWPORT_PADDING_PX;
  const gap = WELCOME_TOUR_MODAL_TARGET_GAP_PX;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const maxWidth = Math.max(280, viewportWidth - (padding * 2));
  const maxHeight = Math.max(240, viewportHeight - (padding * 2));

  modal.style.maxWidth = `${maxWidth}px`;
  modal.style.maxHeight = `${maxHeight}px`;

  if (!target?.isConnected) {
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const anchorTarget = getWelcomeTourModalAnchorTarget(target);
  const anchorRect = anchorTarget?.getBoundingClientRect?.();
  if (!anchorRect || anchorRect.width <= 0 || anchorRect.height <= 0) {
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const modalWidth = Math.min(modal.offsetWidth || WELCOME_TOUR_MODAL_MAX_WIDTH_PX, maxWidth);
  const modalHeight = Math.min(modal.offsetHeight || maxHeight, maxHeight);
  const availableRight = viewportWidth - padding - anchorRect.right - gap;
  const availableLeft = anchorRect.left - padding - gap;
  const availableBottom = viewportHeight - padding - anchorRect.bottom - gap;
  const availableTop = anchorRect.top - padding - gap;
  const centeredLeft = clampWelcomeTourValue(
    anchorRect.left + (anchorRect.width / 2) - (modalWidth / 2),
    padding,
    viewportWidth - padding - modalWidth,
  );
  const centeredTop = clampWelcomeTourValue(
    anchorRect.top + (anchorRect.height / 2) - (modalHeight / 2),
    padding,
    viewportHeight - padding - modalHeight,
  );
  const candidates = [];

  if (getButtonStyle() === 'corner') {
    const preferredLeft = anchorRect.right - modalWidth;
    const preferredTop = anchorRect.top - gap - modalHeight;
    candidates.push({
      priority: 0,
      available: Math.min(availableTop, viewportWidth - padding - preferredLeft),
      fits: (
        preferredTop >= padding
        && preferredLeft >= padding
        && preferredLeft + modalWidth <= viewportWidth - padding
      ),
      left: preferredLeft,
      top: preferredTop,
    });
  } else {
    const preferredLeft = anchorRect.left;
    const preferredTop = anchorRect.bottom + gap;
    candidates.push({
      priority: 0,
      available: Math.min(availableBottom, viewportWidth - padding - preferredLeft),
      fits: (
        preferredTop + modalHeight <= viewportHeight - padding
        && preferredLeft >= padding
        && preferredLeft + modalWidth <= viewportWidth - padding
      ),
      left: preferredLeft,
      top: preferredTop,
    });
  }

  candidates.push(
    {
      priority: 1,
      available: availableRight,
      fits: availableRight >= modalWidth,
      left: clampWelcomeTourValue(anchorRect.right + gap, padding, viewportWidth - padding - modalWidth),
      top: centeredTop,
    },
    {
      priority: 1,
      available: availableLeft,
      fits: availableLeft >= modalWidth,
      left: clampWelcomeTourValue(anchorRect.left - gap - modalWidth, padding, viewportWidth - padding - modalWidth),
      top: centeredTop,
    },
    {
      priority: 1,
      available: availableBottom,
      fits: availableBottom >= modalHeight,
      left: centeredLeft,
      top: clampWelcomeTourValue(anchorRect.bottom + gap, padding, viewportHeight - padding - modalHeight),
    },
    {
      priority: 1,
      available: availableTop,
      fits: availableTop >= modalHeight,
      left: centeredLeft,
      top: clampWelcomeTourValue(anchorRect.top - gap - modalHeight, padding, viewportHeight - padding - modalHeight),
    },
  );
  const [chosen] = candidates.sort((leftCandidate, rightCandidate) => {
    if (leftCandidate.fits !== rightCandidate.fits) {
      return leftCandidate.fits ? -1 : 1;
    }
    if ((leftCandidate.priority ?? 1) !== (rightCandidate.priority ?? 1)) {
      return (leftCandidate.priority ?? 1) - (rightCandidate.priority ?? 1);
    }
    return rightCandidate.available - leftCandidate.available;
  });

  modal.style.left = `${chosen?.left ?? centeredLeft}px`;
  modal.style.top = `${chosen?.top ?? centeredTop}px`;
  modal.style.transform = 'none';
}

function attachWelcomeTourModalPositioning(modal, targetResolver) {
  const syncPosition = () => {
    const target = typeof targetResolver === 'function' ? targetResolver() : null;
    positionWelcomeTourModal(modal, target);
  };
  const scheduleSyncPosition = () => {
    window.requestAnimationFrame(syncPosition);
  };

  scheduleSyncPosition();
  window.addEventListener('resize', scheduleSyncPosition);
  document.addEventListener('scroll', scheduleSyncPosition, true);

  let resizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => {
      scheduleSyncPosition();
    });
    resizeObserver.observe(modal);
  }

  const imageListeners = [];
  modal.querySelectorAll('img').forEach(image => {
    const handleLoad = () => {
      scheduleSyncPosition();
    };
    image.addEventListener('load', handleLoad);
    imageListeners.push([image, handleLoad]);
  });

  return () => {
    window.removeEventListener('resize', scheduleSyncPosition);
    document.removeEventListener('scroll', scheduleSyncPosition, true);
    resizeObserver?.disconnect();
    imageListeners.forEach(([image, handleLoad]) => {
      image.removeEventListener('load', handleLoad);
    });
  };
}

async function waitForWelcomeTourTarget(targetResolver, {
  timeoutMs = WELCOME_TOUR_TARGET_RETRY_MS,
} = {}) {
  if (typeof targetResolver !== 'function') return null;

  const found = await waitForCondition(() => {
    const target = targetResolver();
    return Boolean(target && target.isConnected);
  }, {
    timeoutMs,
    intervalMs: WELCOME_TOUR_TARGET_POLL_MS,
  });

  if (!found) return null;
  const target = targetResolver();
  return target && target.isConnected ? target : null;
}

function attachWelcomeTourHighlight(target) {
  document.getElementById(WELCOME_TOUR_HIGHLIGHT_ID)?.remove();
  if (!target?.isConnected) {
    return () => {};
  }

  try {
    target.scrollIntoView?.({ block: 'center', inline: 'center' });
  } catch {
    // Ignore scroll issues on unstable client builds.
  }

  const highlight = document.createElement('div');
  highlight.id = WELCOME_TOUR_HIGHLIGHT_ID;
  highlight.style.cssText = `
    position: fixed;
    z-index: 10003;
    pointer-events: none;
    border-radius: 16px;
    border: 2px solid ${SUCCESS_GREEN};
    box-shadow: 0 0 0 6px rgba(30,215,96,0.18), 0 0 24px rgba(30,215,96,0.24);
    transition: top 0.16s ease, left 0.16s ease, width 0.16s ease, height 0.16s ease;
  `;

  const syncHighlight = () => {
    if (!target.isConnected) {
      highlight.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      highlight.style.display = 'none';
      return;
    }

    const inset = 8;
    highlight.style.display = 'block';
    highlight.style.top = `${Math.max(8, rect.top - inset)}px`;
    highlight.style.left = `${Math.max(8, rect.left - inset)}px`;
    highlight.style.width = `${rect.width + (inset * 2)}px`;
    highlight.style.height = `${rect.height + (inset * 2)}px`;
  };

  document.body.appendChild(highlight);
  syncHighlight();
  window.addEventListener('resize', syncHighlight);
  document.addEventListener('scroll', syncHighlight, true);

  return () => {
    window.removeEventListener('resize', syncHighlight);
    document.removeEventListener('scroll', syncHighlight, true);
    highlight.remove();
  };
}

function showWelcomeTourStep({
  title,
  buildContent,
  buttons,
  targetResolver = null,
  dimBackground = false,
} = {}) {
  removeWelcomeTourModal();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = WELCOME_TOUR_MODAL_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10002;
      background: ${dimBackground ? 'rgba(0,0,0,0.68)' : 'transparent'};
      ${dimBackground ? 'backdrop-filter: blur(8px);' : ''}
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      width: min(${WELCOME_TOUR_MODAL_MAX_WIDTH_PX}px, calc(100vw - ${(WELCOME_TOUR_MODAL_VIEWPORT_PADDING_PX * 2)}px));
      max-height: calc(100vh - ${(WELCOME_TOUR_MODAL_VIEWPORT_PADDING_PX * 2)}px);
      background: #181818;
      color: #f5f5f5;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 28px 80px rgba(0,0,0,0.45);
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
      box-sizing: border-box;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:22px;font-weight:700;line-height:1.2;color:#ffffff;';
    titleEl.textContent = title;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close welcome tour');
    closeButton.textContent = '×';
    closeButton.style.cssText = 'flex-shrink:0;width:36px;height:36px;margin-top:-6px;margin-right:-6px;border:none;border-radius:999px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.82);font-size:24px;line-height:1;cursor:pointer;';

    const content = document.createElement('div');
    content.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    buildContent?.(content);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:4px;flex-wrap:wrap;';

    let settled = false;
    let cleanupHighlight = () => {};
    let cleanupPositioning = () => {};

    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', handleEscape);
      cleanupPositioning();
      cleanupHighlight();
      removeWelcomeTourModal();
      setHasSeenWelcomeTour(true);
      resolve(result);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        cleanup('__dismiss');
      }
    };

    closeButton.addEventListener('click', () => cleanup('__dismiss'));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('__dismiss');
      }
    });
    modal.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('keydown', handleEscape);

    buttons.forEach((buttonConfig, index) => {
      const {
        label,
        action,
        primary = false,
        onSelect = null,
      } = buttonConfig;

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = primary
        ? `height:42px;padding:0 18px;border-radius:999px;border:1px solid ${BUTTON_ACTIVE_BORDER};background:${SUCCESS_GREEN};color:#121212;cursor:pointer;font-weight:700;`
        : 'height:42px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:#242424;color:#fff;cursor:pointer;';
      button.addEventListener('click', async () => {
        if (settled) return;
        try {
          await onSelect?.();
        } catch (error) {
          console.warn('[Trackspot] Welcome tour action failed.', error);
        }
        cleanup(action);
      });
      actions.appendChild(button);

      if ((primary || index === 0) && actions.childElementCount === 1) {
        setTimeout(() => button.focus(), 0);
      }
    });

    header.appendChild(titleEl);
    header.appendChild(closeButton);
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    cleanupPositioning = attachWelcomeTourModalPositioning(modal, targetResolver);

    if (typeof targetResolver === 'function') {
      void waitForWelcomeTourTarget(targetResolver).then(target => {
        if (settled) return;
        cleanupHighlight();
        cleanupHighlight = attachWelcomeTourHighlight(target);
        positionWelcomeTourModal(modal, target);
      });
    }
  });
}

function maybeAutoOpenWelcomeTour() {
  if (welcomeTourAutoOpenAttempted || getHasSeenWelcomeTour()) {
    return;
  }

  welcomeTourAutoOpenAttempted = true;
  setTimeout(() => {
    if (!getHasSeenWelcomeTour() && !welcomeTourRunPromise) {
      void openWelcomeTour();
    }
  }, 300);
}

function openWelcomeTour() {
  if (welcomeTourRunPromise) {
    return welcomeTourRunPromise;
  }

  welcomeTourRunPromise = (async () => {
    const welcomeChoice = await showWelcomeTourStep({
      title: `Welcome to the ${APP_NAME} Spicetify extension`,
      buildContent: (content) => {
        const intro = document.createElement('div');
        intro.style.cssText = 'font-size:14px;line-height:1.6;color:rgba(255,255,255,0.78);';
        intro.append('If you do not already have a Trackspot server running, please do so by following the instructions at ');
        const link = document.createElement('a');
        link.href = 'https://github.com/eao/trackspot';
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = 'the Trackspot GitHub page.';
        link.style.cssText = `color:${SUCCESS_GREEN};text-decoration:underline;`;
        intro.appendChild(link);
        intro.append(" You can still play the tour if you haven't set up a server yet.");
        content.appendChild(intro);
        content.appendChild(createWelcomeTourParagraph('The welcome tour will show you where the Trackspot controls live inside Spotify and what each one does.'));
      },
      buttons: [
        { label: 'Not now', action: 'not-now' },
        { label: 'Play tour', action: 'play-tour', primary: true },
      ],
      dimBackground: true,
    });

    if (welcomeChoice === 'not-now') {
      await showWelcomeTourStep({
        title: 'Tour available later',
        buildContent: (content) => {
          content.appendChild(createWelcomeTourParagraph('Alright. You can always play the tour from the settings menu. Access it by clicking your profile picture and then "Trackspot settings".'));
          content.appendChild(createWelcomeTourMenuImage());
        },
        buttons: [
          { label: 'OK', action: 'done', primary: true },
        ],
      });
      return;
    }

    if (welcomeChoice !== 'play-tour') {
      return;
    }

    await ensureWelcomeTourAlbumContext();

    if (getButtonStyle() === 'corner') {
      const floatingChoice = await showWelcomeTourFloatingPlacementStep();
      if (floatingChoice === 'try-inline') {
        await showWelcomeTourButtonVisibilityCheckStep();
      }
    } else {
      await showWelcomeTourButtonVisibilityCheckStep();
    }

    await showWelcomeTourStep({
      title: 'Plan',
      buildContent: (content) => {
        content.appendChild(createWelcomeTourParagraph(`"Plan" adds the current album to ${APP_NAME} with status "Planned".`));
        content.appendChild(createWelcomeTourParagraph(`There is also additional functionality in the settings for keeping Spotify library actions and ${APP_NAME} planned albums in sync.`));
      },
      buttons: [
        { label: 'Next', action: 'next', primary: true },
      ],
      targetResolver: () => getWelcomeTourActionButtonTarget('plan'),
    });

    await showWelcomeTourStep({
      title: 'Log',
      buildContent: (content) => {
        content.appendChild(createWelcomeTourParagraph(`"Log" opens the ${APP_NAME} log flow so you can record a completed or dropped listen with dates, rating, and notes.`));
      },
      buttons: [
        { label: 'Next', action: 'next', primary: true },
      ],
      targetResolver: () => getWelcomeTourActionButtonTarget('log'),
    });

    await showWelcomeTourStep({
      title: `Log/Edit Album in ${APP_NAME}`,
      buildContent: (content) => {
        content.appendChild(createWelcomeTourParagraph(`This icon opens the album's editor in ${APP_NAME} when the album already exists there.`));
        content.appendChild(createWelcomeTourParagraph(`If the album is not in ${APP_NAME} yet, it logs it as completed with today's local date listened, then opens the editor.`));
      },
      buttons: [
        { label: 'Next', action: 'next', primary: true },
      ],
      targetResolver: () => getWelcomeTourActionButtonTarget('upload'),
    });

    await showWelcomeTourStep({
      title: `Open ${APP_NAME}`,
      buildContent: (content) => {
        content.appendChild(createWelcomeTourParagraph(`This button opens the ${APP_NAME} app directly.`));
      },
      buttons: [
        { label: 'Next', action: 'next', primary: true },
      ],
      targetResolver: () => getWelcomeTourActionButtonTarget('open'),
    });

    await showWelcomeTourStep({
      title: 'Settings and replay',
      buildContent: (content) => {
        content.appendChild(createWelcomeTourParagraph(`You can edit the extension settings from your profile picture menu via "${APP_NAME} settings".`));
        content.appendChild(createWelcomeTourParagraph(`This is where you can configure your ${APP_NAME} server URL(s). It is set up for localhost by default, so you will need to change this if you're running ${APP_NAME} somewhere besides this very machine with default settings.`));
        content.appendChild(createWelcomeTourMenuImage());
        content.appendChild(createWelcomeTourParagraph('The settings modal also includes a "Play welcome tour" button if you ever want to revisit this walkthrough.'));
      },
      buttons: [
        { label: 'OK', action: 'done', primary: true },
      ],
    });
  })().finally(() => {
    removeWelcomeTourModal();
    welcomeTourRunPromise = null;
  });

  return welcomeTourRunPromise;
}

// ===========================================================================
// STYLE MODAL
// ===========================================================================

const STYLE_MODAL_ID = 'trackspot-style-modal';
const STYLE_MODAL_FORM_STYLE_ID = 'trackspot-style-modal-form-style';
const RESET_STATUS_TIMEOUT_MS = 4000;
const LOG_MODAL_HORIZONTAL_OFFSET_VW = 10;
const LOG_MODAL_HORIZONTAL_OFFSET_MAX_PX = 160;

function removeStyleModal() {
  document.getElementById(STYLE_MODAL_ID)?.remove();
}

function ensureStyleModalFormStyle(doc = document) {
  if (!doc?.head) return null;

  const existing = doc.getElementById(STYLE_MODAL_FORM_STYLE_ID);
  if (existing) return existing;

  const style = doc.createElement('style');
  style.id = STYLE_MODAL_FORM_STYLE_ID;
  style.textContent = `
    .trackspot-style-modal-number-input[type="number"] {
      appearance: textfield;
      -moz-appearance: textfield;
    }

    .trackspot-style-modal-number-input[type="number"]::-webkit-outer-spin-button,
    .trackspot-style-modal-number-input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  `;
  doc.head.appendChild(style);
  return style;
}

function createStyleOptionCard({ value, title, description, currentStyle, onSelect }) {
  const isSelected = currentStyle === value;
  const card = document.createElement('button');

  card.type = 'button';
  card.style.cssText = `
    width: 100%;
    border: 1px solid ${isSelected ? 'rgba(30,215,96,0.85)' : 'rgba(255,255,255,0.12)'};
    background: ${isSelected ? 'rgba(30,215,96,0.12)' : 'rgba(255,255,255,0.03)'};
    color: inherit;
    border-radius: 14px;
    padding: 16px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.16s ease, background 0.16s ease;
  `;

  card.innerHTML =
    `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">` +
      `<div>` +
        `<div style="font-size:15px;font-weight:700;color:#ffffff;">${title}</div>` +
        `<div style="margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.78);">${description}</div>` +
      `</div>` +
      `<div style="flex-shrink:0;min-width:64px;padding:5px 9px;border-radius:999px;background:${isSelected ? '#1ED760' : 'rgba(255,255,255,0.08)'};color:${isSelected ? '#121212' : 'rgba(255,255,255,0.72)'};font-size:11px;font-weight:700;letter-spacing:0.02em;text-align:center;">${isSelected ? 'Current' : 'Select'}</div>` +
    `</div>`;

  card.addEventListener('mouseenter', () => {
    if (!isSelected) {
      card.style.background = 'rgba(255,255,255,0.06)';
      card.style.borderColor = 'rgba(255,255,255,0.22)';
    }
  });

  card.addEventListener('mouseleave', () => {
    if (!isSelected) {
      card.style.background = 'rgba(255,255,255,0.03)';
      card.style.borderColor = 'rgba(255,255,255,0.12)';
    }
  });

  card.addEventListener('click', () => onSelect(value));
  return card;
}

function openStyleModal() {
  removeStyleModal();
  ensureStyleModalFormStyle();

  const overlay = document.createElement('div');
  overlay.id = STYLE_MODAL_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.62);
    backdrop-filter: blur(8px);
    padding: 24px;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    width: min(650px, 100%);
    max-height: 95vh;
    background: #181818;
    color: #ffffff;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    box-shadow: 0 28px 80px rgba(0,0,0,0.45);
    padding: 22px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:22px;font-weight:700;line-height:1.2;';
  title.textContent = `${APP_NAME} settings`;

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'margin-top:10px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08);font-size:15px;font-weight:700;color:#ffffff;';
  subtitle.textContent = 'Upload button placement';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close settings');
  closeButton.style.cssText = `
    all: unset;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    margin-top: -10px;
    margin-right: -10px;
    padding: 0;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 10;
    border: none;
    background: transparent;
    color: rgba(255,255,255,0.82);
    cursor: pointer;
    -webkit-app-region: no-drag;
  `;

  const closeButtonIcon = document.createElement('span');
  closeButtonIcon.textContent = '×';
  closeButtonIcon.style.cssText = `
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
    color: currentColor;
    font-size: 24px;
    line-height: 1;
    pointer-events: none;
    user-select: none;
  `;

  const optionList = document.createElement('div');
  optionList.style.cssText = 'display:grid;gap:12px;margin-top:16px;';

  const contentBody = document.createElement('div');
  contentBody.style.cssText = `
    flex: 1 1 auto;
    margin-top: 12px;
    padding-right: 6px;
    overflow-y: auto;
    min-height: 0;
  `;

  const serverSettings = document.createElement('div');
  serverSettings.style.cssText = 'margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);';

  const serverTitle = document.createElement('div');
  serverTitle.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
  serverTitle.textContent = 'Server URLs';

  const serverSubtitle = document.createElement('div');
  serverSubtitle.style.cssText = 'margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.72);';
  serverSubtitle.textContent = 'The default URL will be tried first, then the backup URL if one is set.';

  const defaultUrlLabel = document.createElement('label');
  defaultUrlLabel.style.cssText = 'display:block;margin-top:14px;font-size:12px;font-weight:700;letter-spacing:0.02em;color:rgba(255,255,255,0.72);';
  defaultUrlLabel.textContent = 'Default server URL';

  const defaultUrlInput = document.createElement('input');
  defaultUrlInput.type = 'text';
  defaultUrlInput.value = getDefaultServerUrl();
  defaultUrlInput.style.cssText = `
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
    color: #ffffff;
    font-size: 13px;
    box-sizing: border-box;
  `;

  const backupUrlLabel = document.createElement('label');
  backupUrlLabel.style.cssText = 'display:block;margin-top:14px;font-size:12px;font-weight:700;letter-spacing:0.02em;color:rgba(255,255,255,0.72);';
  backupUrlLabel.textContent = 'Backup server URL';

  const backupUrlInput = document.createElement('input');
  backupUrlInput.type = 'text';
  backupUrlInput.value = getBackupServerUrl() || '';
  backupUrlInput.placeholder = 'Optional';
  backupUrlInput.style.cssText = `
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
    color: #ffffff;
    font-size: 13px;
    box-sizing: border-box;
  `;

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset settings';
  resetButton.style.cssText = `
    margin-top: 18px;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  `;

  const resetStatus = document.createElement('div');
  resetStatus.style.cssText = `
    margin-top: 18px;
    margin-left: 12px;
    font-size: 13px;
    line-height: 1.4;
    color: rgba(255,255,255,0.72);
    opacity: 0;
    transition: opacity 0.16s ease;
  `;
  resetStatus.textContent = 'Settings were reset to defaults.';

  const resetRow = document.createElement('div');
  resetRow.style.cssText = 'display:flex;align-items:center;';

  const workerSettings = document.createElement('div');
  workerSettings.style.cssText = 'margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);';

  const workerTitle = document.createElement('div');
  workerTitle.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
  workerTitle.textContent = 'CSV import worker';

  const workerSubtitle = document.createElement('div');
  workerSubtitle.style.cssText = 'margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.72);';
  workerSubtitle.textContent = 'Lets Spotify process CSV import rows in the background for Trackspot.';

  const workerToggleRow = document.createElement('label');
  workerToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const workerToggleCopy = document.createElement('div');
  workerToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const workerToggleLabel = document.createElement('div');
  workerToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  workerToggleLabel.textContent = 'Enable background CSV worker';

  const workerToggleDesc = document.createElement('div');
  workerToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  workerToggleDesc.textContent = 'When enabled, this extension polls Trackspot for queued CSV imports and uploads album GraphQL data automatically. Keep this off unless you need to do a CSV import.';

  const workerToggle = document.createElement('input');
  workerToggle.type = 'checkbox';
  workerToggle.checked = getCsvWorkerEnabled();
  workerToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const playbackSettings = document.createElement('div');
  playbackSettings.style.cssText = 'margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);';

  const playbackTitle = document.createElement('div');
  playbackTitle.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
  playbackTitle.textContent = 'Playback';

  const playbackSubtitle = document.createElement('div');
  playbackSubtitle.style.cssText = 'margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.72);';
  playbackSubtitle.textContent = 'Album-only playback helpers that follow Spotify\'s active listening context.';

  const playbackStopToggleRow = document.createElement('label');
  playbackStopToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const playbackStopToggleCopy = document.createElement('div');
  playbackStopToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const playbackStopToggleLabel = document.createElement('div');
  playbackStopToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  playbackStopToggleLabel.textContent = 'Stop playback at album end';

  const playbackStopToggleDesc = document.createElement('div');
  playbackStopToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  playbackStopToggleDesc.textContent = 'Pause Spotify when the last track finishes in an album playback context, without affecting playlists.';

  const playbackStopToggle = document.createElement('input');
  playbackStopToggle.type = 'checkbox';
  playbackStopToggle.checked = getAutoStopAlbumPlaybackAtEndEnabled();
  playbackStopToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const playbackLogToggleRow = document.createElement('label');
  playbackLogToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const playbackLogToggleCopy = document.createElement('div');
  playbackLogToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const playbackLogToggleLabel = document.createElement('div');
  playbackLogToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  playbackLogToggleLabel.textContent = 'Auto-log at album end';

  const playbackLogToggleDesc = document.createElement('div');
  playbackLogToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  playbackLogToggleDesc.textContent = `Open the ${APP_NAME} log modal automatically when album playback reaches the end of the last track.`;

  const playbackLogToggle = document.createElement('input');
  playbackLogToggle.type = 'checkbox';
  playbackLogToggle.checked = getAutoLogAlbumAtEndEnabled();
  playbackLogToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const playbackExceptionSettings = document.createElement('div');
  playbackExceptionSettings.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:14px;';

  const playbackExceptionTitle = document.createElement('div');
  playbackExceptionTitle.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  playbackExceptionTitle.textContent = 'Except these';

  const playbackExceptionDesc = document.createElement('div');
  playbackExceptionDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:560px;';
  playbackExceptionDesc.textContent = 'Exceptions to post-playback events. Putting minutes at "0" means no exceptions.';

  const playbackExceptionControls = document.createElement('div');
  playbackExceptionControls.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

  const playbackExceptionTypeSelect = document.createElement('select');
  playbackExceptionTypeSelect.style.cssText = `
    min-width: 120px;
    padding: 8px 36px 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background-color: rgba(255,255,255,0.04);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.25L6 6.25L11 1.25' stroke='rgba(255,255,255,0.82)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    color: #ffffff;
    font-size: 13px;
    line-height: 1.2;
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
  `;
  [
    { value: 'singles', label: 'Singles' },
    { value: 'all', label: 'All' },
  ].forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.style.backgroundColor = '#181818';
    option.style.color = '#ffffff';
    playbackExceptionTypeSelect.appendChild(option);
  });
  playbackExceptionTypeSelect.value = getAlbumEndPlaybackExceptionType();

  const playbackExceptionUnderText = document.createElement('span');
  playbackExceptionUnderText.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.82);';
  playbackExceptionUnderText.textContent = 'under';

  const playbackExceptionMinutesInput = document.createElement('input');
  playbackExceptionMinutesInput.type = 'number';
  playbackExceptionMinutesInput.min = '0';
  playbackExceptionMinutesInput.step = '1';
  playbackExceptionMinutesInput.inputMode = 'numeric';
  playbackExceptionMinutesInput.className = 'trackspot-style-modal-number-input';
  playbackExceptionMinutesInput.value = String(getAlbumEndPlaybackExceptionMinutes());
  playbackExceptionMinutesInput.style.cssText = `
    width: 84px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background-color: rgba(255,255,255,0.04);
    color: #ffffff;
    font-size: 13px;
    line-height: 1.2;
    box-sizing: border-box;
    appearance: textfield;
    -moz-appearance: textfield;
  `;

  const playbackExceptionMinutesText = document.createElement('span');
  playbackExceptionMinutesText.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.82);';
  playbackExceptionMinutesText.textContent = 'minutes';

  const libraryActionSettings = document.createElement('div');
  libraryActionSettings.style.cssText = 'margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);';

  const bulkLibrarySyncSettings = document.createElement('div');
  bulkLibrarySyncSettings.style.cssText = 'margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);';

  const miscSettings = document.createElement('div');
  miscSettings.style.cssText = 'margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);';

  const miscTitle = document.createElement('div');
  miscTitle.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
  miscTitle.textContent = 'Miscellaneous';

  const copyShareLinkToggleRow = document.createElement('label');
  copyShareLinkToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const copyShareLinkToggleCopy = document.createElement('div');
  copyShareLinkToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const copyShareLinkToggleLabel = document.createElement('div');
  copyShareLinkToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  copyShareLinkToggleLabel.textContent = 'Click track title to copy share link';

  const copyShareLinkToggleDesc = document.createElement('div');
  copyShareLinkToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:560px;white-space:pre-line;';
  copyShareLinkToggleDesc.textContent = 'Clicking a track\'s title will copy its share link to the clipboard.\nIf you paste share links in your notes, Trackspot will automatically convert them to Markdown-style links, but we recommend just copying the Markdown-style links by default. Do this by making sure the below option is checked.';

  const copyShareLinkToggle = document.createElement('input');
  copyShareLinkToggle.type = 'checkbox';
  copyShareLinkToggle.checked = getCopyShareLinkOnTrackTitleClickEnabled();
  copyShareLinkToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const copyMarkdownTrackLinkToggleRow = document.createElement('label');
  copyMarkdownTrackLinkToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const copyMarkdownTrackLinkToggleCopy = document.createElement('div');
  copyMarkdownTrackLinkToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const copyMarkdownTrackLinkToggleLabel = document.createElement('div');
  copyMarkdownTrackLinkToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  copyMarkdownTrackLinkToggleLabel.textContent = 'Copy Markdown-style link instead';

  const copyMarkdownTrackLinkToggleDesc = document.createElement('div');
  copyMarkdownTrackLinkToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:560px;';
  copyMarkdownTrackLinkToggleDesc.textContent = 'Copies a Markdown-style link by default instead of the native share link.';

  const copyMarkdownTrackLinkToggle = document.createElement('input');
  copyMarkdownTrackLinkToggle.type = 'checkbox';
  copyMarkdownTrackLinkToggle.checked = getCopyMarkdownStyleTrackLinkEnabled();
  copyMarkdownTrackLinkToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const controlsTitle = document.createElement('div');
  controlsTitle.style.cssText = 'margin-top:14px;font-size:13px;font-weight:700;color:#ffffff;';
  controlsTitle.textContent = 'Controls';

  const controlsDesc = document.createElement('div');
  controlsDesc.style.cssText = 'margin-top:6px;font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:560px;white-space:pre-line;';
  controlsDesc.textContent = 'Pressing arrow keys in the rating field will change rating by +1/-1.\nPgUp/PgDn will change rating by +5/-5.\nMouse wheel up/down when hovering an active rating field will also change rating by +5/-5.';

  const welcomeTourTitle = document.createElement('div');
  welcomeTourTitle.style.cssText = 'margin-top:18px;font-size:13px;font-weight:700;color:#ffffff;';
  welcomeTourTitle.textContent = 'Welcome tour';

  const playWelcomeTourButton = document.createElement('button');
  playWelcomeTourButton.type = 'button';
  playWelcomeTourButton.textContent = 'Play welcome tour';
  playWelcomeTourButton.style.cssText = `
    margin-top: 10px;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  `;

  const librarySyncTitle = document.createElement('div');
  librarySyncTitle.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
  librarySyncTitle.textContent = 'Library save/remove behavior';

  const librarySyncSubtitle = document.createElement('div');
  librarySyncSubtitle.style.cssText = 'margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.72);';
  librarySyncSubtitle.textContent = 'These settings react to Spotify album-library clicks on individual album pages.';

  const librarySyncToggleRow = document.createElement('label');
  librarySyncToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const librarySyncToggleCopy = document.createElement('div');
  librarySyncToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const librarySyncToggleLabel = document.createElement('div');
  librarySyncToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  librarySyncToggleLabel.textContent = 'Plan on Save to Your Library click';

  const librarySyncToggleDesc = document.createElement('div');
  librarySyncToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  librarySyncToggleDesc.textContent = `When you click Spotify's Save to Your Library button on an album page, add that album to ${APP_NAME} with status "Planned".`;

  const librarySyncToggle = document.createElement('input');
  librarySyncToggle.type = 'checkbox';
  librarySyncToggle.checked = getPlanOnSaveClickEnabled();
  librarySyncToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const libraryDeleteToggleRow = document.createElement('label');
  libraryDeleteToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;cursor:pointer;';

  const libraryDeleteToggleCopy = document.createElement('div');
  libraryDeleteToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const libraryDeleteToggleLabel = document.createElement('div');
  libraryDeleteToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  libraryDeleteToggleLabel.textContent = 'Unplan on Remove from Your Library click';

  const libraryDeleteToggleDesc = document.createElement('div');
  libraryDeleteToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  libraryDeleteToggleDesc.textContent = `When you click Spotify's Remove from Your Library button on an album page, remove that album from ${APP_NAME} if its status is "Planned".`;

  const libraryDeleteToggle = document.createElement('input');
  libraryDeleteToggle.type = 'checkbox';
  libraryDeleteToggle.checked = getAutoDeleteRemovedAlbumsEnabled();
  libraryDeleteToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const bulkLibrarySyncTitle = document.createElement('div');
  bulkLibrarySyncTitle.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
  bulkLibrarySyncTitle.textContent = 'Bulk library planning';

  const bulkLibrarySyncSubtitle = document.createElement('div');
  bulkLibrarySyncSubtitle.style.cssText = 'margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:460px;';
  bulkLibrarySyncSubtitle.textContent = `Plan your saved Spotify albums in ${APP_NAME} in bulk, either manually or through automatic catch-up triggers.`;

  const libraryBackfillRow = document.createElement('div');
  libraryBackfillRow.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:16px;';

  const libraryBackfillButton = document.createElement('button');
  libraryBackfillButton.type = 'button';
  libraryBackfillButton.textContent = 'Log all saved albums as Planned in Trackspot';
  libraryBackfillButton.style.cssText = `
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  `;

  const libraryBackfillStatus = document.createElement('div');
  libraryBackfillStatus.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:560px;white-space:pre-line;';

  const bulkSyncAutoSection = document.createElement('div');
  bulkSyncAutoSection.style.cssText = 'display:grid;gap:12px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);';

  const bulkSyncAutoTitle = document.createElement('div');
  bulkSyncAutoTitle.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  bulkSyncAutoTitle.textContent = 'Automatic bulk planning';

  const bulkSyncAutoDesc = document.createElement('div');
  bulkSyncAutoDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:460px;';
  bulkSyncAutoDesc.textContent = `These triggers run "Log all saved albums as Planned in ${APP_NAME}" for your full Spotify library.`;

  const bulkSyncStartupToggleRow = document.createElement('label');
  bulkSyncStartupToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;';
  const bulkSyncStartupToggleCopy = document.createElement('div');
  bulkSyncStartupToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const bulkSyncStartupToggleLabel = document.createElement('div');
  bulkSyncStartupToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  bulkSyncStartupToggleLabel.textContent = 'On startup';
  const bulkSyncStartupToggleDesc = document.createElement('div');
  bulkSyncStartupToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  bulkSyncStartupToggleDesc.textContent = `After Spotify starts, wait for the library API and then try to sync all saved albums into ${APP_NAME}.`;
  const bulkSyncStartupToggle = document.createElement('input');
  bulkSyncStartupToggle.type = 'checkbox';
  bulkSyncStartupToggle.checked = getBulkSyncOnStartupEnabled();
  bulkSyncStartupToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const bulkSyncNavigationToggleRow = document.createElement('label');
  bulkSyncNavigationToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;';
  const bulkSyncNavigationToggleCopy = document.createElement('div');
  bulkSyncNavigationToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const bulkSyncNavigationToggleLabel = document.createElement('div');
  bulkSyncNavigationToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  bulkSyncNavigationToggleLabel.textContent = 'On navigation mismatch';
  const bulkSyncNavigationToggleDesc = document.createElement('div');
  bulkSyncNavigationToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  bulkSyncNavigationToggleDesc.textContent = `When you navigate to a saved album that isn't in ${APP_NAME}, run the full bulk sync to catch up.`;
  const bulkSyncNavigationToggle = document.createElement('input');
  bulkSyncNavigationToggle.type = 'checkbox';
  bulkSyncNavigationToggle.checked = getBulkSyncOnNavigationEnabled();
  bulkSyncNavigationToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';

  const bulkSyncIntervalToggleRow = document.createElement('label');
  bulkSyncIntervalToggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;';
  const bulkSyncIntervalToggleCopy = document.createElement('div');
  bulkSyncIntervalToggleCopy.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const bulkSyncIntervalToggleLabel = document.createElement('div');
  bulkSyncIntervalToggleLabel.style.cssText = 'font-size:13px;font-weight:700;color:#ffffff;';
  bulkSyncIntervalToggleLabel.textContent = 'Every X hours';
  const bulkSyncIntervalToggleDesc = document.createElement('div');
  bulkSyncIntervalToggleDesc.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,0.72);max-width:420px;';
  bulkSyncIntervalToggleDesc.textContent = `Run the full bulk sync periodically as a safety net when Spotify and ${APP_NAME} drift apart.`;
  const bulkSyncIntervalToggleControls = document.createElement('div');
  bulkSyncIntervalToggleControls.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0;';
  const bulkSyncIntervalToggle = document.createElement('input');
  bulkSyncIntervalToggle.type = 'checkbox';
  bulkSyncIntervalToggle.checked = getBulkSyncIntervalEnabled();
  bulkSyncIntervalToggle.style.cssText = 'width:18px;height:18px;accent-color:#1ED760;cursor:pointer;flex-shrink:0;';
  const bulkSyncIntervalSelect = document.createElement('select');
  bulkSyncIntervalSelect.style.cssText = `
    min-width: 120px;
    padding: 8px 36px 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background-color: rgba(255,255,255,0.04);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.25L6 6.25L11 1.25' stroke='rgba(255,255,255,0.82)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    color: #ffffff;
    font-size: 13px;
    line-height: 1.2;
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
  `;
  BULK_SYNC_INTERVAL_HOURS_OPTIONS.forEach(hours => {
    const option = document.createElement('option');
    option.value = String(hours);
    option.textContent = `${hours} hour${hours === 1 ? '' : 's'}`;
    option.style.backgroundColor = '#181818';
    option.style.color = '#ffffff';
    bulkSyncIntervalSelect.appendChild(option);
  });
  bulkSyncIntervalSelect.value = String(getBulkSyncIntervalHours());

  const syncLibraryBackfillControls = (state) => {
    libraryBackfillButton.disabled = Boolean(state?.inFlight);
    libraryBackfillButton.textContent = state?.inFlight
      ? 'Planning…'
      : 'Log all saved albums as Planned in Trackspot';
    libraryBackfillStatus.textContent = getLibraryBackfillStatusText(state);
  };

  const syncBulkSyncIntervalControls = () => {
    bulkSyncIntervalToggle.checked = getBulkSyncIntervalEnabled();
    bulkSyncIntervalSelect.value = String(getBulkSyncIntervalHours());
    bulkSyncIntervalSelect.disabled = !bulkSyncIntervalToggle.checked;
    bulkSyncIntervalSelect.style.opacity = bulkSyncIntervalToggle.checked ? '1' : '0.55';
    bulkSyncIntervalSelect.style.cursor = bulkSyncIntervalToggle.checked ? 'pointer' : 'default';
  };

  let observer = null;
  let resetStatusTimeout = null;
  let unsubscribeLibraryBackfill = null;

  const cleanupModalEvents = () => {
    document.removeEventListener('keydown', handleEscape);
    observer?.disconnect();
    unsubscribeLibraryBackfill?.();
    unsubscribeLibraryBackfill = null;
    if (resetStatusTimeout) {
      clearTimeout(resetStatusTimeout);
      resetStatusTimeout = null;
    }
  };

  const renderOptions = () => {
    optionList.innerHTML = '';

    const currentStyle = getButtonStyle();

    optionList.appendChild(createStyleOptionCard({
      value: 'subtle',
      title: 'Inline',
      description: `${APP_NAME} action buttons appear among Spotify's album action buttons, to the left of "Download."`,
      currentStyle,
      onSelect: applyStyle,
    }));

    optionList.appendChild(createStyleOptionCard({
      value: 'corner',
      title: 'Floating',
      description: `Backup for if inline placement doesn't work. Appears as a floating row of buttons in the bottom-right.`,
      currentStyle,
      onSelect: applyStyle,
    }));
  };

  const applyStyle = (style) => {
    setButtonStyle(style);
    applyButtonStyle(style);
    renderOptions();
  };

  const syncServerInputs = () => {
    defaultUrlInput.value = getDefaultServerUrl();
    backupUrlInput.value = getBackupServerUrl() || '';
    workerToggle.checked = getCsvWorkerEnabled();
    playbackStopToggle.checked = getAutoStopAlbumPlaybackAtEndEnabled();
    playbackLogToggle.checked = getAutoLogAlbumAtEndEnabled();
    playbackExceptionTypeSelect.value = getAlbumEndPlaybackExceptionType();
    playbackExceptionMinutesInput.value = String(getAlbumEndPlaybackExceptionMinutes());
    copyShareLinkToggle.checked = getCopyShareLinkOnTrackTitleClickEnabled();
    copyMarkdownTrackLinkToggle.checked = getCopyMarkdownStyleTrackLinkEnabled();
    librarySyncToggle.checked = getPlanOnSaveClickEnabled();
    libraryDeleteToggle.checked = getAutoDeleteRemovedAlbumsEnabled();
    bulkSyncStartupToggle.checked = getBulkSyncOnStartupEnabled();
    bulkSyncNavigationToggle.checked = getBulkSyncOnNavigationEnabled();
    syncBulkSyncIntervalControls();
  };

  closeButton.addEventListener('click', removeStyleModal);
  closeButton.addEventListener('mouseenter', () => {
    closeButtonIcon.style.background = 'rgba(255,255,255,0.14)';
    closeButton.style.color = '#ffffff';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButtonIcon.style.background = 'rgba(255,255,255,0.08)';
    closeButton.style.color = 'rgba(255,255,255,0.82)';
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) removeStyleModal();
  });
  modal.addEventListener('click', (event) => event.stopPropagation());

  const handleEscape = (event) => {
    if (event.key === 'Escape') {
      removeStyleModal();
    }
  };

  observer = new MutationObserver(() => {
    if (!document.getElementById(STYLE_MODAL_ID)) {
      cleanupModalEvents();
    }
  });
  observer.observe(document.body, { childList: true });
  document.addEventListener('keydown', handleEscape);
  unsubscribeLibraryBackfill = subscribeLibraryBackfillUiState(syncLibraryBackfillControls);

  defaultUrlInput.addEventListener('change', () => {
    setDefaultServerUrl(defaultUrlInput.value);
    syncServerInputs();
    hydrateStoredAlbumIndexState();
    refreshAlbumIndex();
  });
  defaultUrlInput.addEventListener('blur', syncServerInputs);

  backupUrlInput.addEventListener('change', () => {
    setBackupServerUrl(backupUrlInput.value);
    syncServerInputs();
    hydrateStoredAlbumIndexState();
    refreshAlbumIndex();
  });
  backupUrlInput.addEventListener('blur', syncServerInputs);

  workerToggle.addEventListener('change', () => {
    setCsvWorkerEnabled(workerToggle.checked);
    if (workerToggle.checked) {
      restartCsvWorkerLoop();
    } else {
      stopCsvWorkerLoop();
    }
  });

  playbackStopToggle.addEventListener('change', () => {
    setAutoStopAlbumPlaybackAtEndEnabled(playbackStopToggle.checked);
    syncAlbumPlaybackStopMonitor();
  });

  playbackLogToggle.addEventListener('change', () => {
    setAutoLogAlbumAtEndEnabled(playbackLogToggle.checked);
    syncAlbumPlaybackStopMonitor();
  });

  playbackExceptionTypeSelect.addEventListener('change', () => {
    setAlbumEndPlaybackExceptionType(playbackExceptionTypeSelect.value);
    playbackExceptionTypeSelect.value = getAlbumEndPlaybackExceptionType();
    syncAlbumPlaybackStopMonitor();
  });

  playbackExceptionMinutesInput.addEventListener('input', () => {
    const digitsOnly = playbackExceptionMinutesInput.value.replace(/[^\d]/g, '');
    if (digitsOnly !== playbackExceptionMinutesInput.value) {
      playbackExceptionMinutesInput.value = digitsOnly;
    }
  });

  playbackExceptionMinutesInput.addEventListener('change', () => {
    setAlbumEndPlaybackExceptionMinutes(playbackExceptionMinutesInput.value);
    playbackExceptionMinutesInput.value = String(getAlbumEndPlaybackExceptionMinutes());
    syncAlbumPlaybackStopMonitor();
  });
  playbackExceptionMinutesInput.addEventListener('blur', () => {
    playbackExceptionMinutesInput.value = String(getAlbumEndPlaybackExceptionMinutes());
  });

  copyShareLinkToggle.addEventListener('change', () => {
    setCopyShareLinkOnTrackTitleClickEnabled(copyShareLinkToggle.checked);
    syncTrackLinkCopyTitleUi();
  });

  copyMarkdownTrackLinkToggle.addEventListener('change', () => {
    setCopyMarkdownStyleTrackLinkEnabled(copyMarkdownTrackLinkToggle.checked);
  });

  librarySyncToggle.addEventListener('change', () => {
    setPlanOnSaveClickEnabled(librarySyncToggle.checked);
  });

  libraryDeleteToggle.addEventListener('change', () => {
    setAutoDeleteRemovedAlbumsEnabled(libraryDeleteToggle.checked);
  });

  bulkSyncStartupToggle.addEventListener('change', () => {
    setBulkSyncOnStartupEnabled(bulkSyncStartupToggle.checked);
  });

  bulkSyncNavigationToggle.addEventListener('change', () => {
    setBulkSyncOnNavigationEnabled(bulkSyncNavigationToggle.checked);
  });

  bulkSyncIntervalToggle.addEventListener('change', () => {
    setBulkSyncIntervalEnabled(bulkSyncIntervalToggle.checked);
    syncBulkSyncIntervalControls();
    restartBulkSyncIntervalLoop();
  });

  bulkSyncIntervalSelect.addEventListener('change', () => {
    setBulkSyncIntervalHours(Number(bulkSyncIntervalSelect.value));
    syncBulkSyncIntervalControls();
    restartBulkSyncIntervalLoop();
  });

  libraryBackfillButton.addEventListener('click', async () => {
    if (libraryBackfillInFlight) return;

    const confirmed = await openConfirmModal({
      title: `Plan all saved albums in ${APP_NAME}?`,
      message: `This will scan your saved Spotify albums oldest-first and create planned entries in ${APP_NAME} for anything that isn't already there.\n\nAlbums already in ${APP_NAME} will be skipped.`,
      confirmLabel: 'Plan saved albums',
    });
    if (!confirmed) return;

    await maybeRunBulkLibrarySync('manual', {
      notifyErrors: true,
      notifyOnSuccess: true,
      notifyOnNoOp: true,
    });
  });

  resetButton.addEventListener('click', () => {
    resetSettings();
    applyButtonStyle(getButtonStyle());
    renderOptions();
    syncServerInputs();
    syncTrackLinkCopyTitleUi();
    workerToggle.checked = getCsvWorkerEnabled();
    syncAlbumPlaybackStopMonitor();
    restartCsvWorkerLoop();
    restartBulkSyncIntervalLoop();
    hydrateStoredAlbumIndexState();
    refreshAlbumIndex();
    resetStatus.style.opacity = '1';
    if (resetStatusTimeout) {
      clearTimeout(resetStatusTimeout);
    }
    resetStatusTimeout = setTimeout(() => {
      resetStatus.style.opacity = '0';
      resetStatusTimeout = null;
    }, RESET_STATUS_TIMEOUT_MS);
  });

  playWelcomeTourButton.addEventListener('click', () => {
    removeStyleModal();
    void openWelcomeTour();
  });

  header.appendChild(title);
  closeButton.appendChild(closeButtonIcon);
  header.appendChild(closeButton);
  renderOptions();
  syncServerInputs();

  serverSettings.appendChild(serverTitle);
  serverSettings.appendChild(serverSubtitle);
  serverSettings.appendChild(defaultUrlLabel);
  serverSettings.appendChild(defaultUrlInput);
  serverSettings.appendChild(backupUrlLabel);
  serverSettings.appendChild(backupUrlInput);
  resetRow.appendChild(resetButton);
  resetRow.appendChild(resetStatus);
  serverSettings.appendChild(resetRow);

  workerToggleCopy.appendChild(workerToggleLabel);
  workerToggleCopy.appendChild(workerToggleDesc);
  workerToggleRow.appendChild(workerToggleCopy);
  workerToggleRow.appendChild(workerToggle);
  workerSettings.appendChild(workerTitle);
  workerSettings.appendChild(workerSubtitle);
  workerSettings.appendChild(workerToggleRow);
  playbackStopToggleCopy.appendChild(playbackStopToggleLabel);
  playbackStopToggleCopy.appendChild(playbackStopToggleDesc);
  playbackStopToggleRow.appendChild(playbackStopToggleCopy);
  playbackStopToggleRow.appendChild(playbackStopToggle);
  playbackLogToggleCopy.appendChild(playbackLogToggleLabel);
  playbackLogToggleCopy.appendChild(playbackLogToggleDesc);
  playbackLogToggleRow.appendChild(playbackLogToggleCopy);
  playbackLogToggleRow.appendChild(playbackLogToggle);
  playbackExceptionControls.appendChild(playbackExceptionTypeSelect);
  playbackExceptionControls.appendChild(playbackExceptionUnderText);
  playbackExceptionControls.appendChild(playbackExceptionMinutesInput);
  playbackExceptionControls.appendChild(playbackExceptionMinutesText);
  playbackExceptionSettings.appendChild(playbackExceptionTitle);
  playbackExceptionSettings.appendChild(playbackExceptionDesc);
  playbackExceptionSettings.appendChild(playbackExceptionControls);
  playbackSettings.appendChild(playbackTitle);
  playbackSettings.appendChild(playbackSubtitle);
  playbackSettings.appendChild(playbackStopToggleRow);
  playbackSettings.appendChild(playbackLogToggleRow);
  playbackSettings.appendChild(playbackExceptionSettings);
  librarySyncToggleCopy.appendChild(librarySyncToggleLabel);
  librarySyncToggleCopy.appendChild(librarySyncToggleDesc);
  librarySyncToggleRow.appendChild(librarySyncToggleCopy);
  librarySyncToggleRow.appendChild(librarySyncToggle);
  libraryDeleteToggleCopy.appendChild(libraryDeleteToggleLabel);
  libraryDeleteToggleCopy.appendChild(libraryDeleteToggleDesc);
  libraryDeleteToggleRow.appendChild(libraryDeleteToggleCopy);
  libraryDeleteToggleRow.appendChild(libraryDeleteToggle);
  libraryBackfillRow.appendChild(libraryBackfillButton);
  libraryBackfillRow.appendChild(libraryBackfillStatus);
  bulkSyncStartupToggleCopy.appendChild(bulkSyncStartupToggleLabel);
  bulkSyncStartupToggleCopy.appendChild(bulkSyncStartupToggleDesc);
  bulkSyncStartupToggleRow.appendChild(bulkSyncStartupToggleCopy);
  bulkSyncStartupToggleRow.appendChild(bulkSyncStartupToggle);
  bulkSyncNavigationToggleCopy.appendChild(bulkSyncNavigationToggleLabel);
  bulkSyncNavigationToggleCopy.appendChild(bulkSyncNavigationToggleDesc);
  bulkSyncNavigationToggleRow.appendChild(bulkSyncNavigationToggleCopy);
  bulkSyncNavigationToggleRow.appendChild(bulkSyncNavigationToggle);
  bulkSyncIntervalToggleCopy.appendChild(bulkSyncIntervalToggleLabel);
  bulkSyncIntervalToggleCopy.appendChild(bulkSyncIntervalToggleDesc);
  bulkSyncIntervalToggleControls.appendChild(bulkSyncIntervalToggle);
  bulkSyncIntervalToggleControls.appendChild(bulkSyncIntervalSelect);
  bulkSyncIntervalToggleRow.appendChild(bulkSyncIntervalToggleCopy);
  bulkSyncIntervalToggleRow.appendChild(bulkSyncIntervalToggleControls);
  bulkSyncAutoSection.appendChild(bulkSyncAutoTitle);
  bulkSyncAutoSection.appendChild(bulkSyncAutoDesc);
  bulkSyncAutoSection.appendChild(bulkSyncStartupToggleRow);
  bulkSyncAutoSection.appendChild(bulkSyncNavigationToggleRow);
  bulkSyncAutoSection.appendChild(bulkSyncIntervalToggleRow);
  libraryActionSettings.appendChild(librarySyncTitle);
  libraryActionSettings.appendChild(librarySyncSubtitle);
  libraryActionSettings.appendChild(librarySyncToggleRow);
  libraryActionSettings.appendChild(libraryDeleteToggleRow);
  bulkLibrarySyncSettings.appendChild(bulkLibrarySyncTitle);
  bulkLibrarySyncSettings.appendChild(bulkLibrarySyncSubtitle);
  bulkLibrarySyncSettings.appendChild(libraryBackfillRow);
  bulkLibrarySyncSettings.appendChild(bulkSyncAutoSection);
  miscSettings.appendChild(miscTitle);
  miscSettings.appendChild(welcomeTourTitle);
  miscSettings.appendChild(playWelcomeTourButton);
  copyShareLinkToggleCopy.appendChild(copyShareLinkToggleLabel);
  copyShareLinkToggleCopy.appendChild(copyShareLinkToggleDesc);
  copyShareLinkToggleRow.appendChild(copyShareLinkToggleCopy);
  copyShareLinkToggleRow.appendChild(copyShareLinkToggle);
  miscSettings.appendChild(copyShareLinkToggleRow);
  copyMarkdownTrackLinkToggleCopy.appendChild(copyMarkdownTrackLinkToggleLabel);
  copyMarkdownTrackLinkToggleCopy.appendChild(copyMarkdownTrackLinkToggleDesc);
  copyMarkdownTrackLinkToggleRow.appendChild(copyMarkdownTrackLinkToggleCopy);
  copyMarkdownTrackLinkToggleRow.appendChild(copyMarkdownTrackLinkToggle);
  miscSettings.appendChild(copyMarkdownTrackLinkToggleRow);
  miscSettings.appendChild(controlsTitle);
  miscSettings.appendChild(controlsDesc);

  contentBody.appendChild(subtitle);
  contentBody.appendChild(optionList);
  contentBody.appendChild(serverSettings);
  contentBody.appendChild(playbackSettings);
  contentBody.appendChild(libraryActionSettings);
  contentBody.appendChild(bulkLibrarySyncSettings);
  contentBody.appendChild(workerSettings);
  contentBody.appendChild(miscSettings);
  modal.appendChild(header);
  modal.appendChild(contentBody);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ===========================================================================
// STYLE MANAGER
// ===========================================================================

function applyButtonStyle(style) {
  resetInlineFallbackFlagIfNeeded();

  if (style === 'corner') {
    clearInlineInsertionRetry();
    removeSubtleButtons();
    stopSubtleObserver();
    if (!cornerActionGroup) {
      cornerActionGroup = createCornerActionGroup();
    }
    cornerActionGroup.style.display = currentAlbumUri ? 'flex' : 'none';
    renderActionButtons();
  } else {
    // 'subtle'
    if (cornerActionGroup) cornerActionGroup.style.display = 'none';
    const injected = injectSubtleButtons();
    if (!injected && currentAlbumUri) {
      scheduleInlineInsertionRetry('Spotify never exposed a stable album action-bar slot');
    }
    startSubtleObserver();
    renderActionButtons();
  }
}

// ===========================================================================
// NAVIGATION LISTENER
// ===========================================================================

let stopHistoryListener = null;

function registerHistoryListener() {
  stopHistoryListener?.();
  stopHistoryListener = SpicetifyApi.Platform.History.listen(onNavigate);
}

function onNavigate(location) {
  const previousAlbumUri = currentAlbumUri;
  const match = location?.pathname?.match(/^\/album\/([A-Za-z0-9]+)/);
  const nextAlbumUri = match ? `spotify:album:${match[1]}` : null;
  hideTrackspotTooltips({ destroyDetached: true });
  albumNavigationToken += 1;
  handleLogModalNavigation(nextAlbumUri, previousAlbumUri);
  currentAlbumUri = nextAlbumUri;
  renderActionButtons();
  if (currentAlbumUri) {
    void maybeTriggerNavigationBulkSync(albumNavigationToken);
  }

  if (getButtonStyle() === 'subtle') {
    if (currentAlbumUri) {
      clearInlineInsertionRetry();
      setTimeout(() => {
        if (getButtonStyle() !== 'subtle' || !currentAlbumUri) return;
        if (!injectSubtleButtons()) {
          scheduleInlineInsertionRetry('Trackspot could not confirm that the inline button was inserted');
        }
      }, 500);
    } else {
      clearInlineInsertionRetry();
      removeSubtleButtons();
    }
  } else if (cornerActionGroup) {
    clearInlineInsertionRetry();
    cornerActionGroup.style.display = currentAlbumUri ? 'flex' : 'none';
  }
}

// ===========================================================================
// ALBUM PLAYBACK STOP MONITOR
// ===========================================================================

function clearAlbumPlaybackStopTimer() {
  if (albumPlaybackStopTimeoutId !== null) {
    clearTimeout(albumPlaybackStopTimeoutId);
    albumPlaybackStopTimeoutId = null;
  }
  albumPlaybackStopTargetAtMs = null;
  albumPlaybackStopSignature = null;
}

function hasAlbumEndPlaybackActionEnabled() {
  return getAutoStopAlbumPlaybackAtEndEnabled() || getAutoLogAlbumAtEndEnabled();
}

function syncSuppressedAlbumEndActionSignature({
  signature,
  suppressedSignature,
  remainingMs,
}) {
  if (suppressedSignature && suppressedSignature !== signature) {
    return null;
  }

  if (shouldSuppressRepeatedAlbumPlaybackStop({
    signature,
    suppressedSignature,
    remainingMs,
  })) {
    return suppressedSignature;
  }

  return suppressedSignature === signature ? null : suppressedSignature;
}

async function maybeAutoOpenLogModalAtAlbumEnd(signature, albumUri) {
  const playerState = SpicetifyApi.Player?.data;
  const liveTrack = getPlayerStateTrack(playerState);
  const liveAlbumUri = liveTrack?.metadata?.album_uri ?? playerState?.context_uri ?? null;

  if (
    !getAutoLogAlbumAtEndEnabled() ||
    !signature ||
    !albumUri ||
    playerState?.is_paused ||
    buildAlbumPlaybackStopSignature(playerState) !== signature ||
    !shouldStopAlbumPlaybackAtEnd(playerState) ||
    liveAlbumUri !== albumUri
  ) {
    return;
  }

  albumPlaybackAutoLogSuppressedSignature = signature;

  try {
    await openLogFlowForAlbum(albumUri, { silentConnectionFailures: true });
  } catch (error) {
    SpicetifyApi.showNotification(
      `Couldn't auto-open the ${APP_NAME} log modal: ${error.message}`,
      true,
      3200
    );
  }
}

function pauseAlbumPlaybackAtEnd(expectedSignature) {
  const playerState = SpicetifyApi.Player?.data;
  if (
    !getAutoStopAlbumPlaybackAtEndEnabled() ||
    !expectedSignature ||
    buildAlbumPlaybackStopSignature(playerState) !== expectedSignature ||
    !shouldStopAlbumPlaybackAtEnd(playerState)
  ) {
    clearAlbumPlaybackStopTimer();
    return;
  }

  clearAlbumPlaybackStopTimer();
  albumPlaybackStopSuppressedSignature = expectedSignature;

  if (typeof SpicetifyApi.Player?.pause === 'function') {
    SpicetifyApi.Player.pause();
    return;
  }

  void SpicetifyApi.Platform?.PlayerAPI?.pause?.();
}

function triggerAlbumPlaybackEndActions(signature, albumUri) {
  if (!signature || !albumUri) return;

  if (getAutoLogAlbumAtEndEnabled()) {
    void maybeAutoOpenLogModalAtAlbumEnd(signature, albumUri);
  }

  if (getAutoStopAlbumPlaybackAtEndEnabled()) {
    pauseAlbumPlaybackAtEnd(signature);
  } else {
    clearAlbumPlaybackStopTimer();
  }
}

function syncAlbumPlaybackStopMonitor() {
  if (!hasAlbumEndPlaybackActionEnabled()) {
    clearAlbumPlaybackStopTimer();
    albumPlaybackStopSuppressedSignature = null;
    albumPlaybackAutoLogSuppressedSignature = null;
    return;
  }

  const playerState = SpicetifyApi.Player?.data;
  if (!playerState || playerState.is_paused || !shouldStopAlbumPlaybackAtEnd(playerState)) {
    clearAlbumPlaybackStopTimer();
    return;
  }

  const signature = buildAlbumPlaybackStopSignature(playerState);
  const durationMs = Number(playerState.duration);
  const progressMs = getPlayerProgressMs(playerState);
  if (!signature || !Number.isFinite(durationMs) || durationMs <= 0) {
    clearAlbumPlaybackStopTimer();
    return;
  }

  const remainingMs = Math.max(0, durationMs - progressMs);
  const track = getPlayerStateTrack(playerState);
  const albumUri = track?.metadata?.album_uri ?? playerState?.context_uri ?? null;

  albumPlaybackStopSuppressedSignature = syncSuppressedAlbumEndActionSignature({
    signature,
    suppressedSignature: albumPlaybackStopSuppressedSignature,
    remainingMs,
  });
  albumPlaybackAutoLogSuppressedSignature = syncSuppressedAlbumEndActionSignature({
    signature,
    suppressedSignature: albumPlaybackAutoLogSuppressedSignature,
    remainingMs,
  });

  const isStopActionSuppressed =
    !getAutoStopAlbumPlaybackAtEndEnabled()
    || albumPlaybackStopSuppressedSignature === signature;
  const isLogActionSuppressed =
    !getAutoLogAlbumAtEndEnabled()
    || albumPlaybackAutoLogSuppressedSignature === signature;

  if (isStopActionSuppressed && isLogActionSuppressed) {
    clearAlbumPlaybackStopTimer();
    return;
  }

  if (remainingMs <= ALBUM_PLAYBACK_STOP_LEAD_MS) {
    triggerAlbumPlaybackEndActions(signature, albumUri);
    return;
  }

  const desiredTargetAtMs = Date.now() + remainingMs - ALBUM_PLAYBACK_STOP_LEAD_MS;
  const shouldReschedule =
    albumPlaybackStopSignature !== signature ||
    albumPlaybackStopTargetAtMs === null ||
    Math.abs(desiredTargetAtMs - albumPlaybackStopTargetAtMs) > ALBUM_PLAYBACK_STOP_RESCHEDULE_TOLERANCE_MS;

  if (!shouldReschedule) return;

  clearAlbumPlaybackStopTimer();
  albumPlaybackStopSignature = signature;
  albumPlaybackStopTargetAtMs = desiredTargetAtMs;
  albumPlaybackStopTimeoutId = setTimeout(() => {
    albumPlaybackStopTimeoutId = null;
    syncAlbumPlaybackStopMonitor();
  }, Math.max(0, desiredTargetAtMs - Date.now()));
}

function registerAlbumPlaybackStopListeners() {
  if (hasAlbumPlaybackStopListeners || !SpicetifyApi.Player?.addEventListener) {
    return;
  }

  SpicetifyApi.Player.addEventListener('songchange', syncAlbumPlaybackStopMonitor);
  SpicetifyApi.Player.addEventListener('onplaypause', syncAlbumPlaybackStopMonitor);
  SpicetifyApi.Player.addEventListener('onprogress', syncAlbumPlaybackStopMonitor);
  hasAlbumPlaybackStopListeners = true;
  syncAlbumPlaybackStopMonitor();
}

// ===========================================================================
// MAIN — synchronous poll loop, mirrors pattern used by working extensions
// ===========================================================================

let initCount = 0;

function isSpicetifyReadyForInit(spicetifyApi = SpicetifyApi) {
  return Boolean(
    spicetifyApi?.Platform &&
    spicetifyApi?.Player?.addEventListener &&
    spicetifyApi?.Menu?.Item &&
    spicetifyApi?.SVGIcons &&
    spicetifyApi?.GraphQL?.Request &&
    spicetifyApi?.GraphQL?.Definitions?.getAlbum
  );
}

function init() {
  if (!isSpicetifyReadyForInit()) {
    if (initCount < 200) {
      initCount++;
      setTimeout(init, 300);
    } else {
      console.error('[Trackspot] Timed out waiting for Spicetify.');
    }
    return;
  }

  // ── Menu registration ─────────────────────────────────────────────────────

  const current = getButtonStyle();

  SpicetifyApi.SVGIcons[MENU_ICON_NAME] = MENU_ICON_SVG;
  new SpicetifyApi.Menu.Item(MENU_LABEL, false, openStyleModal, MENU_ICON_NAME).register();
  console.log('[Trackspot] Profile menu registered.');

  // ── Button setup ──────────────────────────────────────────────────────────

  hydrateStoredAlbumIndexState();
  applyButtonStyle(current);
  ensureTrackLinkCopyHoverStyle();
  ensureTrackLinkCopyPopupStyle();
  syncTrackLinkCopyTitleUi();
  renderActionButtons();
  refreshAlbumIndex();
  restartAlbumIndexRefreshLoop();
  restartBulkSyncIntervalLoop();
  scheduleStartupBulkSync();
  registerAlbumPlaybackStopListeners();

  // ── Navigation ────────────────────────────────────────────────────────────

  registerHistoryListener();
  registerTooltipCleanupListeners();
  const initial = SpicetifyApi.Platform.History.location;
  if (initial) onNavigate(initial);
  if (!hasDocumentClickListener) {
    document.addEventListener('click', handleDocumentClick, true);
    hasDocumentClickListener = true;
  }
  window.addEventListener('focus', () => {
    refreshAlbumIndex();
  });
  restartCsvWorkerLoop();
  maybeAutoOpenWelcomeTour();

  console.log('[Trackspot] Extension loaded. Button style:', current);
}

if (!globalThis.__TRACKSPOT_DISABLE_AUTO_INIT) {
  init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports.__private = {
    buildServerConnectError,
    captureLogModalDraftValues,
    clearLogModalDraftForAlbum,
    collectTrackUriCandidateElements,
    createAlbumIndexCacheStorageKey,
    createTrackUriFromId,
    createEmptyAlbumIndexState,
    deepSearchForTrackUri,
    deriveAlbumUiState,
    deriveIndexedAlbumUiState,
    ensureTrackLinkCopyHoverStyle,
    ensureTrackLinkCopyPopupStyle,
    extractShareUrlFromTrackUri,
    extractTrackId,
    extractTrackUri,
    formatCopiedTrackLinkText,
    fetchAlbumData,
    extractAlbumEndPlaybackExceptionInfoFromGraphql,
    getCopyMarkdownStyleTrackLinkEnabled,
    getLogModalDraftForAlbum,
    getLogModalHorizontalOffsetCss,
    getLibraryBackfillStatusText,
    getCsvWorkerId,
    getAlbumEndPlaybackExceptionAlbumUri,
    getActionTooltip,
    getActionBehavior,
    hideTrackspotTooltips,
    cleanupTrackspotTooltipHost,
    attachTooltip,
    getAutoSyncConnectionErrorMessage,
    getHasSeenWelcomeTour,
    getButtonVisualState,
    getLogModalDefaults,
    handleLogModalNavigation,
    getServerUrlFromRequestUrl,
    isSpicetifyReadyForInit,
    isConnectionFailureError,
    isAlbumSavedInLibraryFromGraphql,
    mergeLogModalDraftValues,
    maybeCopyTrackShareLinkFromClick,
    localDateISOFromTimestamp,
    notifyCsvJobStarted,
    notifyCsvJobTerminal,
    openLogModal,
    normalizeAlbumIndexPayload,
    processCsvImportRow,
    resolveTrackUriFromElement,
    resolveAlbumIndexFromServers,
    removeLogModal,
    requestAlbumEndPlaybackExceptionInfo,
    sanitizeMarkdownLinkText,
    showTrackLinkCopyPopup,
    shouldSuppressAlbumEndPlaybackActions,
    shouldSuppressRepeatedAlbumPlaybackStop,
    shouldStopAlbumPlaybackAtEnd,
    shouldAutoDeleteRemovedAlbum,
    shouldAutoPlanLibraryAlbum,
    shouldTriggerNavigationBulkSync,
    syncTrackLinkCopyTitleUi,
    updateLogModalDraftForAlbum,
    todayLocalISO,
  };
}

function getLogModalDraftForAlbum(albumUri) {
  if (!albumUri || logModalDraftState?.albumUri !== albumUri) {
    return null;
  }

  return { ...logModalDraftState.values };
}

function mergeLogModalDraftValues(defaults, draftValues) {
  if (!draftValues) {
    return { ...defaults };
  }

  return {
    ...defaults,
    ...draftValues,
  };
}

function captureLogModalDraftValues(refs) {
  return {
    status: refs.statusInput.value || 'completed',
    repeats: refs.repeatsInput.value,
    planned_at: refs.plannedDateInput.value || '',
    listened_at: refs.dateInput.value || '',
    rating: refs.ratingInput.value,
    notes: refs.notesInput.value,
  };
}

function updateLogModalDraftForAlbum(albumUri, refs) {
  if (!albumUri || !refs) return;
  logModalDraftState = {
    albumUri,
    values: captureLogModalDraftValues(refs),
  };
}

function clearLogModalDraftForAlbum(albumUri) {
  if (!albumUri || logModalDraftState?.albumUri === albumUri) {
    logModalDraftState = null;
  }
}

function getLogModalHorizontalOffsetCss() {
  return `translateX(min(${LOG_MODAL_HORIZONTAL_OFFSET_VW}vw, ${LOG_MODAL_HORIZONTAL_OFFSET_MAX_PX}px))`;
}
})();
