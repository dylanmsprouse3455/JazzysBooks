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