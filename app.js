const data = {};
const months = Object.keys(data);
const yearSelect = document.querySelector('#yearSelect');
const monthSelect = document.querySelector('#monthSelect');
const citySelect = document.querySelector('#citySelect');
const advisorSelect = document.querySelector('#advisorSelect');
const advisorOptions = document.querySelector('#advisorOptions');
const advisorSummary = document.querySelector('#advisorSummary');
const advisorPicker = document.querySelector('.advisor-picker');
let advisorCloseTimer;
advisorPicker.addEventListener('mouseleave',()=>{advisorCloseTimer=setTimeout(()=>{advisorPicker.open=false;},250);});
advisorPicker.addEventListener('mouseenter',()=>clearTimeout(advisorCloseTimer));
const selectedAdvisors = new Set();
const rateBasis = document.querySelector('#rateBasis');
const leadTypeSelect = document.querySelector('#leadTypeSelect');
const closedByCity = {};
const closedByAdvisor = {};
const advisors = {};
const fields = ['contract','online','open','unresolved','interest','docs','appointment','send'];
const labels = {contract:'Vertrag abgeschlossen',online:'Vertrag online abgeschlossen',open:'Nicht ermittelt',unresolved:'ET nicht ermittelbar',interest:'Kein Interesse',docs:'Unterlagen beim Kunden',appointment:'Termin mit Kunden',send:'Unterlagen zusenden'};
const number = n => new Intl.NumberFormat('de-DE').format(n);
const pct = (a,b) => b ? `${Math.round(a / b * 100)} %` : '0 %';
const nonmarketableStatuses = new Set(['ET nicht ermittelbar','GF bei anderem Anbieter','Objekt existiert nicht','Vertrag bei anderem MB','GK Objekt','MHV grau','Vertrag online abgeschlossen']);
const typeStatusKeys = {'Vertrag abgeschlossen':'contract','Vertrag online abgeschlossen':'online','ET nicht ermittelbar':'unresolved','ET hat kein Interesse':'interest','Unterlagen beim Kunden':'docs','Termin mit Kunden':'appointment','Unterlagen zusenden':'send'};
const typeTodoStatuses = new Set(['Unterlagen beim Kunden','Termin mit Kunden','Unterlagen zusenden']);
let liveRecords = [];
let liveAvailableYears = null;
function useRecords() { return liveRecords !== null || leadTypeSelect.value !== 'all' || selectedAdvisors.size > 0; }
function typeRecords({ignoreYear=false,ignoreMonth=false,ignoreCity=false,ignoreAdvisor=false,ignoreLeadType=false}={}) {
  return (liveRecords ?? leadTypeRecords).filter(r => (ignoreLeadType || !leadTypeSelect.value || leadTypeSelect.value === 'all' || (leadTypeSelect.value === 'new' ? r[7] : r[8])) && (ignoreYear || !yearSelect.value || yearSelect.value === 'all' || (liveRecords !== null ? r[0].startsWith(yearSelect.value+'-') : yearSelect.value === '2026')) && (ignoreMonth || !monthSelect.value || monthSelect.value === 'all' || r[0] === monthSelect.value) && (ignoreCity || !citySelect.value || citySelect.value === 'all' || r[1] === citySelect.value) && (ignoreAdvisor || selectedAdvisors.size === 0 || selectedAdvisors.has(r[2])));
}
function typeRollup(records) {
  const row={t:0,w:0,contractW:0,onlineW:0,openW:0,unresolvedW:0,closed:0};
  records.forEach(r=>{const [, , ,we,status,determined]=r; row.t++; row.w+=we; const key=typeStatusKeys[status]; if(key){row[key]=(row[key]||0)+1;row[key+'W']=(row[key+'W']||0)+we;} if(!status && (determined==='nein'||!determined)){row.open=(row.open||0)+1;row.openW+=we;} if(nonmarketableStatuses.has(status)||status==='ET hat kein Interesse')row.closed++;});
  return row;
}
function typeTodoTotals(records) {
  const result=Object.fromEntries(['owner','hv','onsite','docs','appointment','send','blank','unworked'].map(k=>[k,[0,0]]));
  records.forEach(r=>{const we=r[3],status=r[4],determined=r[5],residence=r[6];const blank=!status,unworked=blank&&(!determined||determined==='nein'),inProgress=typeTodoStatuses.has(status)||(blank&&determined==='ja');const add=k=>{result[k][0]++;result[k][1]+=we;};if(unworked)add('unworked');if(inProgress&&['ja','nein',''].includes(residence)){add(residence==='ja'?'owner':'hv');add(typeStatusKeys[status]||'blank');}if((inProgress&&residence==='ja')||unworked)add('onsite');});
  return result;
}
function advisorDistribution() {
  const totals = new Map();
  const add = (name, leads, units) => {
    name = name || 'Nicht zugeordnet';
    const row = totals.get(name) || {name, leads:0, units:0};
    row.leads += leads; row.units += units; totals.set(name, row);
  };
  if (useRecords()) typeRecords().forEach(r => add(r[2], 1, r[3]));
  else {
    const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value];
    selectedMonths.forEach(month => Object.entries(advisorCityDataAll[month] || {}).forEach(([city, advisors]) => {
      if (citySelect.value !== 'all' && citySelect.value !== city) return;
      Object.entries(advisors).forEach(([name, row]) => {
        if (advisorSelect.value === 'all' || advisorSelect.value === name) add(name, row.t || 0, row.w || 0);
      });
    }));
  }
  return [...totals.values()].sort((a,b) => b.leads-a.leads || a.name.localeCompare(b.name,'de'));
}
function advisorsForMonth(month) {
  const total = {};
  Object.values(advisorCityDataAll[month] || {}).forEach(cityRows => Object.entries(cityRows).forEach(([name,row]) => {
    total[name] ||= {t:0,contract:0,online:0,open:0,unresolved:0,interest:0,docs:0,appointment:0,send:0,closed:0,w:0,contractW:0,onlineW:0,openW:0,unresolvedW:0};
    Object.keys(total[name]).forEach(key => total[name][key] += row[key] || 0);
  }));
  return total;
}

function fillMonths() {
  const selected = monthSelect.value || 'all';
  let availableMonths = months.filter(month => yearSelect.value === 'all' || (liveRecords !== null ? month.startsWith(yearSelect.value+'-') : yearSelect.value === '2026'));
  if (useRecords()) {
    const monthsWithMatches = new Set(typeRecords({ignoreMonth:true}).map(row=>row[0]));
    availableMonths = availableMonths.filter(month=>monthsWithMatches.has(month));
  } else if (citySelect.value && citySelect.value !== 'all') availableMonths = availableMonths.filter(month=>Boolean(data[month]?.[citySelect.value]));
  monthSelect.replaceChildren();
  monthSelect.add(new Option('Alle Monate', 'all'));
  availableMonths.forEach(month => monthSelect.add(new Option(monthLabel(month, yearSelect.value !== 'all'), month)));
  monthSelect.value = availableMonths.includes(selected) ? selected : 'all';
}
function fillYears() {
  const selected = yearSelect.value || 'all';
  const matches = typeRecords({ignoreYear:true});
  const unfiltered = (!monthSelect.value || monthSelect.value === 'all') && (!citySelect.value || citySelect.value === 'all') && (!leadTypeSelect.value || leadTypeSelect.value === 'all') && selectedAdvisors.size === 0;
  const years = liveRecords !== null && unfiltered && liveAvailableYears ? liveAvailableYears : [...new Set(matches.map(r=>liveRecords !== null ? r[0].slice(0,4) : '2026'))].sort((a,b)=>b.localeCompare(a));
  yearSelect.replaceChildren(new Option('Alle Jahre', 'all'));
  years.forEach(year=>yearSelect.add(new Option(year,year)));
  yearSelect.value = years.includes(selected) ? selected : 'all';
}
function fillLeadTypes() {
  const selected=leadTypeSelect.value || 'all';
  const rows=typeRecords({ignoreLeadType:true});
  const available=[['all','Alle Leads']];
  if(rows.some(row=>row[7]))available.push(['new','Neue Leads']);
  if(rows.some(row=>row[8]))available.push(['old','Alte Leads']);
  leadTypeSelect.replaceChildren();
  available.forEach(([value,label])=>leadTypeSelect.add(new Option(label,value)));
  leadTypeSelect.value=available.some(([value])=>value===selected)?selected:'all';
}
function reconcileFilters() {
  for(let i=0;i<2;i++){fillYears();fillMonths();fillCities();fillAdvisors();fillLeadTypes();}
}
function monthLabel(value, omitYear=false) { const match=/^(\d{4})-(\d{2})$/.exec(value); return match ? `${['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][Number(match[2])-1]}${omitYear?'':` ${match[1]}`}` : value; }
function fillCities() {
  const chosen = citySelect.value;
  citySelect.replaceChildren(new Option('Alle Orte', 'all'));
  if (useRecords()) {
    const cities = [...new Set(typeRecords({ignoreCity:true}).map(r=>r[1]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
    cities.forEach(city=>citySelect.add(new Option(city,city))); citySelect.value=cities.includes(chosen)?chosen:'all'; return;
  }
  const cities = monthSelect.value === 'all' ? [...new Set(months.flatMap(month => Object.keys(data[month])))] : Object.keys(data[monthSelect.value]);
  cities.sort((a,b)=>a.localeCompare(b,'de')).forEach(city => citySelect.add(new Option(city, city)));
  citySelect.value = cities.includes(chosen) ? chosen : 'all';
}
function fillAdvisors() {
  const names=[...new Set(typeRecords({ignoreAdvisor:true}).map(r=>r[2]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  for(const chosen of selectedAdvisors) if(!names.includes(chosen))selectedAdvisors.delete(chosen);
  advisorOptions.replaceChildren();
  const allLabel=document.createElement('label'), allInput=document.createElement('input');
  allInput.type='checkbox';allInput.setAttribute('aria-label','Alle Berater');allInput.checked=selectedAdvisors.size===0;
  allLabel.append(allInput,document.createTextNode('Alle Berater'));advisorOptions.append(allLabel);
  allInput.addEventListener('change',()=>{selectedAdvisors.clear();reconcileFilters();render();});
  names.forEach(name=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label',name);input.value=name;input.checked=selectedAdvisors.has(name);label.append(input,document.createTextNode(name));advisorOptions.append(label);input.addEventListener('change',()=>{if(input.checked)selectedAdvisors.add(name);else selectedAdvisors.delete(name);reconcileFilters();render();});});
  advisorSummary.textContent=selectedAdvisors.size===0?'Alle Berater':selectedAdvisors.size===1?[...selectedAdvisors][0]:`${selectedAdvisors.size} ausgewählt`;
  advisorSelect.replaceChildren(new Option('Alle Berater','all'));advisorSelect.value='all';
}
function selectedRows() {
  if (useRecords()) return [typeRollup(typeRecords())];
  if (advisorSelect.value !== 'all' && advisorCityDataAll[monthSelect.value]) {
    const advisorRow = citySelect.value === 'all' ? advisorsForMonth(monthSelect.value)[advisorSelect.value] : advisorCityDataAll[monthSelect.value]?.[citySelect.value]?.[advisorSelect.value];
    return advisorRow ? [advisorRow] : [];
  }
  const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value];
  return selectedMonths.flatMap(month => citySelect.value === 'all' ? Object.values(data[month]) : data[month][citySelect.value] ? [data[month][citySelect.value]] : []);
}
function totals() {
  const sum = {t:0};
  selectedRows().forEach(row => { sum.t += row.t; fields.forEach(key => sum[key] = (sum[key] || 0) + (row[key] || 0)); });
  sum.other = Math.max(0, sum.t - fields.reduce((total,key) => total + (sum[key] || 0), 0));
  return sum;
}
function closedTotal() {
  if (useRecords()) return typeRollup(typeRecords()).closed;
  if (advisorSelect.value !== 'all' && advisorCityDataAll[monthSelect.value]) {
    const advisorRow = citySelect.value === 'all' ? advisorsForMonth(monthSelect.value)[advisorSelect.value] : advisorCityDataAll[monthSelect.value]?.[citySelect.value]?.[advisorSelect.value];
    return advisorRow?.closed || 0;
  }
  const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value];
  return selectedMonths.reduce((sum, month) => sum + (citySelect.value === 'all' ? Object.values(closedByCity[month]).reduce((a,b)=>a+b,0) : (closedByCity[month][citySelect.value] || 0)), 0);
}
function unitTotals() {
  if (useRecords()) return typeRollup(typeRecords());
  const empty = {w:0,contractW:0,onlineW:0,openW:0,unresolvedW:0};
  if (advisorSelect.value !== 'all' && advisorCityDataAll[monthSelect.value]) return citySelect.value === 'all' ? advisorsForMonth(monthSelect.value)[advisorSelect.value] || empty : advisorCityDataAll[monthSelect.value]?.[citySelect.value]?.[advisorSelect.value] || empty;
  const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value];
  return selectedMonths.reduce((sum, month) => {
    const rows = citySelect.value === 'all' ? Object.values(weByCity[month] || {}) : [weByCity[month]?.[citySelect.value]].filter(Boolean);
    rows.forEach(row => Object.keys(empty).forEach(key => sum[key] += row[key] || 0));
    return sum;
  }, {...empty});
}
function statusUnitTotals() {
  const empty = {contract:0,online:0,open:0,unresolved:0,interest:0,docs:0,appointment:0,send:0,other:0};
  if (useRecords()) { const row=typeRollup(typeRecords()); Object.keys(empty).forEach(key=>empty[key]=row[key+'W']||0); return empty; }
  if (advisorSelect.value !== 'all') {
    const units = unitTotals();
    return {...empty,contract:units.contractW||0,online:units.onlineW||0,open:units.openW||0,unresolved:units.unresolvedW||0};
  }
  const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value];
  return selectedMonths.reduce((sum, month) => {
    const rows = citySelect.value === 'all' ? Object.values(statusUnitsByCity[month] || {}) : [statusUnitsByCity[month]?.[citySelect.value]].filter(Boolean);
    rows.forEach(row => Object.keys(empty).forEach(key => sum[key] += row[key] || 0));
    return sum;
  }, {...empty});
}
function nonMarketableTotals() {
  if (useRecords()) return typeRecords().filter(r=>nonmarketableStatuses.has(r[4])).reduce((sum,r)=>[sum[0]+1,sum[1]+r[3]],[0,0]);
  const month = monthSelect.value;
  if (advisorSelect.value !== 'all' && month !== 'all') {
    if (citySelect.value !== 'all') return nonMarketableData.advisor[month]?.[citySelect.value]?.[advisorSelect.value] || [0,0];
    return Object.values(nonMarketableData.advisor[month] || {}).reduce((sum,rows) => { const row=rows[advisorSelect.value]||[0,0]; return [sum[0]+row[0],sum[1]+row[1]]; },[0,0]);
  }
  const monthsToUse = month === 'all' ? months : [month];
  return monthsToUse.reduce((sum,currentMonth) => {
    const rows = citySelect.value === 'all' ? Object.values(nonMarketableData.city[currentMonth] || {}) : [nonMarketableData.city[currentMonth]?.[citySelect.value]].filter(Boolean);
    rows.forEach(row => { sum[0] += row[0]; sum[1] += row[1]; }); return sum;
  },[0,0]);
}
function nonMarketableBreakdown() {
  if (useRecords()) { const result={}; typeRecords().filter(r=>nonmarketableStatuses.has(r[4])).forEach(r=>{result[r[4]]||=[0,0];result[r[4]][0]++;result[r[4]][1]+=r[3];});return result; }
  const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value]; const result = {};
  selectedMonths.forEach(month => { const rows = citySelect.value === 'all' ? Object.values(nonMarketableDetails[month] || {}) : [nonMarketableDetails[month]?.[citySelect.value]].filter(Boolean); rows.forEach(row => Object.entries(row).forEach(([status,value]) => { result[status] ||= [0,0]; result[status][0] += value[0]; result[status][1] += value[1]; })); }); return result;
}
const metricValue = (objects, units) => `${number(objects)} <span class="metric-units">(${number(units)} WE)</span>`;
function todoTotals() {
  if (useRecords()) return typeTodoTotals(typeRecords());
  const result = {owner:[0,0], hv:[0,0], onsite:[0,0], docs:[0,0], appointment:[0,0], send:[0,0], blank:[0,0], unworked:[0,0]};
  const selectedMonths = monthSelect.value === 'all' ? months : [monthSelect.value];
  selectedMonths.forEach(month => {
    Object.entries(todoData[month] || {}).forEach(([city, advisors]) => {
      if (citySelect.value !== 'all' && city !== citySelect.value) return;
      Object.entries(advisors).forEach(([advisor, values]) => {
        if (advisorSelect.value !== 'all' && advisor !== advisorSelect.value) return;
        for (const key of Object.keys(result)) { result[key][0] += values[key][0]; result[key][1] += values[key][1]; }
      });
    });
  });
  return result;
}
function render() {
  if (window.refreshLeadDetails) window.refreshLeadDetails();
  const t = totals(); const city = citySelect.value;
  const monthSuffix = monthSelect.value === 'all' ? (yearSelect.value === 'all' ? '' : ` · ${yearSelect.value}`) : ` · ${monthLabel(monthSelect.value)}`;
  document.querySelector('#statusPanelTitle').textContent = `Bearbeitungsstand${monthSuffix}`;
  document.querySelector('#todoPanelTitle').textContent = `To-dos${monthSuffix}`;
  document.querySelector('#advisorPanelTitle').textContent = `Leads je Berater${monthSuffix}`;
  document.querySelector('#advisorPanel').hidden = monthSelect.value === 'all';
  const advisorRows = document.querySelector('#advisorRows');
  const advisorData = advisorDistribution();
  advisorRows.replaceChildren();
  advisorData.forEach(row => {
    const tr = document.createElement('tr');
    [row.name, number(row.leads), number(row.units)].forEach(value => { const cell=document.createElement('td'); cell.textContent=value; tr.append(cell); });
    advisorRows.append(tr);
  });
  document.querySelector('#advisorEmpty').hidden = advisorData.length !== 0;
  const units = unitTotals();
  const selectedCityAdvisorRows = !useRecords() && city !== 'all' && advisorSelect.value === 'all' ? Object.values(advisorCityDataAll[monthSelect.value]?.[city] || {}) : null;
  const gestattungCount = selectedCityAdvisorRows ? selectedCityAdvisorRows.reduce((sum,row)=>sum+(row.contract||0),0) : (t.contract||0);
  const gestattungUnits = selectedCityAdvisorRows ? selectedCityAdvisorRows.reduce((sum,row)=>sum+(row.contractW||0),0) : (units.contractW||0);
  const nonMarketable = nonMarketableTotals();
  const marketableLeads = Math.max(0, t.t - nonMarketable[0]);
  const statusUnits = statusUnitTotals();
  statusUnits.contract = gestattungUnits;
  const todo = todoTotals();
  t.open = todo.unworked[0];
  units.openW = todo.unworked[1];
  statusUnits.open = todo.unworked[1];
  const determinedMarketableLeads = Math.max(0, marketableLeads - t.open);
  const rateDenominator = rateBasis.checked ? determinedMarketableLeads : marketableLeads;
  const rateLabel = rateBasis.checked ? 'erm. Leads' : 'verm. Leads';
  const rateText = value => `${rateDenominator ? pct(value, rateDenominator) : '–'} der ${rateLabel}`;
  const inProgressCount = todo.owner[0] + todo.hv[0];
  const inProgressUnits = todo.owner[1] + todo.hv[1];
  document.querySelector('#todoOwner').innerHTML = metricValue(...todo.owner);
  document.querySelector('#todoHv').innerHTML = metricValue(...todo.hv);
  document.querySelector('#todoOnsite').innerHTML = metricValue(...todo.onsite);
  document.querySelector('#total').innerHTML = metricValue(t.t, units.w);
  document.querySelector('#marketableTotal').innerHTML = metricValue(marketableLeads, Math.max(0, units.w - nonMarketable[1]));
  document.querySelector('#scope').textContent = selectedAdvisors.size===1 ? [...selectedAdvisors][0] : selectedAdvisors.size>1 ? `${selectedAdvisors.size} Berater` : city === 'all' ? '' : city;
  document.querySelector('#contracts').innerHTML = metricValue(gestattungCount, gestattungUnits);
  document.querySelector('#contractRate').textContent = rateText(gestattungCount);
  document.querySelector('#open').innerHTML = metricValue(t.open||0, units.openW||0);
  document.querySelector('#openRate').textContent = `${marketableLeads ? pct(t.open||0,marketableLeads) : '–'} der verm. Leads`;
  document.querySelector('#unresolved').innerHTML = metricValue(nonMarketable[0], nonMarketable[1]);
  document.querySelector('#unresolvedRate').textContent = `${pct(nonMarketable[0],t.t)} des Gesamtpotenzials`;
  document.querySelector('#inProgress').innerHTML = metricValue(inProgressCount, inProgressUnits);
  document.querySelector('#inProgressRate').textContent = rateText(inProgressCount);
  document.querySelector('#noInterest').innerHTML = metricValue(t.interest||0, statusUnits.interest||0);
  document.querySelector('#noInterestRate').textContent = rateText(t.interest||0);
  const metricChartData = [
    ['Gestattung',gestattungCount,gestattungUnits,'#009f94',rateDenominator ? pct(gestattungCount,rateDenominator) : '–'],
    ['Nicht ermittelt',t.open||0,units.openW||0,'#849da0',marketableLeads ? pct(t.open||0,marketableLeads) : '–'],
    ['In Bearbeitung',inProgressCount,inProgressUnits,'#e8bb00',rateDenominator ? pct(inProgressCount,rateDenominator) : '–'],
    ['Kein Interesse',t.interest||0,statusUnits.interest||0,'#c75b63',rateDenominator ? pct(t.interest||0,rateDenominator) : '–'],
    ['Nicht vermarktbar',nonMarketable[0],nonMarketable[1],'#e34b4b',pct(nonMarketable[0],t.t)]
  ];
  const metricChartMax = Math.max(1,...metricChartData.map(row=>row[1]));
  const chartStep = Math.pow(10, Math.floor(Math.log10(metricChartMax / 4)));
  const chartTick = Math.ceil(metricChartMax / 4 / chartStep) * chartStep;
  const chartMax = chartTick * 4;
  document.querySelector('#metricChart').innerHTML = `<div class="chart-scene"><div class="chart-y-axis">${[4,3,2,1,0].map(n=>`<span>${number(chartTick*n)}</span>`).join('')}</div><div class="chart-columns"><div class="chart-wall chart-wall-main" aria-hidden="true"><div class="chart-back-grid"></div><div class="chart-floor"></div><div class="chart-side"></div></div><div class="chart-wall chart-wall-separated" aria-hidden="true"><div class="chart-back-grid"></div><div class="chart-floor"></div><div class="chart-side"></div></div>${metricChartData.map(([label,count,we,color,rate])=>`<div class="metric-column"><div class="metric-column-value" aria-hidden="true"></div><div class="metric-column-plot"><div class="metric-column-bar ${count?'has-value':''}" style="height:${count/chartMax*100}%;--column-color:${color}"><strong class="metric-column-percent">${rate}</strong></div></div><div class="metric-column-label">${label}</div><div class="metric-column-details">${number(count)} Leads <small>(${number(we)} WE)</small></div></div>`).join('')}</div></div>`;
  const closed = closedTotal() + gestattungCount; const closedPct = t.t ? Math.round(closed / t.t * 100) : 0;
  const progressColor = closedPct < 20 ? '#e34b4b' : closedPct < 40 ? '#f28c28' : closedPct < 60 ? '#ffdd00' : closedPct < 80 ? '#77be55' : '#087c5b';
  document.querySelector('#progressLabel').textContent = `${closedPct} % bearbeitet`;
  document.querySelector('#progressFill').style.width = `${closedPct}%`;
  document.querySelector('#progressFill').style.background = progressColor;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', closedPct);
  document.querySelector('#progressDetail').textContent = `${number(closed)} von ${number(t.t)} Leads`;
  const breakdown = Object.entries(nonMarketableBreakdown()).sort((a,b)=>b[1][0]-a[1][0]);
  const breakdownMax = breakdown[0]?.[1][0] || 1;
  const inProgressBreakdown = [['Unterlagen beim Kunden','docs'],['Termin mit Kunden','appointment'],['Unterlagen zusenden','send'],['Ohne Bemerkung','blank']].map(([label,key])=>[label,todo[key]]).filter(([,value])=>value[0]);
  const inProgressMax = inProgressBreakdown[0]?.[1][0] || 1;
  const status = [...fields.filter(key => !['unresolved','online','docs','appointment','send'].includes(key)).map(key => ({key,label:labels[key],value:key === 'contract' ? gestattungCount : t[key]||0,units:statusUnits[key]||0})),{key:'inprogress',label:'In Bearbeitung',value:inProgressCount,units:inProgressUnits},{key:'nonmarketable',label:'Nicht vermarktbar',value:nonMarketable[0],units:nonMarketable[1]}].filter(x=>x.value).sort((a,b)=>b.value-a.value).slice(0,8);
  const max = status[0]?.value || 1;
  const nonMarketableDetailsHtml = `<details class="nonmarketable-details"><summary aria-label="Einzelstatus aufklappen"></summary>${breakdown.map(([label,value])=>`<div class="detail-status"><div><span>${label}</span><b>${number(value[0])} <small>(${number(value[1])} WE)</small></b></div><div class="bar-track"><div class="bar-fill" style="width:${value[0]/breakdownMax*nonMarketable[0]/max*100}%;background:#ef8f8f"></div></div></div>`).join('')}</details>`;
  const inProgressDetailsHtml = `<details class="inprogress-details"><summary></summary>${inProgressBreakdown.map(([label,value])=>`<div class="detail-status"><div><span>${label}</span><b>${number(value[0])} <small>(${number(value[1])} WE)</small></b></div><div class="bar-track"><div class="bar-fill" style="width:${value[0]/inProgressMax*inProgressCount/max*100}%;background:#ffe772"></div></div></div>`).join('')}</details>`;
  document.querySelector('#statusBars').innerHTML = status.map(x => `<div class="bar-row ${x.key==='nonmarketable'||x.key==='inprogress'?'expandable-row':''}"><div><div class="bar-label">${x.key==='nonmarketable'||x.key==='inprogress'?`<button class="nonmarketable-toggle" onclick="const d=this.closest('.expandable-row').nextElementSibling;d.open=!d.open">${x.label}<span>▾</span></button>`:x.label}</div><div class="bar-track"><div class="bar-fill" style="width:${x.value/max*100}%;background:${x.key==='nonmarketable'||x.key==='online'||x.key==='interest'?'#e34b4b':x.key==='open'?'#ffffff':x.key==='inprogress'?'#ffdd00':x.key==='contract'?'#009f94':'#858b8b'}"></div></div></div><div class="bar-value">${number(x.value)} <small>(${number(x.units)} WE)</small></div></div>${x.key==='nonmarketable'?nonMarketableDetailsHtml:x.key==='inprogress'?inProgressDetailsHtml:''}`).join('');
  const mainStages = [{value:gestattungCount,color:'#009f94',id:'donePct',label:'Gestattung'},{value:t.open||0,color:'#4c6670',id:'openPct',label:'Nicht bearbeitet'},{value:inProgressCount,color:'#ffdd00',id:'progressPct',label:'In Bearbeitung'},{value:nonMarketable[0],color:'#e34b4b',id:'blockedPct',label:'Nicht vermarktbar'},{value:t.interest||0,color:'#b92f45',id:'interestPct',label:'ET kein Interesse'}];
  let cursor = 0; mainStages.forEach(stage => { cursor += t.t ? stage.value/t.t*100 : 0; document.querySelector(`#${stage.id}`).textContent = pct(stage.value,t.t); });
  const chartStages = [...mainStages,{value:Math.max(0,t.t-mainStages.reduce((sum,stage)=>sum+stage.value,0)),color:'#bcd9d2',label:''}].filter(stage=>stage.value);
  let angle=-90; const centerX=112,centerY=102,outerX=82,outerY=48,innerX=38,innerY=22,depth=38; const point=(deg,xRadius,yRadius,dx=0,dy=0)=>[centerX+xRadius*Math.cos(deg*Math.PI/180)+dx,centerY+yRadius*Math.sin(deg*Math.PI/180)+dy];
  document.querySelector('#donut').innerHTML = `<svg viewBox="-35 -46 310 310" aria-hidden="true">${chartStages.map(stage=>{const span=t.t?stage.value/t.t*360:0;const end=angle+span;const mid=(angle+end)/2*Math.PI/180;const dx=Math.cos(mid)*10,dy=Math.sin(mid)*6;const [ox1,oy1]=point(angle,outerX,outerY,dx,dy),[ox2,oy2]=point(end,outerX,outerY,dx,dy),[ix1,iy1]=point(angle,innerX,innerY,dx,dy),[ix2,iy2]=point(end,innerX,innerY,dx,dy);const large=span>180?1:0;const top=`M${ox1.toFixed(2)} ${oy1.toFixed(2)} A${outerX} ${outerY} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L${ix2.toFixed(2)} ${iy2.toFixed(2)} A${innerX} ${innerY} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;const outerWall=`M${ox1.toFixed(2)} ${oy1.toFixed(2)} A${outerX} ${outerY} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L${ox2.toFixed(2)} ${(oy2+depth).toFixed(2)} A${outerX} ${outerY} 0 ${large} 0 ${ox1.toFixed(2)} ${(oy1+depth).toFixed(2)} Z`;const innerWall=`M${ix2.toFixed(2)} ${iy2.toFixed(2)} A${innerX} ${innerY} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} L${ix1.toFixed(2)} ${(iy1+depth).toFixed(2)} A${innerX} ${innerY} 0 ${large} 1 ${ix2.toFixed(2)} ${(iy2+depth).toFixed(2)} Z`;const startWall=`M${ox1.toFixed(2)} ${oy1.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} L${ix1.toFixed(2)} ${(iy1+depth).toFixed(2)} L${ox1.toFixed(2)} ${(oy1+depth).toFixed(2)} Z`;const endWall=`M${ox2.toFixed(2)} ${oy2.toFixed(2)} L${ix2.toFixed(2)} ${iy2.toFixed(2)} L${ix2.toFixed(2)} ${(iy2+depth).toFixed(2)} L${ox2.toFixed(2)} ${(oy2+depth).toFixed(2)} Z`;const [lineX,lineY]=point((angle+end)/2,outerX+8,outerY+6,Math.cos(mid)*11,Math.sin(mid)*7);const labelX=centerX+Math.cos(mid)*122,labelY=centerY+Math.sin(mid)*88;const anchor=labelX<centerX-8?'end':labelX>centerX+8?'start':'middle';const connector=`<path class="slice-connector" d="M${lineX.toFixed(2)} ${lineY.toFixed(2)} L${labelX.toFixed(2)} ${labelY.toFixed(2)}" stroke="${stage.color}"/>`;const label=stage.label?`${connector}<text class="slice-label" x="${labelX.toFixed(2)}" y="${(labelY-3).toFixed(2)}" fill="${stage.color}" text-anchor="${anchor}"><tspan x="${labelX.toFixed(2)}" dy="0">${stage.label}</tspan><tspan class="slice-label-value" x="${labelX.toFixed(2)}" dy="12">${pct(stage.value,t.t)}</tspan></text>`:'';angle=end;return `<g class="pie-slice"><path class="slice-depth" d="${top}" fill="${stage.color}" transform="translate(0 ${depth})"/><path class="slice-side" d="${outerWall}" fill="${stage.color}"/><path class="slice-side" d="${innerWall}" fill="${stage.color}"/><path class="slice-wall" d="${startWall}" fill="${stage.color}"/><path class="slice-wall" d="${endWall}" fill="${stage.color}"/><path class="slice-top" d="${top}" fill="${stage.color}"/>${label}</g>`;}).join('')}</svg>`;
  const aggregateCities = {};
  if (useRecords()) typeRecords({ignoreCity:true}).forEach(r=>{if(r[1]) aggregateCities[r[1]]=(aggregateCities[r[1]]||0)+1;});
  else (monthSelect.value === 'all' ? months : [monthSelect.value]).forEach(month => Object.entries(data[month]).forEach(([name,row]) => aggregateCities[name] = (aggregateCities[name] || 0) + row.t));
  const cities = Object.entries(aggregateCities).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,6); const cityMax=cities[0]?.total||1;
  const cityPanelTitle = document.querySelector('#cityPanelTitle');
  const cityPanelSubtitle = document.querySelector('#cityPanelSubtitle');
  let cityAdvisors = city === 'all' ? null : advisorCityDataAll[monthSelect.value]?.[city];
  if (useRecords() && city !== 'all') {
    cityAdvisors={};
    typeRecords().forEach(r=>{if(!r[2])return;const row=cityAdvisors[r[2]]||={contract:0,contractW:0};if(r[4]==='Vertrag abgeschlossen'){row.contract++;row.contractW+=r[3];}});
  }
  if (cityAdvisors) {
    const gestattungen = Object.entries(cityAdvisors).map(([name,row]) => ({name,total:row.contract||0,units:row.contractW||0})).sort((a,b)=>b.total-a.total);
    const maxGestattungen = gestattungen[0]?.total || 1;
    cityPanelTitle.textContent = 'Gestattungen je Berater';
    cityPanelSubtitle.textContent = monthSelect.value === 'all' ? city : `${city} · ${monthLabel(monthSelect.value)}`;
    document.querySelector('#cities').innerHTML = gestattungen.map(x=>`<div class="city-row"><span>${x.name}</span><span>${number(x.total)} <small>(${number(x.units)} WE)</small></span><div class="city-bar"><i style="width:${x.total/maxGestattungen*100}%"></i></div></div>`).join('');
  } else {
    cityPanelTitle.textContent = `Potenzialverteilung${monthSuffix}`;
    cityPanelSubtitle.textContent = '';
    document.querySelector('#cities').innerHTML = advisorSelect.value !== 'all' && !useRecords() ? '<p class="subtitle">Die Ortsverteilung wird mit der vollständigen Datenanbindung ergänzt.</p>' : cities.map(x=>`<div class="city-row"><span>${x.name}</span><span>${number(x.total)}</span><div class="city-bar"><i style="width:${x.total/cityMax*100}%"></i></div></div>`).join('');
  }
}
yearSelect.addEventListener('change',()=>{monthSelect.value='all';reconcileFilters();render()});
monthSelect.addEventListener('change',()=>{reconcileFilters();render()}); citySelect.addEventListener('change',()=>{reconcileFilters();render()});
leadTypeSelect.addEventListener('change',()=>{reconcileFilters();render()});
rateBasis.addEventListener('change',render);
document.querySelector('#reset').addEventListener('click',()=>{yearSelect.value='all';monthSelect.value='all';leadTypeSelect.value='all';citySelect.value='all';selectedAdvisors.clear();rateBasis.checked=false;reconcileFilters();render()});
reconcileFilters(); render();
window.useLiveData = (records,selection={}) => { liveRecords=records; liveAvailableYears=selection.years ? [...new Set(selection.years.map(String))].sort((a,b)=>b.localeCompare(a)) : null; months.splice(0,months.length,...[...new Set(records.map(r=>r[0]))].sort()); yearSelect.value='all'; monthSelect.value='all';citySelect.value='all';leadTypeSelect.value='all';selectedAdvisors.clear();reconcileFilters();if(selection.year && selection.year!=='all' && records.some(r=>r[0].startsWith(selection.year+'-'))){yearSelect.value=selection.year;reconcileFilters();}render(); };
