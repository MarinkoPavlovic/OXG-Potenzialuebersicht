(() => {
  'use strict';
  let selectedMonth = '', selectedAdvisor = '';
  const chart = document.querySelector('#contractMonthChart');
  const detail = document.querySelector('#contractMonthDetail');
  const detailPanel = document.querySelector('#contractDetailPanel');
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
  function legend() {
    const el=document.createElement('div'); el.className='contract-legend';
    el.append(text('span','Objekte','contract-legend-objects'),text('span','Wohneinheiten','contract-legend-units'));
    return el;
  }
  function horizontalRow(g, max, isAdvisor) {
    const row=document.createElement(isAdvisor?'button':'div'); row.className='contract-horizontal-row';
    if(isAdvisor) { row.type='button'; row.setAttribute('aria-expanded',String(selectedAdvisor===g.name)); }
    row.append(text('span',`${g.name}${isAdvisor?' ▾':''}`,'contract-horizontal-name'));
    const tracks=document.createElement('span'); tracks.className='contract-horizontal-tracks';
    for(const [value,kind] of [[g.count,'objects'],[g.units,'units']]) {
      const line=document.createElement('span'); line.className='contract-horizontal-line';
      const fill=document.createElement('span'); fill.className=`contract-horizontal-fill ${kind}`; fill.style.width=`${value/max*100}%`;
      const valueLabel=text('span',fmt.format(value),'contract-horizontal-number');
      valueLabel.style.left=`${value/max*100}%`;
      line.append(fill,valueLabel); tracks.append(line);
    }
    row.append(tracks);
    return row;
  }
  function showDetails(rows) {
    detail.replaceChildren();
    detailPanel.hidden = false;
    let monthRows=rows.filter(x=>!selectedMonth || x.date.slice(0,7)===selectedMonth).map(x=>x.row);
    if (selectedMonth && !monthRows.length) { selectedMonth=''; selectedAdvisor=''; monthRows=rows.map(x=>x.row); }
    detail.append(text('h3', selectedMonth ? `Berater · ${label(selectedMonth)}` : 'Gestattungen nach Berater'));
    detail.append(legend());
    if (!monthRows.length) { detail.append(text('p','Für diese Auswahl liegen keine Gestattungen mit gültigem Datum vor.')); return; }
    const advisors=group(monthRows,2);
    const advisorMax=Math.max(1,...advisors.flatMap(g=>[g.count,g.units]));
    for(const g of advisors) {
      const button=horizontalRow(g,advisorMax,true);
      button.addEventListener('click',()=>{selectedAdvisor=selectedAdvisor===g.name?'':g.name; showDetails(rows);}); detail.append(button);
      if(selectedAdvisor===g.name) {
        const cities=group(g.rows,1), cityMax=Math.max(1,...cities.flatMap(city=>[city.count,city.units]));
        const list=document.createElement('div'); list.className='contract-detail-cities';
        list.append(text('h4',`Orte · ${g.name}`));
        for(const city of cities) list.append(horizontalRow(city,cityMax,false));
        detail.append(list);
      }
    }
  }
  window.refreshContractMonth = () => {
    const year=yearSelect.value, month=monthSelect.value;
    const rows=typeRecords({ignoreYear:true,ignoreMonth:true}).filter(r=>r[4]==='Vertrag abgeschlossen').map(row=>({row,date:latestDate(row[17])})).filter(x=>x.date && (!year || year==='all' || x.date.startsWith(year+'-')) && (!month || month==='all' || x.date.slice(0,7)===month));
    const groups=new Map();
    for(const x of rows) {const key=x.date.slice(0,7), g=groups.get(key)||{count:0,units:0};g.count++;g.units+=Number(x.row[3])||0;groups.set(key,g);}
    const entries=[...groups].sort((a,b)=>a[0].localeCompare(b[0]));
    const maximum=Math.max(1,...entries.flatMap(([,g])=>[g.count,g.units]));
    const step=Math.max(1,Math.pow(10,Math.floor(Math.log10(maximum/4)))); const axisMax=Math.ceil(maximum/step/4)*4*step;
    chart.replaceChildren(); empty.hidden=entries.length>0;
    if(!entries.length){showDetails(rows);return;}
    chart.append(legend());
    const scroll=document.createElement('div');scroll.className='contract-chart-scroll';
    const plot=document.createElement('div');plot.className='contract-chart-plot';
    const axis=document.createElement('div');axis.className='contract-chart-axis';
    for(let i=4;i>=0;i--)axis.append(text('span',fmt.format(Math.round(axisMax*i/4))));
    const columns=document.createElement('div');columns.className='contract-chart-columns';
    for(const [key,g] of entries) {
      const button=document.createElement('button'); button.type='button'; button.className='contract-month-bar'; button.setAttribute('aria-pressed',String(selectedMonth===key));
      button.setAttribute('aria-label',`${label(key)}: ${fmt.format(g.count)} Objekte, ${fmt.format(g.units)} Wohneinheiten`);
      const area=document.createElement('span');area.className='contract-month-bar-area';
      for(const [value,kind] of [[g.count,'objects'],[g.units,'units']]) {
        const column=document.createElement('span');column.className='contract-month-column';column.style.height=`${value/axisMax*100}%`;
        column.append(text('span',fmt.format(value),'contract-month-value'));
        const fill=document.createElement('span');fill.className=`contract-month-bar-fill ${kind}`;column.append(fill);area.append(column);
      }
      button.append(area,text('span',`${key.slice(5,7)}-${key.slice(2,4)}`,'contract-month-label'));
      button.addEventListener('click',()=>{selectedMonth=selectedMonth===key?'':key;selectedAdvisor='';window.refreshContractMonth();});columns.append(button);
    }
    plot.append(axis,columns);scroll.append(plot);chart.append(scroll);
    showDetails(rows);
  };
  window.refreshContractMonth();
})();
