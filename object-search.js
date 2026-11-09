const objectSearchInput=document.querySelector('#objectSearchInput');
const objectSearchInfo=document.querySelector('#objectSearchInfo');
const objectSearchResults=document.querySelector('#objectSearchResults');
const moreObjectResults=document.querySelector('#moreObjectResults');
let objectSearchMatches=[], visibleObjectResults=0;

function normalizeObjectAddress(value) {
  return String(value ?? '').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function findObjects(query) {
  const terms=normalizeObjectAddress(query).replace(/\b(\d+)\s+(\p{L})\b/gu,'$1$2').split(/\s+/).filter(Boolean);
  if(!terms.length || liveRecords===null)return [];
  return advisorRecords().filter(row=>{
    const address=normalizeObjectAddress([row[10],row[11],row[12],row[13],row[1]].filter(value=>value!==null&&value!==undefined).join(' '));
    const addressWords=address.split(/\s+/);
    const house=normalizeObjectAddress([row[11],row[12]].filter(value=>value!==null&&value!==undefined).join(' '));
    const compactHouse=house.replace(/\s+/g,'');
    const houseNumber=/^\d+/.exec(house)?.[0];
    return terms.every(term=>/^\d+\p{L}*$/u.test(term)
      ? addressWords.includes(term) || compactHouse===term || (/^\d+$/.test(term) && houseNumber===term)
      : address.includes(term));
  }).sort(compareLeadAddresses);
}
function appendObjectResults() {
  const next=Math.min(visibleObjectResults+100,objectSearchMatches.length);
  const fragment=document.createDocumentFragment();
  objectSearchMatches.slice(visibleObjectResults,next).forEach(row=>{
    const item=document.createElement('li'),button=document.createElement('button');
    button.type='button';button.className='object-search-result';
    const address=document.createElement('strong'),details=document.createElement('span');
    address.textContent=[[row[10],row[11],row[12]].filter(Boolean).join(' '),[row[13],row[1]].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    details.textContent=[row[2]||'Nicht zugeordnet',monthLabel(row[0]),row[4]||'Ohne Bemerkung'].join(' · ');
    button.append(address,details);
    button.addEventListener('click',()=>openObjectDetails(row));
    item.append(button);fragment.append(item);
  });
  objectSearchResults.append(fragment);visibleObjectResults=next;
  moreObjectResults.hidden=next>=objectSearchMatches.length;
  objectSearchInfo.textContent=objectSearchMatches.length ? `${number(objectSearchMatches.length)} Treffer in der aktuellen Filterauswahl · ${number(next)} angezeigt` : 'Keine Objekte für diese Suche in der aktuellen Filterauswahl gefunden.';
}
function refreshObjectSearch() {
  objectSearchResults.replaceChildren();visibleObjectResults=0;moreObjectResults.hidden=true;
  objectSearchMatches=findObjects(objectSearchInput.value);
  if(!normalizeObjectAddress(objectSearchInput.value)){objectSearchInfo.textContent='';return;}
  appendObjectResults();
}
objectSearchInput.addEventListener('input',refreshObjectSearch);
moreObjectResults.addEventListener('click',appendObjectResults);
window.refreshObjectSearch=refreshObjectSearch;

document.querySelector('#clearObjectSearch').addEventListener('click',()=>{
  objectSearchInput.value='';
  refreshObjectSearch();
  objectSearchInput.focus();
});
