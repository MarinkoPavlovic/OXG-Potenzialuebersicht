(() => {
  'use strict';
  let selectedMonth = '', selectedAdvisor = '';
  const chart = document.querySelector('#contractMonthChart');
  const detail = document.querySelector('#contractMonthDetail');
  const empty = document.querySelector('#contractMonthEmpty');
  const fmt = new Intl.NumberFormat('de-DE');
  const label = key => new Intl.DateTimeFormat('de-DE', {month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(`${key}-01T00:00:00Z`));
  function latestDate(value) {
    let latest = '';
    const text = String(value || '');
    const pattern = /(?:\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{4}|\d{2})(?!\d))/g;
    for (const m of text.matchAll(pattern)) {
      const year = m[1] ? +m[1] : (m[6].length === 2 ? 2000 + +m[6] : +m[6]);
      const month = +(m[2] || m[5]), day = +(m[3] || m[4]);
      const d = new Date(Date.UTC(year, month - 1, day));
      if (year < 1900 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) continue;
      const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if (iso > latest) latest = iso;
    }
    return latest;
  }
  function group(rows, index) {
    const groups = new Map();
    for (const r of rows) { const name = r[index] || 'Nicht zugeordnet'; const g = groups.get(name) || {name, count:0, units:0, rows:[]}; g.count++; g.units += Number(r[3]) || 0; g.rows.push(r); groups.set(name, g); }
    return [...groups.values()].sort((a,b) => a.name.localeCompare(b.name, 'de', {sensitivity:'base', numeric:true}));
  }
  function text(tag, value, className) { const el=document.createElement(tag); el.textContent=value; if(className)el.className=className; return el; }
  function showDetails(rows) {
    detail.replaceChildren();
    if (!selectedMonth) return;
    const monthRows=rows.filter(x=>x.date.slice(0,7)===selectedMonth).map(x=>x.row);
    if (!monthRows.length) { selectedMonth=''; selectedAdvisor=''; return; }
    detail.append(text('h3', `Berater · ${label(selectedMonth)}`));
    for(const g of group(monthRows,2)) {
      const button=text('button', `${g.name}  ·  ${fmt.format(g.count)} Objekte (${fmt.format(g.units)} WE)`, 'contract-detail-advisor');
      button.type='button'; button.setAttribute('aria-expanded',String(selectedAdvisor===g.name));
      button.addEventListener('click',()=>{selectedAdvisor=selectedAdvisor===g.name?'':g.name; showDetails(rows);}); detail.append(button);
      if(selectedAdvisor===g.name) {
        const list=document.createElement('ul'); list.className='contract-detail-cities';
        for(const city of group(g.rows,1)) list.append(text('li', `${city.name}  ·  ${fmt.format(city.count)} Objekte (${fmt.format(city.units)} WE)`));
        detail.append(list);
      }
    }
  }
  window.refreshContractMonth = () => {
    const year=yearSelect.value, month=monthSelect.value;
    const rows=typeRecords({ignoreYear:true,ignoreMonth:true}).filter(r=>r[4]==='Vertrag abgeschlossen').map(row=>({row,date:latestDate(row[17])})).filter(x=>x.date && (!year || year==='all' || x.date.startsWith(year+'-')) && (!month || month==='all' || x.date.slice(0,7)===month));
    const groups=new Map();
    for(const x of rows) {const key=x.date.slice(0,7), g=groups.get(key)||{count:0,units:0};g.count++;g.units+=Number(x.row[3])||0;groups.set(key,g);}
    const entries=[...groups].sort((a,b)=>a[0].localeCompare(b[0])); const max=Math.max(1,...entries.map(x=>x[1].count));
    chart.replaceChildren(); empty.hidden=entries.length>0;
    for(const [key,g] of entries) {
      const button=document.createElement('button'); button.type='button'; button.className='contract-month-bar'; button.setAttribute('aria-pressed',String(selectedMonth===key));
      button.append(text('span',`${fmt.format(g.count)} (${fmt.format(g.units)} WE)`,'contract-month-value'));
      const area=document.createElement('span');area.className='contract-month-bar-area';const bar=document.createElement('span');bar.className='contract-month-bar-fill';bar.style.height=`${Math.max(3,g.count/max*100)}%`;area.append(bar);button.append(area,text('span',label(key),'contract-month-label'));
      button.addEventListener('click',()=>{selectedMonth=selectedMonth===key?'':key;selectedAdvisor='';window.refreshContractMonth();});chart.append(button);
    }
    showDetails(rows);
  };
  window.refreshContractMonth();
})();
