document.querySelectorAll("[data-collapse]").forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.closest("[data-section]");
    section.classList.toggle("open");
    const arrow = button.querySelector(".chevron");
    arrow.textContent = section.classList.contains("open") ? "⌃" : "⌄";
  });
});

document.querySelectorAll("[data-book-card]").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll("[data-book-card]").forEach((item) => item.classList.remove("selected"));
    card.classList.add("selected");
    document.getElementById("mockDetails").hidden = false;
  });
});

document.querySelector(".detail-close").addEventListener("click", () => {
  document.getElementById("mockDetails").hidden = true;
  document.querySelectorAll("[data-book-card]").forEach((item) => item.classList.remove("selected"));
});
const bookSearch = document.getElementById("bookSearch");
const searchPanel = document.getElementById("searchResultsPanel");
const searchResults = document.getElementById("searchResults");
const searchStatus = document.getElementById("searchStatus");
let searchTimer = null;
let latestSearch = 0;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

function coverUrl(doc) {
  if (doc.cover_i) return "https://covers.openlibrary.org/b/id/" + doc.cover_i + "-M.jpg";
  const isbn = Array.isArray(doc.isbn) && doc.isbn[0];
  return isbn ? "https://covers.openlibrary.org/b/isbn/" + encodeURIComponent(isbn) + "-M.jpg?default=false" : "";
}

function renderSearchResults(docs) {
  if (!docs.length) {
    searchResults.innerHTML = '<div class="search-empty">No matches yet. Try the title, author, or ISBN.</div>';
    return;
  }
  searchResults.innerHTML = docs.map((doc, i) => {
    const author = (doc.author_name || []).join(", ") || "Author unavailable";
    const year = doc.first_publish_year || "";
    const isbn = (doc.isbn || [])[0] || "";
    const cover = coverUrl(doc);
    return '<article class="search-result">' +
      (cover ? '<img src="' + esc(cover) + '" alt="Cover of ' + esc(doc.title) + '" loading="lazy">' : '<div class="result-cover-fallback">' + esc(doc.title) + '</div>') +
      '<div class="result-copy"><h3>' + esc(doc.title) + '</h3><p>' + esc(author) + '</p><p class="meta">' + esc([year, isbn].filter(Boolean).join(" • ")) + '</p></div>' +
      '<button class="add-result" data-result-index="' + i + '">+ Add</button></article>';
  }).join("");
}

async function searchOpenLibrary(query) {
  const requestId = ++latestSearch;
  searchPanel.hidden = false;
  searchStatus.textContent = "Searching Open Library…";
  searchResults.innerHTML = '<div class="search-empty">Finding books and covers…</div>';
  try {
    const params = new URLSearchParams({
      q: query,
      fields: "key,title,author_name,author_key,first_publish_year,isbn,cover_i,edition_count,publisher,language,subject",
      limit: "10"
    });
    const response = await fetch("https://openlibrary.org/search.json?" + params.toString());
    if (!response.ok) throw new Error("Search service returned " + response.status);
    const data = await response.json();
    if (requestId !== latestSearch) return;
    window.jazzyLastSearch = (data.docs || []).slice(0, 10);
    searchStatus.textContent = (data.num_found || 0).toLocaleString() + " possible matches • showing best " + window.jazzyLastSearch.length;
    renderSearchResults(window.jazzyLastSearch);
  } catch (error) {
    if (requestId !== latestSearch) return;
    searchStatus.textContent = "Search could not load";
    searchResults.innerHTML = '<div class="search-empty">Could not reach the book catalog. Try again in a moment.</div>';
  }
}

bookSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = bookSearch.value.trim();
  if (q.length < 2) {
    searchPanel.hidden = true;
    return;
  }
  searchTimer = setTimeout(() => searchOpenLibrary(q), 350);
});

bookSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    clearTimeout(searchTimer);
    const q = bookSearch.value.trim();
    if (q) searchOpenLibrary(q);
  }
});

document.getElementById("closeSearchResults").addEventListener("click", () => {
  searchPanel.hidden = true;
});

searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-result-index]");
  if (!button) return;
  const doc = (window.jazzyLastSearch || [])[Number(button.dataset.resultIndex)];
  if (!doc) return;
  button.textContent = "Selected ✓";
  button.disabled = true;
  searchStatus.textContent = doc.title + " is ready to connect to the real library save step.";
});
