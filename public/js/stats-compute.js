// =============================================================================
// Stats/Wrapped computation. Port of the design's stats.js as an ES module.
// Various Artists is excluded from all artist rankings.
// =============================================================================

const MS_DAY = 86400000;
const EXCLUDED_ARTISTS = new Set(['Various Artists']);
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n) { return String(n).padStart(2, '0'); }
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

export function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const dateOnly = raw.match(DATE_ONLY_RE);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(+year, +month - 1, +day);
  }

  const normalized = raw.includes(' ') && !raw.includes('T')
    ? raw.replace(' ', 'T')
    : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareDatesAsc(a, b) {
  const left = parseDateValue(a)?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = parseDateValue(b)?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right;
}

function compareDatesDesc(a, b) {
  return compareDatesAsc(b, a);
}

function compareTextAsc(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function compareTextDesc(a, b) {
  return compareTextAsc(b, a);
}

function compareAlbumTitlesAsc(a, b) {
  return compareTextAsc(a?.album_name, b?.album_name)
    || compareDatesAsc(a?.created_at, b?.created_at)
    || ((Number(a?.id) || 0) - (Number(b?.id) || 0));
}

function compareAlbumTitlesDesc(a, b) {
  return compareTextDesc(a?.album_name, b?.album_name)
    || compareDatesDesc(a?.created_at, b?.created_at)
    || ((Number(b?.id) || 0) - (Number(a?.id) || 0));
}

function getComparableDuration(album) {
  const value = Number(album?.duration_ms);
  return Number.isFinite(value) ? value : null;
}

function compareAlbumsByDurationThenTitle(a, b, {
  preferLonger = true,
  titleDirection = 'asc',
} = {}) {
  const leftDuration = getComparableDuration(a);
  const rightDuration = getComparableDuration(b);
  if (leftDuration != null && rightDuration != null && leftDuration !== rightDuration) {
    return preferLonger
      ? rightDuration - leftDuration
      : leftDuration - rightDuration;
  }
  return titleDirection === 'desc'
    ? compareAlbumTitlesDesc(a, b)
    : compareAlbumTitlesAsc(a, b);
}

function compareAlbumsByRating(a, b, { direction = 'desc' } = {}) {
  const ratingDiff = direction === 'asc'
    ? ((a?.rating ?? Number.POSITIVE_INFINITY) - (b?.rating ?? Number.POSITIVE_INFINITY))
    : ((b?.rating ?? Number.NEGATIVE_INFINITY) - (a?.rating ?? Number.NEGATIVE_INFINITY));

  return ratingDiff || compareAlbumsByDurationThenTitle(a, b, {
    preferLonger: direction !== 'asc',
    titleDirection: direction === 'asc' ? 'desc' : 'asc',
  });
}

function getAlbumNoteText(album) {
  if (!album?.notes) return '';
  return String(album.notes).trim();
}

function compareNoteEntriesByLengthRatingAndTitle(a, b) {
  return (b.text.length - a.text.length)
    || ((b.album.rating ?? Number.NEGATIVE_INFINITY) - (a.album.rating ?? Number.NEGATIVE_INFINITY))
    || compareAlbumTitlesAsc(a.album, b.album);
}

function getSpotifyReleaseDateInfo(album) {
  const date = album?.spotify_release_date;
  const precision = String(date?.precision ?? '').toUpperCase();
  const isoString = String(date?.isoString ?? '');
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    precision,
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
    usable: precision === 'DAY' || precision === 'MONTH',
    isSuspiciousJanFirst: precision === 'DAY' && month === '01' && day === '01',
  };
}

function compareSpotifyReleaseInfo(a, b, direction = 'oldest') {
  const diff = (a.year - b.year) || (a.month - b.month) || (a.day - b.day);
  return direction === 'newest' ? -diff : diff;
}

function resolveReleaseYearTie(albums, direction = 'oldest') {
  if (!albums.length) return null;

  let candidates = albums.slice();
  const candidatesWithReleaseDate = candidates.filter(album => album?.spotify_release_date);
  if (candidatesWithReleaseDate.length) candidates = candidatesWithReleaseDate;

  const usableCandidates = candidates
    .map(album => ({ album, releaseInfo: getSpotifyReleaseDateInfo(album) }))
    .filter(candidate => candidate.releaseInfo?.usable);

  const hasNonJanFirstUsableCandidate = usableCandidates
    .some(candidate => !candidate.releaseInfo.isSuspiciousJanFirst);

  const trustedCandidates = usableCandidates.filter(candidate => !(
    hasNonJanFirstUsableCandidate && candidate.releaseInfo.isSuspiciousJanFirst
  ));

  if (trustedCandidates.length) {
    return trustedCandidates.slice()
      .sort((left, right) =>
        compareSpotifyReleaseInfo(left.releaseInfo, right.releaseInfo, direction)
        || compareAlbumTitlesAsc(left.album, right.album))[0]?.album ?? null;
  }

  return candidates.slice().sort(compareAlbumTitlesAsc)[0] ?? null;
}

function getDateKey(value) {
  if (!value) return '';
  if (value instanceof Date) return isoDate(value);
  return String(value).trim().slice(0, 10);
}

function getDateYear(value) {
  const key = getDateKey(value);
  return DATE_ONLY_RE.test(key) ? Number.parseInt(key.slice(0, 4), 10) : null;
}

function getDateMonthIndex(value) {
  const key = getDateKey(value);
  return DATE_ONLY_RE.test(key) ? Number.parseInt(key.slice(5, 7), 10) - 1 : null;
}

function diffCalendarDays(start, end) {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (!startDate || !endDate) return null;
  return Math.round((endDate - startDate) / MS_DAY);
}

function getArtistName(album) {
  if (album.artist_name) return album.artist_name;
  if (Array.isArray(album.artist_names) && album.artist_names.length) return album.artist_names[0];
  if (Array.isArray(album.artists) && album.artists.length) {
    const a = album.artists[0];
    return typeof a === 'string' ? a : (a && a.name) || '';
  }
  return '';
}

function getPrimaryArtist(album) {
  if (!Array.isArray(album?.artists) || album.artists.length === 0) return null;

  const primaryName = getArtistName(album);
  const matched = album.artists.find(artist =>
    artist && typeof artist === 'object' && artist.name === primaryName,
  );

  if (matched && typeof matched === 'object') return matched;

  const firstObjectArtist = album.artists.find(artist => artist && typeof artist === 'object');
  return firstObjectArtist || null;
}

// Normalize album to the shape the stats code expects (reads artist_name).
export function normalizeAlbumForStats(album) {
  return { ...album, artist_name: getArtistName(album) };
}

export function normalizeAlbumsForStats(albums) {
  return Array.isArray(albums) ? albums.map(normalizeAlbumForStats) : [];
}

export function computeStats(rawAlbums, today = new Date()) {
  const albums = normalizeAlbumsForStats(rawAlbums);
  const planned   = albums.filter(a => a.status === 'planned');
  const completed = albums.filter(a => a.status === 'completed');
  const dropped   = albums.filter(a => a.status === 'dropped');
  const todayDate = parseDateValue(today) ?? new Date();

  const cutoff30 = new Date(todayDate.getTime() - 30 * MS_DAY);
  const cutoff90 = new Date(todayDate.getTime() - 90 * MS_DAY);
  const rate30 = completed.filter(a => {
    const listenedAt = parseDateValue(a.listened_at);
    return listenedAt && listenedAt >= cutoff30;
  }).length / 30;
  const rate90 = completed.filter(a => {
    const listenedAt = parseDateValue(a.listened_at);
    return listenedAt && listenedAt >= cutoff90;
  }).length / 90;

  const monthlyMap = {};
  completed.forEach(a => {
    if (!a.listened_at) return;
    const k = a.listened_at.slice(0, 7);
    monthlyMap[k] = (monthlyMap[k] || 0) + 1;
  });
  const sortedMonthKeys = Object.keys(monthlyMap).sort();
  const monthly = [];
  if (sortedMonthKeys.length) {
    const [startYear, startMonth] = sortedMonthKeys[0].split('-').map(part => Number.parseInt(part, 10));
    const cur = new Date(startYear, startMonth - 1, 1);
    const todayMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1);
    while (cur < todayMonthEnd) {
      const k = monthKey(cur);
      monthly.push({ month: k, count: monthlyMap[k] || 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  const dailyMap = {};
  completed.forEach(a => {
    if (!a.listened_at) return;
    const key = a.listened_at.slice(0, 10);
    dailyMap[key] = (dailyMap[key] || 0) + 1;
  });

  const ratingsList = completed.map(a => a.rating).filter(r => r != null);
  const allMult10 = ratingsList.length > 0 && ratingsList.every(r => r % 10 === 0);
  const ratingStep = allMult10 ? 10 : 5;
  const numBuckets = allMult10 ? 11 : 21;
  const ratingBuckets = Array.from({ length: numBuckets }, () => 0);
  const ratingBucketLabels = Array.from({ length: numBuckets }, (_, i) =>
    i === numBuckets - 1 ? 100 : i * ratingStep);
  completed.forEach(a => {
    if (a.rating == null) return;
    const idx = a.rating === 100 ? numBuckets - 1 : Math.floor(a.rating / ratingStep);
    ratingBuckets[Math.min(numBuckets - 1, Math.max(0, idx))]++;
  });
  const avgRating = ratingsList.length
    ? ratingsList.reduce((a, b) => a + b, 0) / ratingsList.length : 0;

  const topRated = completed.filter(a => a.rating != null).slice()
    .sort((a, b) => compareAlbumsByRating(a, b, { direction: 'desc' }));

  const decadeMap = {};
  albums.forEach(a => {
    if (!a.release_year) return;
    const d = Math.floor(a.release_year / 10) * 10;
    decadeMap[d] = decadeMap[d] || { planned: 0, completed: 0, dropped: 0 };
    decadeMap[d][a.status] = (decadeMap[d][a.status] || 0) + 1;
  });
  const decades = Object.keys(decadeMap)
    .map(d => ({
      decade: +d, ...decadeMap[d],
      total: (decadeMap[d].planned || 0) + (decadeMap[d].completed || 0) + (decadeMap[d].dropped || 0),
    }))
    .sort((a, b) => a.decade - b.decade);

  const artistMap = {};
  albums.forEach(a => {
    const k = a.artist_name;
    if (!k || EXCLUDED_ARTISTS.has(k)) return;
    artistMap[k] = artistMap[k] || { name: k, total: 0, planned: 0, completed: 0, dropped: 0, ratings: [] };
    artistMap[k].total++;
    artistMap[k][a.status] = (artistMap[k][a.status] || 0) + 1;
    if (a.rating != null) artistMap[k].ratings.push(a.rating);
  });
  const topArtists = Object.values(artistMap)
    .map(a => ({
      ...a,
      avgRating: a.ratings.length ? a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length : null,
    }))
    .sort((a, b) => b.total - a.total);

  const sortedDates = Object.keys(dailyMap).sort();
  let longestStreak = 0;
  let streakRun = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) streakRun = 1;
    else streakRun = diffCalendarDays(sortedDates[i - 1], sortedDates[i]) === 1
      ? streakRun + 1 : 1;
    longestStreak = Math.max(longestStreak, streakRun);
  }
  let currentStreak = 0;
  let day = new Date(todayDate);
  while (dailyMap[isoDate(day)]) {
    currentStreak++;
    day = new Date(day.getTime() - MS_DAY);
  }
  let activeDays30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(todayDate.getTime() - i * MS_DAY);
    if (dailyMap[isoDate(d)]) activeDays30++;
  }

  const oldestBacklog = planned.slice()
    .sort((a, b) => compareDatesAsc(a.planned_at || a.created_at, b.planned_at || b.created_at))
    .slice(0, 8);
  const recentFinished = completed.slice()
    .sort((a, b) => compareDatesDesc(a.listened_at, b.listened_at)).slice(0, 20);

  const gaps = completed.filter(a => a.planned_at && a.listened_at)
    .map(a => ({
      album: a,
      days: diffCalendarDays(a.planned_at, a.listened_at),
    }))
    .filter(g => g.days >= 0).sort((a, b) => b.days - a.days);

  const totalListenedMs = completed.reduce(
    (s, a) => s + (a.duration_ms || 0) * (1 + (a.repeats || 0)),
    0,
  );
  const totalHours = totalListenedMs / 3_600_000;
  const yearsWithData = Array.from(
    new Set(completed.filter(a => a.listened_at).map(a => a.listened_at.slice(0, 4))),
  ).sort();
  const thisYear = todayDate.getFullYear();
  const finishedThisYear = completed.filter(
    a => getDateYear(a.listened_at) === thisYear,
  ).length;

  return {
    today: todayDate,
    total: albums.length,
    planned,
    completed,
    dropped,
    counts: { planned: planned.length, completed: completed.length, dropped: dropped.length },
    rate30, rate90, monthly, dailyMap,
    ratingBuckets, ratingBucketLabels, ratingStep, avgRating, topRated,
    decades, topArtists,
    longestStreak, currentStreak, activeDays30,
    oldestBacklog, recentFinished,
    gaps, hasPlannedAt: albums.some(a => a.planned_at),
    totalHours, yearsWithData, finishedThisYear,
  };
}

export function computeYear(rawAlbums, year) {
  const albums = normalizeAlbumsForStats(rawAlbums);
  const y = String(year);
  const inYear = albums.filter(a => a.status === 'completed' && a.listened_at && a.listened_at.startsWith(y));
  const ratings = inYear.map(a => a.rating).filter(r => r != null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const topByRating = inYear.filter(a => a.rating != null).slice()
    .sort((a, b) => compareAlbumsByRating(a, b, { direction: 'desc' }))
    .slice(0, 10);

  const topReleasedThatYear = inYear.filter(a => a.release_year === +year && a.rating != null)
    .sort((a, b) => compareAlbumsByRating(a, b, { direction: 'desc' }))
    .slice(0, 10);

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    count: inYear.filter(a => getDateMonthIndex(a.listened_at) === i).length,
  }));

  const artMap = {};
  inYear.forEach(a => {
    if (!a.artist_name || EXCLUDED_ARTISTS.has(a.artist_name)) return;
    const primaryArtist = getPrimaryArtist(a);
    const e = artMap[a.artist_name] = artMap[a.artist_name] || {
      name: a.artist_name,
      count: 0,
      id: null,
      share_url: null,
      avatar_url: null,
      fallback_image: null,
      ratings: [],
    };
    e.count++;
    if (!e.id && primaryArtist?.id) e.id = primaryArtist.id;
    if (!e.share_url && primaryArtist?.share_url) e.share_url = primaryArtist.share_url;
    if (!e.share_url && a.artist_link) e.share_url = a.artist_link;
    if (!e.avatar_url && primaryArtist?.avatar_url) e.avatar_url = primaryArtist.avatar_url;
    if (!e.fallback_image && a.image_path) e.fallback_image = `/${a.image_path}`;
    if (a.rating != null) e.ratings.push(a.rating);
  });
  const topArtists = Object.values(artMap)
    .map(a => ({
      ...a,
      avgRating: a.ratings.length ? a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length : null,
    }))
    .filter(a => a.count > 1)
    .sort((a, b) => (b.count - a.count)
      || ((b.avgRating ?? Number.NEGATIVE_INFINITY) - (a.avgRating ?? Number.NEGATIVE_INFINITY))
      || compareTextAsc(a.name, b.name));

  const hours = inYear.reduce(
    (s, a) => s + (a.duration_ms || 0) * (1 + (a.repeats || 0)),
    0,
  ) / 3_600_000;

  const monthHours = Array.from({ length: 12 }, () => 0);
  inYear.forEach(a => {
    const mi = getDateMonthIndex(a.listened_at);
    if (!Number.isInteger(mi) || mi < 0 || mi > 11) return;
    monthHours[mi] += ((a.duration_ms || 0) * (1 + (a.repeats || 0))) / 3_600_000;
  });
  months.forEach((m, i) => { m.hours = monthHours[i]; });

  const allMult10 = ratings.length > 0 && ratings.every(r => r % 10 === 0);
  const ratingStep = allMult10 ? 10 : 5;
  const numBuckets = allMult10 ? 11 : 21;
  const rbuckets = Array.from({ length: numBuckets }, () => 0);
  ratings.forEach(r => {
    const idx = r === 100 ? numBuckets - 1 : Math.floor(r / ratingStep);
    rbuckets[Math.min(numBuckets - 1, Math.max(0, idx))]++;
  });

  const totalWords = inYear
    .filter(a => a.notes && String(a.notes).trim())
    .reduce((sum, a) => sum + String(a.notes).trim().split(/\s+/).filter(Boolean).length, 0);

  const noteEntriesByAlbumId = new Map(inYear.map(album => {
    const entry = { album, text: getAlbumNoteText(album) };
    return [album.id, entry];
  }));
  const notes = Array.from(noteEntriesByAlbumId.values())
    .filter(entry => entry.text.length > 0);

  const ratedAlbums = inYear.filter(album => album.rating != null);
  const screedAlbum = ratedAlbums.slice()
    .sort((a, b) => compareAlbumsByRating(a, b, { direction: 'asc' }))[0] || null;

  const numeroUnoAlbum = ratedAlbums.slice()
    .sort((a, b) => compareAlbumsByRating(a, b, { direction: 'desc' }))[0] || null;

  const screed = screedAlbum ? (noteEntriesByAlbumId.get(screedAlbum.id) || { album: screedAlbum, text: '' }) : null;
  const numeroUno = numeroUnoAlbum ? (noteEntriesByAlbumId.get(numeroUnoAlbum.id) || { album: numeroUnoAlbum, text: '' }) : null;

  const longestNotes = notes.slice()
    .sort(compareNoteEntriesByLengthRatingAndTitle)[0] || null;

  const byDate = inYear.slice().sort((a, b) => compareDatesAsc(a.listened_at, b.listened_at)
    || compareDatesAsc(a.created_at, b.created_at)
    || compareAlbumTitlesAsc(a, b));

  const albumsWithReleaseYear = inYear.filter(a => Number.isFinite(Number(a.release_year)));
  let oldestListened = null;
  let newestListened = null;
  if (albumsWithReleaseYear.length) {
    const releaseYears = albumsWithReleaseYear.map(album => Number(album.release_year));
    const oldestYear = Math.min(...releaseYears);
    const newestYear = Math.max(...releaseYears);
    oldestListened = resolveReleaseYearTie(
      albumsWithReleaseYear.filter(album => Number(album.release_year) === oldestYear),
      'oldest',
    );
    newestListened = resolveReleaseYearTie(
      albumsWithReleaseYear.filter(album => Number(album.release_year) === newestYear),
      'newest',
    );
  }

  return {
    year: +year, total: inYear.length, avgRating,
    topByRating, topReleasedThatYear, months, topArtists, hours,
    oldestListened, newestListened,
    firstListen: byDate[0], lastListen: byDate[byDate.length - 1],
    albums: inYear, ratingBuckets: rbuckets,
    notes, screed, numeroUno, longestNotes, totalWords,
    ratingStep,
  };
}
