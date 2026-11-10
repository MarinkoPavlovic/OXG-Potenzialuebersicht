// Fit the shared table layout to the available panel width, independent of filters.
(() => {
  const wrappers = document.querySelectorAll('.advisor-table-wrap, .city-potential-table-wrap');
  const fit = wrapper => {
    const table = wrapper.querySelector('.city-potential-table');
    const width = wrapper.clientWidth;
    if (!table || !width) return;
    table.style.setProperty('--summary-table-scale', String(Math.min(1, width / 1200)));
  };
  const observer = new ResizeObserver(entries => entries.forEach(entry => fit(entry.target)));
  wrappers.forEach(wrapper => { observer.observe(wrapper); fit(wrapper); });
})();
