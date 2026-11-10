// Both summaries share one column layout and enough space for the largest values.
(() => {
  const tables = [...document.querySelectorAll('.city-potential-table')];
  let pending = false;
  function updateWidths() {
    pending = false;
    const longest = selector => Math.max(3, ...tables.flatMap(table =>
      [...table.querySelectorAll(selector)].map(cell => cell.textContent.trim().length)));
    const countWidth = longest('.city-potential-count, tbody tr > :nth-child(2), tfoot tr > :nth-child(2)');
    const unitsWidth = longest('.city-potential-units, tbody tr > :nth-child(3), tfoot tr > :nth-child(3)');
    tables.forEach(table => {
      table.style.setProperty('--city-potential-count-width', countWidth + 'ch');
      table.style.setProperty('--city-potential-units-width', unitsWidth + 'ch');
    });
  }
  function scheduleUpdate() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(updateWidths);
  }
  const observer = new MutationObserver(scheduleUpdate);
  tables.forEach(table => observer.observe(table, {childList: true, subtree: true, characterData: true}));
  scheduleUpdate();
})();
