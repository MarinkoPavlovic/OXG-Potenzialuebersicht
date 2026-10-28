import { discoverPotentialFiles, downloadPotentialFile } from './onedrive-reader.js';
import { parsePotentialWorkbook } from './xlsx-reader.js';
import { availableYears, availableMonths, filesForPeriod } from './load-period.js';

const clientId='254bb75b-6f37-4d86-9c9c-e65de69b4c31';
const redirect=location.protocol==='file:' ? 'http://localhost:4173/' : new URL('.',location.href).href;
const scopes='openid Files.Read';
const login=document.querySelector('#cloudLogin'), refresh=document.querySelector('#cloudRefresh'), status=document.querySelector('#cloudStatus');
const problems=document.querySelector('#cloudProblems'), problemList=document.querySelector('#cloudProblemList');
const dataTimestamp=document.querySelector('#dataTimestamp');
const periodDialog=document.querySelector('#loadPeriodDialog'), loadYear=document.querySelector('#loadYear'), loadMonthPicker=document.querySelector('#loadMonthPicker'), loadMonthSummary=document.querySelector('#loadMonthSummary'), loadMonthOptions=document.querySelector('#loadMonthOptions');
const periodCount=document.querySelector('#loadPeriodCount'), confirmPeriod=document.querySelector('#confirmLoadPeriod');
const monthNames=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
let accessToken=null;
function openDataCache() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('oxg-potenzial-cache',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('dashboard');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Der lokale Datenspeicher ist blockiert.'));
  });
}
async function readDataCache() {
  const db=await openDataCache();
  try {return await new Promise((resolve,reject)=>{const tx=db.transaction('dashboard','readonly'),request=tx.objectStore('dashboard').get('latest');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  finally {db.close();}
}
async function saveDataCache(snapshot) {
  const db=await openDataCache();
  try {await new Promise((resolve,reject)=>{const tx=db.transaction('dashboard','readwrite');tx.objectStore('dashboard').put(snapshot,'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Speichern abgebrochen.'));});}
  finally {db.close();}
}
function showDataTimestamp(timestamp) {
  const date=new Date(timestamp);
  dataTimestamp.textContent=Number.isFinite(date.getTime()) ? `Daten geladen: ${date.toLocaleString('de-DE')}` : '';
}
async function restoreCachedData() {
  try {
    const saved=await readDataCache();
    if(!saved || saved.version!==1 || !Array.isArray(saved.rows) || !saved.rows.length)return;
    window.useLiveData(saved.rows,{year:saved.year,years:saved.years});
    document.querySelector('.topbar .subtitle').textContent=saved.periodLabel;
    showDataTimestamp(saved.loadedAt);
    status.textContent=`${saved.periodLabel} · ${saved.fileCount} Dateien`;
  } catch(error) { console.warn('Gespeicherte Daten konnten nicht geladen werden.',error); }
}
let discoveredFiles=[], previousStatus='';
const selectedLoadMonths=new Set();
let loadMonthCloseTimer;
loadMonthPicker.addEventListener('mouseleave',()=>{loadMonthCloseTimer=setTimeout(()=>{loadMonthPicker.open=false;},250);});
loadMonthPicker.addEventListener('mouseenter',()=>clearTimeout(loadMonthCloseTimer));
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return encode(bytes);};
function setProblemList(errors) {
  problemList.replaceChildren();
  for(const error of errors){const li=document.createElement('li');li.textContent=error;problemList.append(li);}
  problems.hidden=errors.length===0;
}
async function signIn() {
  const verifier=random(), state=random();
  const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  sessionStorage.setItem('oxg_dashboard_auth',JSON.stringify({verifier,state}));
  const query=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirect,response_mode:'query',scope:scopes,state,code_challenge:challenge,code_challenge_method:'S256'});
  location.assign('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'+query);
}
async function exchangeCode() {
  const params=new URLSearchParams(location.search);
  if(!params.has('code')&&!params.has('error'))return false;
  history.replaceState(null,'',location.pathname);
  const saved=sessionStorage.getItem('oxg_dashboard_auth');sessionStorage.removeItem('oxg_dashboard_auth');
  if(params.has('error'))throw Error('Microsoft-Anmeldung nicht abgeschlossen: '+(params.get('error_description')||params.get('error')));
  const auth=saved&&JSON.parse(saved);
  if(!auth||auth.state!==params.get('state'))throw Error('Anmeldung konnte nicht zugeordnet werden. Bitte erneut anmelden.');
  const body=new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code:params.get('code'),redirect_uri:redirect,scope:scopes,code_verifier:auth.verifier});
  const response=await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const result=await response.json();
  if(!response.ok||!result.access_token)throw Error('Microsoft-Anmeldung fehlgeschlagen: '+(result.error_description||result.error||response.status));
  accessToken=result.access_token;return true;
}
function updatePeriodCount() {
  const count=filesForPeriod(discoveredFiles,loadYear.value,[...selectedLoadMonths]).length;
  periodCount.textContent=`${count.toLocaleString('de-DE')} passende ${count===1?'Datei':'Dateien'}`;
  confirmPeriod.disabled=count===0;
}
function fillLoadMonths() {
  const months=availableMonths(discoveredFiles,loadYear.value);
  for(const month of selectedLoadMonths)if(!months.includes(month))selectedLoadMonths.delete(month);
  loadMonthOptions.replaceChildren();
  const addOption=(label,checked,handler)=>{const wrapper=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',label);wrapper.append(input,document.createTextNode(label));loadMonthOptions.append(wrapper);input.addEventListener('change',handler);};
  addOption('Alle Monate',selectedLoadMonths.size===0,()=>{selectedLoadMonths.clear();fillLoadMonths();});
  months.forEach(month=>addOption(monthNames[month-1],selectedLoadMonths.has(month),event=>{if(event.target.checked)selectedLoadMonths.add(month);else selectedLoadMonths.delete(month);fillLoadMonths();}));
  const chosen=[...selectedLoadMonths].sort((a,b)=>a-b);
  loadMonthSummary.textContent=chosen.length===0?'Alle Monate':chosen.length===1?monthNames[chosen[0]-1]:`${chosen.length} Monate ausgewählt`;
  updatePeriodCount();
}
async function choosePeriod() {
  if(!accessToken){status.textContent='Bitte erneut mit OneDrive verbinden.';login.hidden=false;return;}
  login.disabled=true;refresh.disabled=true;setProblemList([]);
  previousStatus=status.textContent;
  try {
    status.textContent='Beraterordner werden gesucht …';
    const discovery=await discoverPotentialFiles(accessToken);
    if(discovery.errors.length){setProblemList(discovery.errors.map(e=>`${e.advisor}: ${e.message}`));throw Error('Nicht alle Beraterordner konnten gelesen werden.');}
    if(!discovery.files.length)throw Error('Keine passenden Beraterdateien gefunden.');
    discoveredFiles=discovery.files;
    loadYear.replaceChildren(new Option('Alle Jahre','all'));
    availableYears(discoveredFiles).forEach(year=>loadYear.add(new Option(String(year),String(year))));
    loadYear.value='all';selectedLoadMonths.clear();loadMonthPicker.open=false;fillLoadMonths();
    status.textContent=previousStatus;
    periodDialog.showModal();
  } catch(error){status.textContent='Auswahl nicht verfügbar: '+error.message;}
  finally {login.disabled=false;refresh.disabled=false;}
}
async function loadFiles(files, periodLabel, selectedYear) {
  if(!accessToken){status.textContent='Bitte erneut mit OneDrive verbinden.';login.hidden=false;return;}
  login.disabled=true;refresh.disabled=true;setProblemList([]);
  try {
    const errors=[];
    let firstBytes;
    try { firstBytes=await downloadPotentialFile(files[0].itemId,accessToken,{downloadUrl:files[0].downloadUrl}); }
    catch(error){if(error.message.includes('Downloadadresse fehlt')){setProblemList([`${files[0].advisor} / ${files[0].name}: ${error.message}`]);status.textContent='Die OneDrive-Downloadadresse konnte nicht ermittelt werden. Der Import wurde gestoppt; die bisherige Ansicht bleibt bestehen.';return;}}
    const rows=[];let next=0,completed=0;
    async function worker(){
      while(next<files.length){
        const file=files[next++];
        try { const bytes=file===files[0] && firstBytes ? firstBytes : await downloadPotentialFile(file.itemId,accessToken,{downloadUrl:file.downloadUrl});rows.push(...await parsePotentialWorkbook(bytes,file)); }
        catch(error){errors.push(`${file.advisor} / ${file.name}: ${error.message}`);}
        completed++;status.textContent=`Beraterdateien werden geprüft: ${completed} von ${files.length}`;
      }
    }
    await Promise.all(Array.from({length:Math.min(4,files.length)},worker));
    if(errors.length){setProblemList(errors);status.textContent=`Die Aktualisierung ist unvollständig: ${errors.length} Datei(en) oder Ordner mit Prüfbedarf. Die bisherige Ansicht bleibt bestehen.`;return;}
    if(!rows.length)throw Error('Die Dateien enthielten keine auswertbaren Leads.');
    const years=availableYears(files), loadedAt=new Date().toISOString();
    window.useLiveData(rows,{year:selectedYear,years});
    document.querySelector('.topbar .subtitle').textContent=periodLabel;
    status.textContent=`${periodLabel} · ${files.length} Dateien`;
    showDataTimestamp(loadedAt);
    try {await saveDataCache({version:1,rows,year:selectedYear,years,periodLabel,fileCount:files.length,loadedAt});}
    catch(error){status.textContent+= ' · Lokales Speichern nicht möglich';console.warn('Daten konnten nicht gespeichert werden.',error);}
  } catch(error){status.textContent='Aktualisierung nicht abgeschlossen: '+error.message;}
  finally {login.disabled=false;refresh.disabled=false;}
}
login.addEventListener('click',()=>signIn().catch(error=>{status.textContent='Anmeldung nicht gestartet: '+error.message;}));
refresh.addEventListener('click',choosePeriod);
loadYear.addEventListener('change',fillLoadMonths);
document.querySelector('#cancelLoadPeriod').addEventListener('click',()=>periodDialog.close());
confirmPeriod.addEventListener('click',()=>{
  const chosenMonths=[...selectedLoadMonths].sort((a,b)=>a-b);
  const files=filesForPeriod(discoveredFiles,loadYear.value,chosenMonths);
  if(!files.length)return;
  const selectedYear=loadYear.value;
  const periodLabel=[selectedYear==='all'?'Alle Jahre':selectedYear,chosenMonths.length===0?'alle Monate':chosenMonths.map(month=>monthNames[month-1]).join(', ')].join(' · ');
  periodDialog.close();
  loadFiles(files,periodLabel,selectedYear);
});
await restoreCachedData();
login.disabled=false;
try { if(await exchangeCode()){login.hidden=true;refresh.hidden=false;await choosePeriod();} }
catch(error){status.textContent=error.message;}
