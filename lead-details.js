const leadDetailsDialog = document.querySelector('#leadDetails');
const leadDetailsTitle = document.querySelector('#leadDetailsTitle');
const leadDetailsInfo = document.querySelector('#leadDetailsInfo');
const leadDetailsRows = document.querySelector('#leadDetailsRows');
const moreLeadDetails = document.querySelector('#moreLeadDetails');
const leadDetailLabels = {contract:'Gestattung',unworked:'Nicht ermittelt',owner:'Eigentümer im Objekt',hv:'Hausverwaltung',onsite:'To-dos vor Ort'};
let activeLeadDetail = null, leadDetailRecords = [], visibleLeadCount = 0;
let contractedLeadIds = new Set();
const normalizeAdsId = value => String(value ?? '').trim().toLocaleUpperCase('de-DE');
const existingContractStatuses = new Set(['Vertrag abgeschlossen','Vertrag online abgeschlossen','Vertrag bei anderem MB']);
function collectContractedLeadIds(records) {
  return new Set(records.filter(row=>existingContractStatuses.has(row[4]) && normalizeAdsId(row[9])).map(row=>normalizeAdsId(row[9])));
}
function hasExistingContract(row, ids) {
  const id=normalizeAdsId(row[9]);
  return Boolean(id && ids.has(id));
}
const addressCollator = new Intl.Collator('de-DE',{numeric:true,sensitivity:'base'});
function compareLeadAddresses(a,b) {
  const postal = value => /^\d{1,5}$/.test(value||'') ? value.padStart(5,'0') : (value||'');
  for(const [left,right] of [[postal(a[13]),postal(b[13])],[a[1],b[1]],[a[10],b[10]],[a[11],b[11]],[a[12],b[12]]]) {
    const x=String(left||'').trim(), y=String(right||'').trim();
    if(!x && y)return 1;
    if(x && !y)return -1;
    const comparison=addressCollator.compare(x,y);
    if(comparison)return comparison;
  }
  return 0;
}
function compareGestattungLeads(a,b) {
  const left=String(a[2]||'').trim(), right=String(b[2]||'').trim();
  if(!left && right)return 1;
  if(left && !right)return -1;
  return addressCollator.compare(left,right) || compareLeadAddresses(a,b);
}

function matchesLeadDetail(row, category) {
  const status=row[4], determined=row[5], residence=row[6];
  const blank=!status, unworked=blank&&(!determined||determined==='nein');
  const inProgress=typeTodoStatuses.has(status)||(blank&&determined==='ja');
  if(category==='contract')return status==='Vertrag abgeschlossen';
  if(category==='unworked')return unworked;
  if(category==='owner')return inProgress&&residence==='ja';
  if(category==='hv')return inProgress&&(residence==='nein'||residence==='');
  if(category==='onsite')return (inProgress&&residence==='ja')||unworked;
  return false;
}
function appendLeadDetails() {
  const next=Math.min(visibleLeadCount+100,leadDetailRecords.length);
  const fragment=document.createDocumentFragment();
  for(const row of leadDetailRecords.slice(visibleLeadCount,next)) {
    const tr=document.createElement('tr');
    const postal=/^\d{1,5}$/.test(row[13]||'') ? row[13].padStart(5,'0') : row[13]||'';
    const street=[row[10],row[11],row[12]].filter(Boolean).join(' ');
    const location=[postal,row[1]].filter(Boolean).join(' ');
    const values=[row[2]||'Nicht zugeordnet',row[9]||'–',number(row[3]),[street,location].filter(Boolean).join(', ')||'–',row[4]||'Ohne Bemerkung'];
    if(activeLeadDetail!=='contract') values.push(hasExistingContract(row,contractedLeadIds) ? '✓' : '–');
    const detailRow=document.createElement('tr');detailRow.className='lead-expanded-row';detailRow.hidden=true;
    const arrowCell=document.createElement('td');arrowCell.className='lead-arrow-cell';arrowCell.setAttribute('aria-hidden','true');
    const detailCell=document.createElement('td');detailCell.colSpan=values.length-1;
    const fields=document.createElement('dl');fields.className='lead-extra-fields';
    [['ET ermittelt',row[5]],['ET im Objekt',row[6]],['ET kontaktiert',row[15]],['Termin',row[16]],['Notiz',row[17]]].forEach(([label,value])=>{const group=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value||'–';group.append(term,description);fields.append(group);});
    detailCell.append(fields);detailRow.append(arrowCell,detailCell);
    let toggle;
    values.forEach((value,index)=>{const td=document.createElement('td');if(index===1){toggle=document.createElement('button');toggle.type='button';toggle.className='lead-row-toggle';toggle.textContent=`${value} ▾`;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label',`Details für ADS-ID ${value} anzeigen`);td.append(toggle);}else {td.textContent=value;if(index===5){td.className='contract-indicator';td.setAttribute('aria-label',value==='✓'?'Vertrag in geladenen Listen vorhanden':'Kein Vertrag in geladenen Listen gefunden');td.title=value==='✓'?'Vertrag für diese ADS-ID in geladenen Listen gefunden':'Kein Vertrag für diese ADS-ID in geladenen Listen gefunden';}}tr.append(td);});
    const toggleDetails=()=>{detailRow.hidden=!detailRow.hidden;tr.classList.toggle('is-expanded',!detailRow.hidden);toggle.setAttribute('aria-expanded',String(!detailRow.hidden));toggle.textContent=`${values[1]} ${detailRow.hidden?'▾':'▴'}`;};
    toggle.addEventListener('click',event=>{event.stopPropagation();toggleDetails();});
    tr.className='lead-main-row';tr.addEventListener('click',toggleDetails);
    fragment.append(tr,detailRow);
  }
  leadDetailsRows.append(fragment);visibleLeadCount=next;
  moreLeadDetails.hidden=visibleLeadCount>=leadDetailRecords.length;
  leadDetailsInfo.textContent=`${number(leadDetailRecords.length)} Leads · ${number(visibleLeadCount)} angezeigt${activeLeadDetail==='contract'?'':' · Vertragsabgleich anhand der ADS-ID in allen geladenen Listen'}`;
}
function refreshLeadDetails() {
  if(!leadDetailsDialog.open||!activeLeadDetail)return;
  leadDetailsRows.replaceChildren();visibleLeadCount=0;moreLeadDetails.hidden=true;
  document.querySelector('#contractIndicatorHeader').hidden=activeLeadDetail==='contract';
  document.querySelector('#exportLeadDetails').hidden=activeLeadDetail==='contract' || !citySelect.value || citySelect.value==='all';
  document.querySelector('#exportLeadDetails').disabled=liveRecords===null || !citySelect.value || citySelect.value==='all';
  if(liveRecords===null){leadDetailsInfo.textContent='Für die Einzelansicht bitte zuerst die Beraterlisten über OneDrive vollständig einlesen.';return;}
  contractedLeadIds=collectContractedLeadIds(liveRecords);
  leadDetailRecords=typeRecords().filter(row=>matchesLeadDetail(row,activeLeadDetail)).sort(activeLeadDetail==='contract'?compareGestattungLeads:compareLeadAddresses);
  appendLeadDetails();
}
window.refreshLeadDetails=refreshLeadDetails;
document.querySelectorAll('.detail-trigger').forEach(trigger=>{
  const open=()=>{activeLeadDetail=trigger.dataset.detail;leadDetailsTitle.textContent=leadDetailLabels[activeLeadDetail];leadDetailsDialog.showModal();refreshLeadDetails();};
  trigger.addEventListener('click',open);
  trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
});
document.querySelector('#closeLeadDetails').addEventListener('click',()=>leadDetailsDialog.close());
moreLeadDetails.addEventListener('click',appendLeadDetails);
