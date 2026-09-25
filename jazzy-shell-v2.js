const SUPABASE_URL = "https://uouzmmexjundpfitogky.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable__XjfvOCgcMDsBks3V4F0Cg_o0rEZn_t";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let currentUser = null;
let books = [];
let libraryRevision = null;
let conflictActive = false;
let searchResults = [];
let messageTimer = null;

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[ch]));
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function showMessage(message) {
  const el = $("appMessage");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}

function authMessage(message, isError = false) {
  $("authMessage").textContent = message;
  $("authMessage").classList.toggle("error", !!isError);
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["want", "want_to_read", "tbr"].includes(value)) return "want";
  if (["reading", "currently_reading", "current"].includes(value)) return "reading";
  if (["read", "finished", "complete", "completed"].includes(value)) return "finished";
  return "finished";
}

function nextBookId() {
  return books.length ? Math.max(...books.map((b) => Number(b.id) || 0)) + 1 : 1;
}

function coverMarkup(book) {
  const cover = safeHttpUrl(book.cover_url);
  if (cover) {
    return '<img class="book-cover-image" src="' + escapeHtml(cover) + '" alt="Cover of ' + escapeHtml(book.title) + '" loading="lazy">';
  }
  return '<div class="cover-fallback">' + escapeHtml(book.title || "Untitled") + "</div>";
}

function bookCard(book, kind) {
  return '<article class="book-card" data-open-book="' + Number(book.id) + '" data-kind="' + kind + '">' +
    coverMarkup(book) +
    "<h3>" + escapeHtml(book.title || "Untitled") + "</h3>" +
    "<p>" + escapeHtml(book.author || "Unknown author") + "</p>" +
    "</article>";
}

function emptyMarkup(label) {
  return '<div class="empty-section">No books here yet. Search above to add one.</div>';
}

function renderLibrary() {
  const groups = {
    reading: books.filter((b) => normalizeStatus(b.status) === "reading"),
    want: books.filter((b) => normalizeStatus(b.status) === "want"),
    finished: books.filter((b) => normalizeStatus(b.status) === "finished"),
    favorites: books.filter((b) => !!b.favorite)
  };

  for (const kind of Object.keys(groups)) {
    const list = groups[kind];
    $(kind + "Count").textContent = "(" + list.length + ")";
    $(kind + "Grid").innerHTML = list.length ? list.map((b) => bookCard(b, kind)).join("") : emptyMarkup(kind);
  }
}

function detailsMarkup(book) {
  const description = book.description || book.comment || "No description saved yet.";
  const series = book.series || "—";
  const year = book.published_year || book.publish_date || "—";
  const publisher = book.publisher || (Array.isArray(book.publishers) ? book.publishers[0] : "") || "—";
  const pages = book.page_count || "—";
  const isbn = book.isbn || book.isbn13 || book.isbn10 || "—";
  const stars = Number(book.rating || 0);
  const rating = stars ? "★".repeat(Math.min(stars, 5)) + "☆".repeat(Math.max(0, 5 - stars)) : "Not rated";

  return '<article class="detail-card dynamic-detail">' +
    '<button class="detail-close" data-close-detail aria-label="Collapse book details">×</button>' +
    '<div class="detail-intro">' +
      '<div class="detail-cover-wrap">' + coverMarkup(book) + "</div>" +
      "<div><h2>" + escapeHtml(book.title) + "</h2>" +
      '<p class="detail-author">' + escapeHtml(book.author || "Unknown author") + "</p>" +
      '<p class="description">' + escapeHtml(description) + "</p>" +
      (safeHttpUrl(book.source_url) ? '<p class="detail-meta-source"><a target="_blank" rel="noopener" href="' + escapeHtml(safeHttpUrl(book.source_url)) + '">View source record</a></p>' : "") +
      "</div>" +
    "</div>" +
    '<div class="detail-grid"><div class="facts">' +
      "<div><span>Author</span><b>" + escapeHtml(book.author || "—") + "</b></div>" +
      "<div><span>Series</span><b>" + escapeHtml(series) + "</b></div>" +
      "<div><span>Year</span><b>" + escapeHtml(year) + "</b></div>" +
      "<div><span>Publisher</span><b>" + escapeHtml(publisher) + "</b></div>" +
      "<div><span>Pages</span><b>" + escapeHtml(pages) + "</b></div>" +
      "<div><span>ISBN</span><b>" + escapeHtml(isbn) + "</b></div>" +
      '<div><span>Rating</span><b class="stars">' + escapeHtml(rating) + "</b></div>" +
    '</div><div class="detail-actions">' +
      '<button class="primary-btn" data-status-book="' + Number(book.id) + '" data-status="reading">▣ Reading</button>' +
      '<button data-status-book="' + Number(book.id) + '" data-status="want_to_read">♥ Want to Read</button>' +
      '<button data-status-book="' + Number(book.id) + '" data-status="read">✓ Finished</button>' +
      '<button data-favorite-book="' + Number(book.id) + '">' + (book.favorite ? "★ Unfavorite" : "☆ Favorite") + "</button>" +
    "</div></div></article>";
}

function openBookDetails(id, kind) {
  const book = books.find((b) => Number(b.id) === Number(id));
  if (!book) return;
  document.querySelectorAll(".detail-slot").forEach((slot) => slot.innerHTML = "");
  $(kind + "Details").innerHTML = detailsMarkup(book);
}

async function loadLibrary() {
  const { data, error } = await db.from("jazzy_book_libraries")
    .select("books, revision")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: createError } = await db.from("jazzy_book_libraries")
      .insert({ user_id: currentUser.id, books: [] })
      .select("books, revision")
      .single();
    if (createError) throw createError;
    books = created.books || [];
    libraryRevision = Number(created.revision || 1);
  } else {
    books = Array.isArray(data.books) ? data.books : [];
    libraryRevision = Number(data.revision || 1);
  }

  conflictActive = false;
  $("conflictBar").hidden = true;
  renderLibrary();
}

async function saveLibrary() {
  if (conflictActive) return false;

  const expected = libraryRevision;
  const { data, error } = await db.rpc("save_jazzy_book_library", {
    p_books: books,
    p_expected_revision: expected
  });

  if (error) {
    showMessage("Save failed: " + error.message);
    return false;
  }

  if (!data || !data.length) {
    conflictActive = true;
    $("conflictBar").hidden = false;
    return false;
  }

  libraryRevision = Number(data[0].new_revision);
  return true;
}

async function checkForNewerRevision() {
  const { data, error } = await db.from("jazzy_book_libraries")
    .select("revision")
    .eq("user_id", currentUser.id)
    .single();
  if (error) throw error;
  if (Number(data.revision) !== Number(libraryRevision)) {
    conflictActive = true;
    $("conflictBar").hidden = false;
    return false;
  }
  return true;
}

async function runSearch() {
  const query = $("bookSearchInput").value.trim();
  if (query.length < 2) {
    showMessage("Type at least two characters.");
    return;
  }

  $("searchResultsPanel").hidden = false;
  $("searchLoading").hidden = false;
  $("searchResultsGrid").innerHTML = "";
  $("searchSummary").textContent = "Searching by title, author, or ISBN…";

  const { data, error } = await db.functions.invoke("book-lookup", {
    body: { action: "search", query }
  });

  $("searchLoading").hidden = true;

  if (error || data?.error) {
    $("searchSummary").textContent = "Search could not be completed.";
    showMessage(data?.error || error?.message || "Search failed.");
    return;
  }

  searchResults = Array.isArray(data.results) ? data.results : [];
  $("searchSummary").textContent = searchResults.length
    ? "Choose the correct book and where it belongs."
    : "No matches found. Try another title, author, or ISBN.";

  $("searchResultsGrid").innerHTML = searchResults.map((book, index) => {
    const cover = book.coverUrl
      ? '<img src="' + escapeHtml(book.coverUrl) + '" alt="Cover of ' + escapeHtml(book.title) + '" loading="lazy">'
      : '<div class="cover-fallback">' + escapeHtml(book.title) + "</div>";

    return '<article class="search-result-card">' +
      cover +
      "<h3>" + escapeHtml(book.title) + "</h3>" +
      '<p class="result-author">' + escapeHtml((book.authors || []).join(", ") || "Unknown author") + "</p>" +
      '<select data-result-status="' + index + '">' +
        '<option value="want_to_read">Want to Read</option>' +
        '<option value="reading">Currently Reading</option>' +
        '<option value="read">Finished</option>' +
      "</select>" +
      '<button class="add-result" data-add-result="' + index + '">Add to My Library</button>' +
    "</article>";
  }).join("");
}

async function addSearchResult(index, button) {
  const selected = searchResults[index];
  if (!selected) return;

  const duplicate = books.some((book) =>
    (selected.workKey && book.work_key === selected.workKey) ||
    (selected.isbn && (book.isbn === selected.isbn || book.isbn13 === selected.isbn || book.isbn10 === selected.isbn))
  );
  if (duplicate) {
    showMessage("That book is already in this library.");
    return;
  }

  button.disabled = true;
  button.textContent = "Finding details…";

  try {
    if (!(await checkForNewerRevision())) return;

    let enriched = null;
    if (selected.workKey) {
      const response = await db.functions.invoke("book-lookup", {
        body: { action: "enrich", workKey: selected.workKey }
      });
      if (!response.error && !response.data?.error) enriched = response.data;
    }

    const statusEl = document.querySelector('[data-result-status="' + index + '"]');
    const status = statusEl ? statusEl.value : "want_to_read";
    const authors = enriched?.authors?.map((a) => a.name).filter(Boolean)
      || selected.authors
      || [];

    const book = {
      id: nextBookId(),
      title: enriched?.title || selected.title || "Untitled",
      author: authors.join(", ") || "Unknown author",
      series: enriched?.series?.[0] || selected.series?.[0] || "",
      published_year: selected.firstPublishYear || enriched?.firstPublishDate || "",
      publish_date: enriched?.publishDate || "",
      status,
      rating: "",
      favorite: false,
      comment: "",
      description: enriched?.description || "",
      publisher: enriched?.publishers?.[0] || selected.publishers?.[0] || "",
      page_count: enriched?.pageCount || selected.pageCount || "",
      isbn: enriched?.isbn || selected.isbn || "",
      isbn13: enriched?.isbn13 || "",
      isbn10: enriched?.isbn10 || "",
      subjects: enriched?.subjects || selected.subjects || [],
      cover_url: enriched?.coverUrl || selected.coverUrl || "",
      cover_id: enriched?.coverId || selected.coverId || "",
      work_key: selected.workKey || enriched?.workKey || "",
      edition_key: enriched?.editionKey || "",
      source_url: enriched?.sourceUrl || (selected.workKey ? "https://openlibrary.org" + selected.workKey : ""),
      metadata_provider: "openlibrary",
      source_text: selected.title || ""
    };

    books.push(book);
    const saved = await saveLibrary();
    if (!saved) {
      books = books.filter((b) => Number(b.id) !== Number(book.id));
      return;
    }

    renderLibrary();
    button.textContent = "Added ✓";
    showMessage("Added “" + book.title + "” to the library.");
  } catch (error) {
    showMessage(error?.message || "Could not add that book.");
    button.disabled = false;
    button.textContent = "Add to My Library";
  }
}

async function updateBookStatus(id, patch) {
  if (!(await checkForNewerRevision())) return;
  const index = books.findIndex((b) => Number(b.id) === Number(id));
  if (index < 0) return;
  const previous = { ...books[index] };
  books[index] = { ...books[index], ...patch };
  if (!(await saveLibrary())) {
    books[index] = previous;
    return;
  }
  renderLibrary();
  document.querySelectorAll(".detail-slot").forEach((slot) => slot.innerHTML = "");
  showMessage("Library updated.");
}

async function enterApp(user) {
  currentUser = user;
  $("authGate").hidden = true;
  $("appShell").hidden = false;
  $("bottomNav").hidden = false;
  $("avatarBtn").textContent = (user.email || "J").slice(0, 1).toUpperCase();
  await loadLibrary();
}

function leaveApp() {
  currentUser = null;
  books = [];
  libraryRevision = null;
  $("appShell").hidden = true;
  $("bottomNav").hidden = true;
  $("authGate").hidden = false;
}

document.querySelectorAll("[data-collapse]").forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.closest("[data-section]");
    section.classList.toggle("open");
    button.querySelector(".chevron").textContent = section.classList.contains("open") ? "⌃" : "⌄";
  });
});

document.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-open-book]");
  if (card) {
    openBookDetails(card.dataset.openBook, card.dataset.kind);
    return;
  }

  const close = event.target.closest("[data-close-detail]");
  if (close) {
    close.closest(".detail-slot").innerHTML = "";
    return;
  }

  const add = event.target.closest("[data-add-result]");
  if (add) {
    await addSearchResult(Number(add.dataset.addResult), add);
    return;
  }

  const status = event.target.closest("[data-status-book]");
  if (status) {
    await updateBookStatus(Number(status.dataset.statusBook), { status: status.dataset.status });
    return;
  }

  const favorite = event.target.closest("[data-favorite-book]");
  if (favorite) {
    const book = books.find((b) => Number(b.id) === Number(favorite.dataset.favoriteBook));
    if (book) await updateBookStatus(book.id, { favorite: !book.favorite });
  }
});

$("bookSearchBtn").addEventListener("click", runSearch);
$("bookSearchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearch();
});
$("closeSearchResults").addEventListener("click", () => $("searchResultsPanel").hidden = true);
$("navSearch").addEventListener("click", () => {
  $("bookSearchInput").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("navAdd").addEventListener("click", () => {
  $("bookSearchInput").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("scanBtn").addEventListener("click", () => showMessage("Barcode scanning is the next add-on."));
$("reloadLibraryBtn").addEventListener("click", async () => {
  await loadLibrary();
  showMessage("Loaded the newer library copy.");
});

function readAuthFields() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email) { authMessage("Enter your email address first.", true); $("authEmail").focus(); return null; }
  if (!$("authEmail").checkValidity()) { authMessage("Enter a valid email address.", true); $("authEmail").focus(); return null; }
  if (!password) { authMessage("Enter your password first.", true); $("authPassword").focus(); return null; }
  if (password.length < 6) { authMessage("Password must be at least 6 characters.", true); $("authPassword").focus(); return null; }
  return { email, password };
}

$("signInBtn").addEventListener("click", async () => {
  const credentials = readAuthFields();
  if (!credentials) return;
  authMessage("Signing in…");
  try {
    const { data, error } = await db.auth.signInWithPassword(credentials);
    if (error) return authMessage(error.message, true);
    authMessage("");
    await enterApp(data.user);
  } catch (error) { authMessage(error?.message || "Could not sign in. Try again.", true); }
});

$("signUpBtn").addEventListener("click", async () => {
  const credentials = readAuthFields();
  if (!credentials) return;
  authMessage("Creating account…");
  try {
    const { data, error } = await db.auth.signUp(credentials);
    if (error) return authMessage(error.message, true);
    if (data.session && data.user) {
      authMessage("");
      await enterApp(data.user);
    } else {
      authMessage("Account created. Check your email to confirm it, then sign in.");
    }
  } catch (error) { authMessage(error?.message || "Could not create the account. Try again.", true); }
});

$("authForm").addEventListener("submit", (event) => { event.preventDefault(); $("signInBtn").click(); });

$("previewBtn").addEventListener("click", () => {
  $("authGate").hidden = true;
  $("appShell").hidden = false;
  showMessage("Preview mode — sign in before saving books.");
});

$("avatarBtn").addEventListener("click", async () => {
  if (!confirm("Sign out of Jazzy's Books?")) return;
  await db.auth.signOut();
  leaveApp();
});

(async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    try {
      await enterApp(session.user);
    } catch (error) {
      authMessage(error?.message || "Could not load the library.", true);
      leaveApp();
    }
  } else {
    leaveApp();
  }
})();
