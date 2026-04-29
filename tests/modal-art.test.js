import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const loadAlbumsMock = vi.fn();
const showErrorMock = vi.fn();

const stateMock = {
  albums: [],
  albumDetailsCache: {},
  modal: {
    albumId: 1,
  },
  debugMode: false,
  showRefetchArt: true,
};

function makeEl(tagName = 'div') {
  return globalThis.document.createElement(tagName);
}

const elMock = {
  btnRefetchArt: makeEl('button'),
  artRefetchPreview: makeEl(),
  artRefetchImg: makeEl('img'),
  artRefetchCompare: makeEl(),
  btnArtRefetchCancel: makeEl('button'),
  btnArtRefetchReplace: makeEl('button'),
  metaArt: makeEl('img'),
  btnDeleteArt: makeEl('button'),
  btnRandomArt: makeEl('button'),
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: apiFetchMock,
}));

vi.mock('../public/js/utils.js', () => ({
  artUrl: vi.fn(path => (path ? `/art/${path}` : null)),
  normalizeAlbumClientShape: album => album,
}));

vi.mock('../public/js/render.js', () => ({
  loadAlbums: loadAlbumsMock,
}));

vi.mock('../public/js/modal.js', () => ({
  showError: showErrorMock,
}));

function resetElements() {
  Object.values(elMock).forEach(element => {
    element.className = '';
    element.textContent = '';
    element.removeAttribute?.('src');
    if (element.dataset) {
      Object.keys(element.dataset).forEach(key => {
        delete element.dataset[key];
      });
    }
    element.disabled = false;
  });
  elMock.artRefetchPreview.classList.add('hidden');
}

describe('modal art actions', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockReset();
    loadAlbumsMock.mockReset();
    loadAlbumsMock.mockResolvedValue(true);
    showErrorMock.mockReset();
    stateMock.albums = [];
    stateMock.albumDetailsCache = {};
    stateMock.modal = { albumId: 1 };
    resetElements();
  });

  it('applies refetched art directly when the album has no existing art', async () => {
    const { handleRefetchArt } = await import('../public/js/modal-art.js');
    stateMock.albums = [{
      id: 1,
      album_name: 'No Art Album',
      image_path: null,
      image_url_large: 'https://images.example/large.jpg',
    }];
    apiFetchMock.mockResolvedValue({
      id: 1,
      image_path: 'images/refetched.jpg',
    });

    await handleRefetchArt();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/1/refetch-art', { method: 'POST' });
    expect(stateMock.albums[0].image_path).toBe('images/refetched.jpg');
    expect(stateMock.albumDetailsCache[1]).toMatchObject({ image_path: 'images/refetched.jpg' });
    expect(elMock.metaArt.src).toContain('/art/images/refetched.jpg');
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true, invalidateCache: true });
    expect(elMock.artRefetchPreview.classList.contains('hidden')).toBe(true);
  });

  it('shows a comparison preview when refetched art would replace existing art', async () => {
    const { handleRefetchArt } = await import('../public/js/modal-art.js');
    stateMock.albums = [{
      id: 1,
      album_name: 'Existing Art Album',
      image_path: 'images/current.jpg',
      image_url_large: 'https://images.example/large.jpg',
    }];
    apiFetchMock.mockResolvedValue({
      new_image_path: 'images/temp.jpg',
      identical: false,
    });

    await handleRefetchArt();

    expect(elMock.artRefetchPreview.classList.contains('hidden')).toBe(false);
    expect(elMock.artRefetchImg.src).toContain('/art/images/temp.jpg');
    expect(elMock.artRefetchCompare.innerHTML).toContain('Files are different');
    expect(elMock.btnArtRefetchReplace.dataset.newPath).toBe('images/temp.jpg');
    expect(elMock.btnArtRefetchReplace.classList.contains('btn-primary')).toBe(true);
    expect(elMock.btnArtRefetchCancel.classList.contains('btn-ghost')).toBe(true);
    expect(loadAlbumsMock).not.toHaveBeenCalled();
  });

  it('replaces previewed art and refreshes the current album page', async () => {
    const { handleArtRefetchReplace } = await import('../public/js/modal-art.js');
    stateMock.albums = [{ id: 1, image_path: 'images/current.jpg' }];
    elMock.btnArtRefetchReplace.dataset.newPath = 'images/temp.jpg';
    apiFetchMock.mockResolvedValue({ id: 1, image_path: 'images/replaced.jpg' });

    await handleArtRefetchReplace();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/1/replace-refetched-art', {
      method: 'POST',
      body: JSON.stringify({ image_path: 'images/temp.jpg' }),
    });
    expect(stateMock.albums[0].image_path).toBe('images/replaced.jpg');
    expect(stateMock.albumDetailsCache[1]).toMatchObject({ image_path: 'images/replaced.jpg' });
    expect(elMock.metaArt.src).toContain('/art/images/replaced.jpg');
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true, invalidateCache: true });
    expect(elMock.artRefetchPreview.classList.contains('hidden')).toBe(true);
  });

  it('deletes art and refreshes the current album page', async () => {
    const { handleDeleteArt } = await import('../public/js/modal-art.js');
    stateMock.albums = [{ id: 1, image_path: 'images/current.jpg' }];
    apiFetchMock.mockResolvedValue({ id: 1, image_path: null });

    await handleDeleteArt();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/1/delete-art', { method: 'POST' });
    expect(stateMock.albums[0].image_path).toBeNull();
    expect(elMock.metaArt.getAttribute('src')).toBe('');
    expect(elMock.metaArt.classList.contains('hidden')).toBe(true);
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true, invalidateCache: true });
  });

  it('randomizes art and refreshes the current album page', async () => {
    const { handleRandomArt } = await import('../public/js/modal-art.js');
    stateMock.albums = [{ id: 1, image_path: 'images/current.jpg' }];
    apiFetchMock.mockResolvedValue({ id: 1, image_path: 'images/random.jpg' });

    await handleRandomArt();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/1/random-art', { method: 'POST' });
    expect(stateMock.albums[0].image_path).toBe('images/random.jpg');
    expect(elMock.metaArt.src).toContain('/art/images/random.jpg');
    expect(elMock.metaArt.classList.contains('hidden')).toBe(false);
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true, invalidateCache: true });
  });
});
