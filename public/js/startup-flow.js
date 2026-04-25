export async function runStartupFlow(options = {}) {
  const {
    page = 'collection',
    collectionView = 'list',
    sidebar = document.querySelector('.sidebar'),
    launchAlbumId = null,
    loadInitialPage = null,
    loadAlbums,
    revealSidebarForStartup,
    maybeClearLaunchAlbumParam,
    openLaunchAlbumModal,
    openEditModal,
  } = options;

  const shouldRevealSidebar = page === 'collection';
  const sidebarReveal = shouldRevealSidebar
    ? revealSidebarForStartup(sidebar)
    : Promise.resolve(false);
  const loadPage = typeof loadInitialPage === 'function'
    ? loadInitialPage
    : () => loadAlbums({ gateStartupArt: page === 'collection' && collectionView === 'list' });

  await loadPage();

  // If the page was opened with /collection/list?album=<id> (e.g. from the Spicetify extension),
  // automatically open the edit modal for that album.
  maybeClearLaunchAlbumParam();
  await Promise.all([
    sidebarReveal,
    openLaunchAlbumModal(launchAlbumId, { openModal: openEditModal }),
  ]);
}
