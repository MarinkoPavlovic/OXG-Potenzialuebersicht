/* Extract only dashboard fields; workbook files are never modified. */
const sheetNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const required = ['ADS-ID','WE','Ort','ET ermittelt','ET wohnt im Objekt','Bemerkung','Eigene Notizen'];
function xml(content) {
  const document = new DOMParser().parseFromString(content, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw Error('Ungültiger Excel-Dateiinhalt');
  return document;
}
function nodes(root, name) { return Array.from(root.getElementsByTagNameNS('*', name)); }
function normal(value) { return String(value ?? '').trim(); }
function resolvedPath(target) {
  const parts = (target.startsWith('/') ? target.slice(1) : 'xl/' + target).split('/');
  const clean = [];
  for (const part of parts) { if (part === '..') clean.pop(); else if (part && part !== '.') clean.push(part); }
  return clean.join('/');
}
export async function parsePotentialWorkbook(buffer, file) {
  const zip = await JSZip.loadAsync(buffer);
  async function read(path) { const entry=zip.file(path); if(!entry) throw Error(`Excel-Bestandteil fehlt: ${path}`); return xml(await entry.async('string')); }
  const workbook=await read('xl/workbook.xml');
  const date1904=['1','true'].includes(nodes(workbook,'workbookPr')[0]?.getAttribute('date1904'));
  const relationships=await read('xl/_rels/workbook.xml.rels');
  const relations=new Map(nodes(relationships,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const sheets=nodes(workbook,'sheet');
  const desired=sheetNames[file.month-1];
  const sheet=sheets.find(s=>normal(s.getAttribute('name')).toLocaleLowerCase('de-DE')===desired.toLocaleLowerCase('de-DE')) || sheets.find(s=>normal(s.getAttribute('name')).toLocaleLowerCase('de-DE')!=='bemerkungen');
  if(!sheet) throw Error('Kein Datenblatt gefunden');
  const relationId=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id') || sheet.getAttribute('r:id');
  const target=relations.get(relationId); if(!target) throw Error('Datenblatt nicht verknüpft');
  const sharedEntry=zip.file('xl/sharedStrings.xml');
  const shared=sharedEntry ? nodes(xml(await sharedEntry.async('string')),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')) : [];
  const data=await read(resolvedPath(target));
  const rows=nodes(data,'row');
  function cells(row) {
    const result={};
    for(const cell of nodes(row,'c')) {
      const ref=cell.getAttribute('r')||''; const col=ref.match(/^[A-Z]+/i)?.[0]; if(!col)continue;
      const type=cell.getAttribute('t'); const value=nodes(cell,'v')[0]?.textContent ?? '';
      result[col]=type==='s' ? shared[Number(value)] ?? '' : type==='inlineStr' ? nodes(cell,'t').map(t=>t.textContent).join('') : value;
    }
    return result;
  }
  function hasFormula(row, column) {
    return nodes(row,'c').some(cell => (cell.getAttribute('r')||'').match(/^[A-Z]+/i)?.[0] === column && nodes(cell,'f').length > 0);
  }
  if(!rows.length)throw Error('Datenblatt ist leer');
  const header=cells(rows[0]); const columns={};
  for(const [column,value] of Object.entries(header)) columns[normal(value)]=column;
  const candidateRows=rows.slice(1).filter(row=>!hasFormula(row,'A')).map(cells).filter(row=>/^\d+(?:\.0)?$/.test(normal(row.A)));
  const standardNeighbours=columns['ADS-ID']==='A' && columns['WE']==='B' && columns['Ort']==='D' && columns['ET ermittelt']==='H' && columns['ET kontaktiert']==='J' && columns['Termin']==='L' && columns['Eigene Notizen']==='M';
  if(standardNeighbours && !columns['ET wohnt im Objekt'] && !normal(header.I) && candidateRows.every(row=>['','ja','nein'].includes(normal(row.I).toLocaleLowerCase('de-DE')))) columns['ET wohnt im Objekt']='I';
  const knownStatuses=new Set(['','ET hat kein Interesse','Unterlagen beim Kunden','Vertrag abgeschlossen','Vertrag bei anderem MB','Unterlagen zusenden','GF bei anderem Anbieter','Objekt existiert nicht','ET nicht ermittelbar','Vertrag online abgeschlossen','Termin mit Kunden','GK Objekt','MHV grau']);
  if(standardNeighbours && !columns.Bemerkung && candidateRows.every(row=>knownStatuses.has(normal(row.K)))) columns.Bemerkung='K';
  const missing=required.filter(name=>!columns[name]);
  if(missing.length)throw Error('Spalten fehlen oder sind verändert: '+missing.join(', '));
  const advisor=normal(file.advisor).replace(/^\d{2}-\d+_/, '');
  function displayDate(value) {
    if(!value)return '';
    if(/^\d+(?:\.\d+)?$/.test(value)) {
      const days=Number(value);
      if(days>=1&&days<=2958465){const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);const date=new Date(epoch+Math.floor(days)*86400000);if(!Number.isNaN(date.getTime()))return `${String(date.getUTCDate()).padStart(2,'0')}.${String(date.getUTCMonth()+1).padStart(2,'0')}.${date.getUTCFullYear()}`;}
    }
    return value;
  }
  const records=[];
  for(const row of rows.slice(1)) {
    if(hasFormula(row,columns['ADS-ID']))continue;
    const values=cells(row), get=name=>normal(values[columns[name]]);
    const id=get('ADS-ID'); if(!/^\d+(?:\.0)?$/.test(id))continue;
    const status=get('Bemerkung'), determined=get('ET ermittelt').toLocaleLowerCase('de-DE'), residence=get('ET wohnt im Objekt').toLocaleLowerCase('de-DE');
    const notes=get('Eigene Notizen');
    const isNew=/erst\s*[- ]?\s*(?:an)?g[aä]ng|neues\s+poten[zt]ial/i.test(notes);
    const units=Number(get('WE').replace(',','.'));
    records.push([`${file.year}-${String(file.month).padStart(2,'0')}`,get('Ort'),advisor,Number.isFinite(units)?units:0,status,determined,residence,Number(isNew),Number(!isNew),id,get('Straße'),get('Nr.'),get('Zus.'),get('PLZ'),file.name,get('ET kontaktiert'),displayDate(get('Termin')),notes]);
  }
  return records;
}
