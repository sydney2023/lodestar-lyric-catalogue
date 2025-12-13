const q = document.getElementById("q");
const go = document.getElementById("go");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

let SONGS = [];
let FILTERED = [];

const ART_CACHE = new Map(); // key -> artworkUrl100
const IN_FLIGHT = new Set(); // keys currently fetching
let observer = null;

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function songKey(title, artist) {
  return `${normalize(title)}|${normalize(artist)}`;
}

function clearResults() {
  resultsEl.innerHTML = "";
}

function lyricsLink(title, artist) {
  const query = encodeURIComponent(`${title} ${artist} lyrics`);
  return `https://www.google.com/search?q=${query}`;
}

function sortSongs(list) {
  return list.slice().sort((a, b) => {
    const at = normalize(a.title);
    const bt = normalize(b.title);
    if (at < bt) return -1;
    if (at > bt) return 1;

    const aa = normalize(a.artist);
    const ba = normalize(b.artist);
    if (aa < ba) return -1;
    if (aa > ba) return 1;

    return 0;
  });
}

async function fetchArtwork(title, artist) {
  const k = songKey(title, artist);
  if (ART_CACHE.has(k)) return ART_CACHE.get(k);
  if (IN_FLIGHT.has(k)) return ""; // already fetching

  IN_FLIGHT.add(k);

  // iTunes search for 1 best match
  const term = encodeURIComponent(`${title} ${artist}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    const art = data?.results?.[0]?.artworkUrl100 || "";
    ART_CACHE.set(k, art);
    return art;
  } catch {
    ART_CACHE.set(k, "");
    return "";
  } finally {
    IN_FLIGHT.delete(k);
  }
}

function setupObserver() {
  // If we re-render, disconnect the old observer
  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const img = entry.target;
        observer.unobserve(img); // only load once when it becomes visible

        const title = img.dataset.title;
        const artist = img.dataset.artist;
        const k = songKey(title, artist);

        // If cached, set immediately
        if (ART_CACHE.has(k)) {
          const art = ART_CACHE.get(k);
          if (art) img.src = art;
          continue;
        }

        // Otherwise fetch and set
        fetchArtwork(title, artist).then((art) => {
          if (art) img.src = art;
        });
      }
    },
    {
      root: null,
      // start loading a little BEFORE it appears (smooth scrolling)
      rootMargin: "300px 0px",
      threshold: 0.01
    }
  );
}

function renderSongs(list) {
  clearResults();

  const total = SONGS.length;
  const showing = list.length;

  statusEl.textContent = showing === 0
    ? `No matches. Showing 0 of ${total} songs.`
    : `Showing ${showing} of ${total} songs.`;

  if (showing === 0) return;

  setupObserver();

  for (const s of list) {
    const title = s.title || "Unknown title";
    const artist = s.artist || "Unknown artist";

    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.className = "art";
    img.alt = `${title} artwork`;

    // Store info for lazy loader
    img.dataset.title = title;
    img.dataset.artist = artist;

    // If already cached, use it; otherwise leave empty until it scrolls into view
    const k = songKey(title, artist);
    const cached = ART_CACHE.get(k);
    img.src = cached || "";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <div class="title">${title}</div>
      <div class="artist">${artist}</div>
    `;

    const links = document.createElement("div");
    links.className = "links";

    const a = document.createElement("a");
    a.href = lyricsLink(title, artist);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Find lyrics";

    links.appendChild(a);

    card.appendChild(img);
    card.appendChild(meta);
    card.appendChild(links);
    resultsEl.appendChild(card);

    // Observe for lazy-loading artwork
    // (If already has cached src, no harm; it will just unobserve quickly)
    observer.observe(img);
  }
}

function applyFilter() {
  const term = normalize(q.value);

  if (!term) {
    FILTERED = SONGS;
  } else {
    FILTERED = SONGS.filter(s => {
      const t = normalize(s.title);
      const a = normalize(s.artist);
      return t.includes(term) || a.includes(term);
    });
  }

  renderSongs(FILTERED);
}

// Load catalogue and show all on load
fetch("songs.json")
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} loading songs.json`);
    return r.json();
  })
  .then(list => {
    SONGS = sortSongs(list);
    FILTERED = SONGS;
    renderSongs(SONGS);
  })
  .catch(err => {
    console.error(err);
    statusEl.textContent = `Catalogue error: ${err.message}`;
  });

// Filter live as you type; button still works
q.addEventListener("input", applyFilter);
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyFilter();
});
