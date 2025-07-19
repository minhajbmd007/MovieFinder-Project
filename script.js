/* ================== CONFIG ================== */
/* Replace with your keys (never expose real keys publicly in production!) */
const API_KEY = 'f76066d0';            // OMDb API Key
const YT_API_KEY = 'AIzaSyC_znGBAiCYih5A62LHbTvYWWkoszfQ57g'; // YouTube API Key

/* ================== ELEMENT REFERENCES ================== */
const searchInput       = document.getElementById('searchInput');
const searchBtn         = document.getElementById('searchBtn');
const movieResults      = document.getElementById('movieResults');
const loadMoreBtn       = document.getElementById('loadMoreBtn');
const loaderEl          = document.getElementById('loader');

const movieModal        = document.getElementById('movieModal');
const modalBody         = document.getElementById('modalBody');
const closeModalBtn     = document.getElementById('closeModal');

const searchHistoryBox  = document.getElementById('searchHistory');

const navHome           = document.getElementById('navHome');
const navFavorites      = document.getElementById('navFavorites');
const navAbout          = document.getElementById('navAbout');

const homeSection       = document.getElementById('homeSection');
const favoritesSection  = document.getElementById('favoritesSection');
const aboutSection      = document.getElementById('aboutSection');
const favoritesList     = document.getElementById('favoritesList');

const backToTopBtn      = document.getElementById('backToTop');

/* Will be created dynamically */
let favoritesToolbar = null;

/* ================== STATE ================== */
let currentQuery = '';
let currentPage  = 1;
let totalResultsForQuery = 0;
let isLoading = false;
let searchDebounceTimer = null;
let favoritesSortMode = localStorage.getItem('favoritesSortMode') || 'addedDesc';
let cardObserver = null;
let aboutAnimationsInitialized = false;

/* ================== INIT ================== */
document.addEventListener('DOMContentLoaded', () => {
  loadFavorites();
  displaySearchHistory();
  initCardObserver();
  activateInitialSection();
  addNavActiveState('home');
  searchInput.focus();
  initBackToTop();
});

/* ================== EVENT LISTENERS ================== */
searchBtn.addEventListener('click', beginSearch);

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') beginSearch();
});
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    if (searchInput.value.trim() !== currentQuery) beginSearch();
  }, 500);
});

/* Load More Pagination */
loadMoreBtn.addEventListener('click', () => {
  if (isLoading) return;
  currentPage++;
  fetchAndRenderMovies(true);
});

/* Navigation */
navHome.addEventListener('click', e => {
  e.preventDefault();
  showSection('home');
  addNavActiveState('home');
});
navFavorites.addEventListener('click', e => {
  e.preventDefault();
  showSection('favorites');
  addNavActiveState('favorites');
  ensureFavoritesToolbar();
  renderFavoritesSection();
});
navAbout.addEventListener('click', e => {
  e.preventDefault();
  showSection('about');
  addNavActiveState('about');
});

/* Modal Events */
closeModalBtn.addEventListener('click', closeModal);
window.addEventListener('click', e => {
  if (e.target === movieModal) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* Delegated Clicks on Search Results (Unified) */
movieResults.addEventListener('click', e => {
  const card = e.target.closest('.movie-card');
  if (!card) return;

  // Favorite toggle
  if (e.target.classList.contains('fav-toggle')) {
    toggleFavoriteFromCard(card.dataset.imdb);
    return;
  }

  // Details button
  if (e.target.classList.contains('details-btn')) {
    getMovieDetails(card.dataset.imdb);
    return;
  }

  // Anything else on the card flips it
  card.classList.toggle('flipped');
});

/* Delegated Clicks on Favorites List */
favoritesList.addEventListener('click', e => {
  if (e.target.classList.contains('remove-fav')) {
    removeFromFavorites(e.target.dataset.imdb);
    renderFavoritesSection();
  } else if (e.target.classList.contains('fav-details')) {
    getMovieDetails(e.target.dataset.imdb);
  }
});

/* Search History click */
searchHistoryBox.addEventListener('click', e => {
  if (e.target.classList.contains('history-tag')) {
    searchInput.value = e.target.dataset.term;
    beginSearch();
  }
});

/* Back To Top show/hide */
window.addEventListener('scroll', () => {
  if (!backToTopBtn) return;
  if (window.scrollY > 350) backToTopBtn.classList.add('show');
  else backToTopBtn.classList.remove('show');
});

/* Back To Top click */
if (backToTopBtn) {
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ================== LOADER HELPERS ================== */
function showLoader() {
  if (loaderEl) loaderEl.style.display = 'block';
  movieResults.style.opacity = '0.5';
}
function hideLoader() {
  if (loaderEl) loaderEl.style.display = 'none';
  movieResults.style.opacity = '1';
}

/* ================== SEARCH ================== */
function beginSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    movieResults.innerHTML = '<p>Please enter a movie title.</p>';
    return;
  }
  currentQuery = query;
  currentPage = 1;
  saveSearchHistory(query);
  displaySearchHistory();
  fetchAndRenderMovies(false);
}

async function fetchAndRenderMovies(append = false) {
  if (!currentQuery) return;
  isLoading = true;
  showLoader();

  if (!append) {
    movieResults.innerHTML = '';
    loadMoreBtn.style.display = 'none';
  } else {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
  }

  try {
    const url = `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(currentQuery)}&page=${currentPage}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.Response === 'True') {
      totalResultsForQuery = parseInt(data.totalResults, 10);
      if (!append) renderMovieCards(data.Search);
      else appendMovieCards(data.Search);
      updateLoadMoreVisibility();
    } else {
      if (!append) movieResults.innerHTML = `<p>${escapeHTML(data.Error || 'No results.')}</p>`;
      loadMoreBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('Fetch error:', error);
    if (!append) movieResults.innerHTML = '<p>Error fetching results.</p>';
  } finally {
    isLoading = false;
    hideLoader();
    if (append) {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load More';
    }
  }
}

/* ================== RENDER MOVIES (with animations) ================== */
function renderMovieCards(list) {
  const favorites = getFavorites();
  movieResults.innerHTML = list.map(m => toMovieCardHTML(m, favorites)).join('');
  staggerCards(movieResults.querySelectorAll('.movie-card'));
  observeNewCards(movieResults.querySelectorAll('.movie-card'));
  updateFavoriteStars();
}

function appendMovieCards(list) {
  const favorites = getFavorites();
  const fragmentHTML = list.map(m => toMovieCardHTML(m, favorites)).join('');
  movieResults.insertAdjacentHTML('beforeend', fragmentHTML);
  const newCards = movieResults.querySelectorAll('.movie-card:not(.staggered)');
  staggerCards(newCards, true);
  observeNewCards(newCards);
  updateFavoriteStars();
}

function toMovieCardHTML(movie, favoritesArr = null) {
  const favs = favoritesArr || getFavorites();
  const poster = (movie.Poster && movie.Poster !== 'N/A')
    ? movie.Poster
    : 'https://via.placeholder.com/200x300?text=No+Image';
  const isFav = favs.some(f => f.imdbID === movie.imdbID);

  return `
    <div class="movie-card flip-card" data-imdb="${movie.imdbID}">
      <div class="flip-card-inner">
        <!-- FRONT -->
        <div class="flip-card-front">
          <img src="${poster}" alt="${escapeHTML(movie.Title)} poster" loading="lazy">
        </div>
        <!-- BACK -->
        <div class="flip-card-back">
          <h3>${escapeHTML(movie.Title)}</h3>
            <p>${escapeHTML(movie.Year)}</p>
            <button type="button" class="fav-toggle" aria-label="Toggle favorite">
              ${isFav ? '★' : '☆'}
            </button>
            <button type="button" class="details-btn" aria-label="View details">
              Details
            </button>
        </div>
      </div>
    </div>
  `;
}

/* Apply staggered animation delays */
function staggerCards(nodeList) {
  const cards = Array.from(nodeList);
  cards.forEach((card, idx) => {
    const delay = idx * 60; // ms
    card.style.animationDelay = `${delay}ms`;
    card.classList.add('staggered');
  });
}

/* Intersection observer to add in-view class */
function initCardObserver() {
  if ('IntersectionObserver' in window) {
    cardObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
  }
}

function initAboutAnimations() {
  const elements = document.querySelectorAll('#aboutSection .fade-in-up');
  if (!elements.length) return;
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    elements.forEach(el => observer.observe(el));
  } else {
    elements.forEach(el => el.classList.add('show'));
  }
}

function observeNewCards(cards) {
  if (!cardObserver) return;
  cards.forEach(card => cardObserver.observe(card));
}

function updateLoadMoreVisibility() {
  const totalPages = Math.ceil(totalResultsForQuery / 10);
  loadMoreBtn.style.display = (currentPage < totalPages) ? 'inline-block' : 'none';
}

/* ================== MODAL ================== */
async function getMovieDetails(imdbID) {
  if (!imdbID) return;
  openModal('<p>Loading...</p>');
  try {
    const url = `https://www.omdbapi.com/?apikey=${API_KEY}&i=${imdbID}&plot=full`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response === 'True') renderModalContent(data);
    else openModal('<p>Could not load details.</p>');
  } catch (err) {
    console.error(err);
    openModal('<p>Error loading details.</p>');
  }
}

function renderModalContent(movie) {
  const poster = (movie.Poster && movie.Poster !== 'N/A')
    ? movie.Poster
    : 'https://via.placeholder.com/300x450?text=No+Image';
  const fav = isFavorite(movie.imdbID);
  const html = `
    <div class="detail-layout">
      <div class="detail-poster">
        <img src="${poster}" alt="${escapeHTML(movie.Title)}">
      </div>
      <div class="detail-info">
        <h2>${escapeHTML(movie.Title)} <small>(${escapeHTML(movie.Year)})</small></h2>
        <p><strong>Genre:</strong> ${escapeHTML(movie.Genre || 'N/A')}</p>
        <p><strong>Actors:</strong> ${escapeHTML(movie.Actors || 'N/A')}</p>
        <p><strong>Director:</strong> ${escapeHTML(movie.Director || 'N/A')}</p>
        <p><strong>IMDB Rating:</strong> ${escapeHTML(movie.imdbRating || 'N/A')}</p>
        <p><strong>Plot:</strong> ${escapeHTML(movie.Plot || 'N/A')}</p>
        <button class="modal-fav-btn" data-imdb="${movie.imdbID}">
          ${fav ? '★ Remove Favorite' : '☆ Add to Favorites'}
        </button>
        <button class="trailer-btn" data-title="${escapeHTML(movie.Title)}">▶ Watch Trailer</button>
      </div>
    </div>
  `;
  openModal(html);

  modalBody.querySelector('.modal-fav-btn').addEventListener('click', () => {
    toggleFavorite(movie.imdbID, movie.Title, movie.Year, movie.Poster);
    renderModalContent(movie);
    updateFavoriteStars();
  });

  modalBody.querySelector('.trailer-btn').addEventListener('click', () => fetchTrailer(movie.Title));
}

async function fetchTrailer(title) {
  const info = modalBody.querySelector('.detail-info');
  if (!info) return;
  const existing = info.querySelector('.trailer-container');
  if (existing) existing.remove();
  info.insertAdjacentHTML('beforeend', `<p class="trailer-status">Loading trailer...</p>`);
  try {
    const query = encodeURIComponent(`${title} official trailer`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${query}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const statusEl = info.querySelector('.trailer-status');
    if (data.items && data.items.length > 0 && data.items[0].id.videoId) {
      if (statusEl) statusEl.remove();
      const videoId = data.items[0].id.videoId;
      info.insertAdjacentHTML('beforeend', `
        <div class="trailer-container">
          <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0"
            allowfullscreen title="YouTube trailer"></iframe>
        </div>`);
    } else if (statusEl) {
      statusEl.textContent = 'No trailer found.';
    }
  } catch (e) {
    console.error(e);
    const statusEl = modalBody.querySelector('.trailer-status');
    if (statusEl) statusEl.textContent = 'Failed to load trailer.';
  }
}

function openModal(contentHTML) {
  modalBody.innerHTML = contentHTML;
  movieModal.classList.add('show');
  movieModal.style.display = 'block';
}

function closeModal() {
  movieModal.classList.remove('show');
  movieModal.style.display = 'none';
}

/* ================== FAVORITES CORE ================== */
function loadFavorites() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem('favorites') || '[]'); } catch { raw = []; }
  const cleaned = (Array.isArray(raw) ? raw : []).filter(validFavorite);
  if (cleaned.length !== raw.length) {
    localStorage.setItem('favorites', JSON.stringify(cleaned));
  } else if (!localStorage.getItem('favorites')) {
    localStorage.setItem('favorites', JSON.stringify([]));
  }
}
function validFavorite(f) { return f && typeof f === 'object' && f.imdbID && f.Title; }
function getFavorites() {
  let favs;
  try { favs = JSON.parse(localStorage.getItem('favorites') || '[]'); } catch { favs = []; }
  return Array.isArray(favs) ? favs.filter(validFavorite) : [];
}
function isFavorite(imdbID) { return getFavorites().some(f => f.imdbID === imdbID); }
function toggleFavorite(imdbID, title, year, poster) {
  if (!imdbID || !title) return;
  const favorites = getFavorites();
  const index = favorites.findIndex(f => f.imdbID === imdbID);
  if (index > -1) favorites.splice(index, 1);
  else favorites.push({
    imdbID,
    Title: title,
    Year: year || 'N/A',
    Poster: (poster && poster !== 'N/A') ? poster : 'https://via.placeholder.com/200x300?text=No+Image',
    _addedAt: Date.now()
  });
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateFavoriteStars();
}
function toggleFavoriteFromCard(imdbID) {
  const card = movieResults.querySelector(`[data-imdb="${imdbID}"]`);
  if (!card) return;
  const btn = card.querySelector('.fav-toggle');
  const title = card.querySelector('h3').textContent;
  const year  = card.querySelector('p').textContent;
  const poster = card.querySelector('img').src;
  toggleFavorite(imdbID, title, year, poster);
  const nowFav = isFavorite(imdbID);
  btn.textContent = nowFav ? '★' : '☆';
  card.classList.toggle('favorite', nowFav);
}
function updateFavoriteStars() {
  movieResults.querySelectorAll('.movie-card').forEach(card => {
    const btn = card.querySelector('.fav-toggle');
    if (btn) btn.textContent = isFavorite(card.dataset.imdb) ? '★' : '☆';
    card.classList.toggle('favorite', isFavorite(card.dataset.imdb));
  });
}
function removeFromFavorites(imdbID) {
  const favorites = getFavorites().filter(f => f.imdbID !== imdbID);
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

/* ================== FAVORITES TOOLBAR / SORT / EXPORT / IMPORT ================== */
function ensureFavoritesToolbar() {
  if (favoritesToolbar) return;
  favoritesToolbar = document.createElement('div');
  favoritesToolbar.id = 'favoritesToolbar';
  favoritesToolbar.style.display = 'flex';
  favoritesToolbar.style.flexWrap = 'wrap';
  favoritesToolbar.style.gap = '10px';
  favoritesToolbar.style.marginBottom = '15px';
  favoritesToolbar.style.alignItems = 'center';
  favoritesToolbar.innerHTML = `
    <label style="font-size:0.9rem;">Sort:
      <select id="favSortSelect" style="margin-left:5px;">
        <option value="addedDesc">Recently Added</option>
        <option value="titleAsc">Title A→Z</option>
        <option value="titleDesc">Title Z→A</option>
        <option value="yearAsc">Year ↑</option>
        <option value="yearDesc">Year ↓</option>
      </select>
    </label>
    <button id="clearFavoritesBtn" type="button">Clear All</button>
    <button id="exportFavoritesBtn" type="button">Export</button>
    <button id="importFavoritesBtn" type="button">Import</button>
    <input id="importFavoritesInput" type="file" accept="application/json" style="display:none;">
  `;
  favoritesSection.insertBefore(favoritesToolbar, favoritesList);
  favoritesToolbar.querySelector('#favSortSelect').value = favoritesSortMode;
  favoritesToolbar.querySelector('#favSortSelect').addEventListener('change', e => {
    favoritesSortMode = e.target.value;
    localStorage.setItem('favoritesSortMode', favoritesSortMode);
    renderFavoritesSection();
  });
  favoritesToolbar.querySelector('#clearFavoritesBtn').addEventListener('click', () => {
    if (confirm('Clear ALL favorites?')) {
      localStorage.setItem('favorites', JSON.stringify([]));
      renderFavoritesSection();
      updateFavoriteStars();
    }
  });
  favoritesToolbar.querySelector('#exportFavoritesBtn').addEventListener('click', exportFavorites);
  favoritesToolbar.querySelector('#importFavoritesBtn').addEventListener('click', () =>
    favoritesToolbar.querySelector('#importFavoritesInput').click()
  );
  favoritesToolbar.querySelector('#importFavoritesInput').addEventListener('change', handleImportFavorites);
}

function sortFavorites(arr) {
  switch (favoritesSortMode) {
    case 'titleAsc': return arr.sort((a,b)=>a.Title.localeCompare(b.Title));
    case 'titleDesc': return arr.sort((a,b)=>b.Title.localeCompare(a.Title));
    case 'yearAsc': return arr.sort((a,b)=>(parseInt(a.Year)||0)-(parseInt(b.Year)||0));
    case 'yearDesc': return arr.sort((a,b)=>(parseInt(b.Year)||0)-(parseInt(a.Year)||0));
    case 'addedDesc':
    default: return arr.sort((a,b)=>(b._addedAt||0)-(a._addedAt||0));
  }
}

function renderFavoritesSection() {
  const favorites = sortFavorites(getFavorites().slice());
  if (!favorites.length) {
    favoritesList.innerHTML = '<p>No favorites added yet.</p>';
    return;
  }
  favoritesList.innerHTML = favorites.map(fav => {
    const title = fav.Title || 'Unknown Title';
    const year  = fav.Year || '—';
    const poster = (fav.Poster && fav.Poster !== 'N/A') ? fav.Poster : 'https://via.placeholder.com/200x300?text=No+Image';
    return `
      <div class="movie-card favorite">
        <img src="${poster}" alt="${escapeHTML(title)}">
        <h3 class="fav-details" data-imdb="${fav.imdbID}">${escapeHTML(title)}</h3>
        <p>${escapeHTML(year)}</p>
        <button class="remove-fav" data-imdb="${fav.imdbID}">Remove</button>
      </div>`;
  }).join('');
  staggerCards(favoritesList.querySelectorAll('.movie-card'));
  observeNewCards(favoritesList.querySelectorAll('.movie-card'));
}

function exportFavorites() {
  const data = JSON.stringify(getFavorites(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'favorites.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFavorites(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      const cleaned = imported.filter(validFavorite).map(f => ({
        imdbID: f.imdbID,
        Title: f.Title,
        Year: f.Year || 'N/A',
        Poster: (f.Poster && f.Poster !== 'N/A') ? f.Poster : 'https://via.placeholder.com/200x300?text=No+Image',
        _addedAt: f._addedAt || Date.now()
      }));
      if (!cleaned.length) throw new Error('No valid favorites in file');
      if (confirm('Replace existing favorites with imported ones? (Cancel = merge)')) {
        localStorage.setItem('favorites', JSON.stringify(cleaned));
      } else {
        const current = getFavorites();
        const mergedMap = new Map();
        [...current, ...cleaned].forEach(f => mergedMap.set(f.imdbID, f));
        localStorage.setItem('favorites', JSON.stringify(Array.from(mergedMap.values())));
      }
      renderFavoritesSection();
      updateFavoriteStars();
      alert('Favorites imported successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to import favorites: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

/* ================== SEARCH HISTORY ================== */
function saveSearchHistory(query) {
  let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  history = history.filter(item => item !== query);
  history.unshift(query);
  if (history.length > 5) history.pop();
  localStorage.setItem('searchHistory', JSON.stringify(history));
}
function displaySearchHistory() {
  const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  searchHistoryBox.innerHTML = history
    .map(term => `<span class="history-tag" data-term="${escapeHTML(term)}">${escapeHTML(term)}</span>`)
    .join('');
}

/* ================== UTILITIES ================== */
function showSection(section) {
  const sections = { home: homeSection, favorites: favoritesSection, about: aboutSection };
  Object.values(sections).forEach(sec => sec.classList.remove('active'));

  if (section === 'home') {
    homeSection.style.display = 'block';
    favoritesSection.style.display = 'none';
    aboutSection.style.display = 'none';
    homeSection.classList.add('active');
  } else if (section === 'favorites') {
    favoritesSection.style.display = 'block';
    homeSection.style.display = 'none';
    aboutSection.style.display = 'none';
    favoritesSection.classList.add('active');
  } else if (section === 'about') {
    aboutSection.style.display = 'block';
    homeSection.style.display = 'none';
    favoritesSection.style.display = 'none';
    aboutSection.classList.add('active');

    if (!aboutAnimationsInitialized) {
      initAboutAnimations();
      aboutAnimationsInitialized = true;
    }
  }
}
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}
function activateInitialSection() { homeSection.classList.add('active'); }
function addNavActiveState(which) {
  [navHome, navFavorites, navAbout].forEach(a => a.classList.remove('active'));
  if (which === 'home') navHome.classList.add('active');
  else if (which === 'favorites') navFavorites.classList.add('active');
  else if (which === 'about') navAbout.classList.add('active');
}
function initBackToTop() { /* already handled by scroll listener */ }

/* ================== OPTIONAL: MIGRATION (RUNS ONCE) ================== */
(function migrateLegacyFavorites() {
  const favs = getFavorites();
  let changed = false;
  favs.forEach(f => { if (!f._addedAt) { f._addedAt = Date.now(); changed = true; } });
  if (changed) localStorage.setItem('favorites', JSON.stringify(favs));
})();
