// Keep both summaries aligned with the advisor table, including after filter changes.
(() => {
  const advisorTable = document.querySelector('.advisor-table');
  const potentialTable = document.querySelector('.city-potential-table');
  const potentialColumns = [...potentialTable.querySelectorAll('col')];
  let pending = false;

  function alignColumns() {
    pending = false;
    const headers = [...advisorTable.querySelectorAll('thead th')];
    const widths = headers.map(header => header.getBoundingClientRect().width);
    if (widths.length !== 8 || !widths.every(width => width > 0)) {
      potentialTable.style.removeProperty('width');
      potentialColumns.forEach(column => column.style.removeProperty('width'));
      return;
    }
    const rateWidth = parseFloat(getComputedStyle(potentialTable.querySelector('.city-potential-rate-col')).width);
    potentialTable.style.width = advisorTable.getBoundingClientRect().width + 'px';
    widths.slice(0, 3).forEach((width, index) => {
      potentialColumns[index].style.width = width + 'px';
    });
    widths.slice(3).forEach((width, index) => {
      const rate = Math.min(Number.isFinite(rateWidth) ? rateWidth : 42, width / 3);
      const count = (width - rate) / 2;
      const offset = 3 + index * 3;
      potentialColumns[offset].style.width = count + 'px';
      potentialColumns[offset + 1].style.width = (width - count - rate) + 'px';
      potentialColumns[offset + 2].style.width = rate + 'px';
    });
  }

  function scheduleAlignment() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(alignColumns);
  }
  new ResizeObserver(scheduleAlignment).observe(advisorTable);
  new MutationObserver(scheduleAlignment).observe(advisorTable, {childList: true, subtree: true});
  window.addEventListener('resize', scheduleAlignment);
  scheduleAlignment();
})();
