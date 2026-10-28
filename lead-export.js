const exportLeadButton = document.querySelector('#exportLeadDetails');
const exportXmlNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function leadExportFilename(category, city) {
  const safe = value => String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
  return `${safe(leadDetailLabels[category] || 'Leads')} – ${safe(city)}.xlsx`;
}
function exportDateSerial(value) {
  const text=String(value ?? '').trim();
  const german=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if(!german&&!iso)return null;
  const year=Number(german?german[3]:iso[1]),month=Number(german?german[2]:iso[2]),day=Number(german?german[1]:iso[3]);
  if(year<1900||year>9999)return null;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  const serial=Math.floor((date.getTime()-Date.UTC(1899,11,30))/86400000);
  return serial>=61?serial:null;
}
function uniqueExportRecords(records) {
  const seen=new Set();
  return records.filter(row=>{const id=normalizeAdsId(row[9]);if(!id)return true;if(seen.has(id))return false;seen.add(id);return true;});
}
function leadExportValues(row, includeNotes = false, category = '') {
  const yesNo = value => value === 'ja' ? 'Ja' : value === 'nein' ? 'Nein' : value || '';
  const clearEt = ['owner','hv','onsite'].includes(category) && !String(row[4] ?? '').trim();
  return [row[9],row[3],row[13],row[1],row[10],row[11],row[12],clearEt?'':yesNo(row[5]),clearEt?'':yesNo(row[6]),clearEt?'':yesNo(row[15]),row[4],row[16],includeNotes ? row[17] : ''];
}
async function createLeadWorkbook(records, includeNotes = false, category = '') {
  if(records.length>1048575) throw Error('Die Liste ist für eine Excel-Datei zu groß.');
  const zip=await JSZip.loadAsync(window.leadExportTemplate,{base64:true});
  const parser=new DOMParser(), serializer=new XMLSerializer();
  const stylesXml=parser.parseFromString(await zip.file('xl/styles.xml').async('string'),'application/xml');
  const cellXfs=stylesXml.getElementsByTagNameNS(exportXmlNs,'cellXfs')[0];
  const dateStyle=cellXfs.children[3].cloneNode(true);
  dateStyle.setAttribute('numFmtId','14');dateStyle.setAttribute('applyNumberFormat','1');
  const dateStyleIndex=cellXfs.children.length;cellXfs.appendChild(dateStyle);cellXfs.setAttribute('count',String(cellXfs.children.length));
  zip.file('xl/styles.xml',serializer.serializeToString(stylesXml));
  const xml=parser.parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');
  if(xml.querySelector('parsererror')) throw Error('Die Excel-Vorlage konnte nicht gelesen werden.');
  const sheetData=xml.getElementsByTagNameNS(exportXmlNs,'sheetData')[0];
  const originalRows=[...sheetData.getElementsByTagNameNS(exportXmlNs,'row')];
  const template=originalRows.find(row=>row.getAttribute('r')==='2');
  if(!template) throw Error('Die Excel-Vorlage enthält keine Musterzeile.');
  originalRows.filter(row=>row.getAttribute('r')!=='1').forEach(row=>row.remove());
  records.forEach((record,index)=>{
    const rowNumber=index+2, row=template.cloneNode(true);
    row.setAttribute('r',rowNumber);
    const styles={};
    [...row.getElementsByTagNameNS(exportXmlNs,'c')].forEach(cell=>{const col=(cell.getAttribute('r')||'').replace(/\d/g,'');styles[col]=cell.getAttribute('s');});
    while(row.firstChild)row.removeChild(row.firstChild);
    leadExportValues(record,includeNotes,category).forEach((value,column)=>{
      if(value===null||value===undefined||value==='')return;
      if(column===11){value=exportDateSerial(value);if(value===null)return;}
      const name=String.fromCharCode(65+column), cell=xml.createElementNS(exportXmlNs,'c');
      cell.setAttribute('r',name+rowNumber);if(column===11)cell.setAttribute('s',String(dateStyleIndex));else if(styles[name])cell.setAttribute('s',styles[name]);
      if((column===1 || column===11) && Number.isFinite(Number(value))){const v=xml.createElementNS(exportXmlNs,'v');v.textContent=String(Number(value));cell.appendChild(v);}
      else {cell.setAttribute('t','inlineStr');const inline=xml.createElementNS(exportXmlNs,'is'),text=xml.createElementNS(exportXmlNs,'t');text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');text.textContent=String(value);inline.appendChild(text);cell.appendChild(inline);}
      row.appendChild(cell);
    });
    sheetData.appendChild(row);
  });
  const lastRow=Math.max(2,records.length+1);
  const dimension=xml.getElementsByTagNameNS(exportXmlNs,'dimension')[0];if(dimension)dimension.setAttribute('ref',`A1:M${lastRow}`);
  const filter=xml.getElementsByTagNameNS(exportXmlNs,'autoFilter')[0];if(filter)filter.setAttribute('ref',`A1:M${lastRow}`);
  [...xml.getElementsByTagNameNS(exportXmlNs,'conditionalFormatting')].forEach(node=>node.setAttribute('sqref',`A2:M${lastRow}`));
  [...xml.getElementsByTagNameNS(exportXmlNs,'dataValidation')].forEach(node=>node.setAttribute('sqref',`H2:J${lastRow}`));
  [...xml.getElementsByTagNameNS('http://schemas.microsoft.com/office/excel/2006/main','sqref')].forEach(node=>{if(/^K2:K\d+$/.test(node.textContent))node.textContent=`K2:K${lastRow}`;});
  const pane=xml.getElementsByTagNameNS(exportXmlNs,'pane')[0];if(pane)pane.setAttribute('topLeftCell','A2');
  const view=xml.getElementsByTagNameNS(exportXmlNs,'sheetView')[0];if(view)view.setAttribute('topLeftCell','A1');
  zip.file('xl/worksheets/sheet1.xml',serializer.serializeToString(xml));
  const book=parser.parseFromString(await zip.file('xl/workbook.xml').async('string'),'application/xml');
  [...book.getElementsByTagNameNS(exportXmlNs,'definedName')].filter(node=>node.getAttribute('name')==='_xlnm._FilterDatabase').forEach(node=>{node.textContent=`Oktober!$A$1:$M$${lastRow}`;});
  zip.file('xl/workbook.xml',serializer.serializeToString(book));
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
}
exportLeadButton.addEventListener('click',async()=>{
  if(liveRecords===null || !citySelect.value || citySelect.value==='all' || activeLeadDetail==='contract')return;
  exportLeadButton.disabled=true;
  try {
    const filename=leadExportFilename(activeLeadDetail,citySelect.value);
    let fileHandle=null;
    if(typeof window.showSaveFilePicker==='function') {
      fileHandle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'Excel-Arbeitsmappe',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
    }
    const records=uniqueExportRecords(leadDetailRecords.filter(row=>!hasExistingContract(row,contractedLeadIds)));
    const blob=await createLeadWorkbook(records,activeLeadDetail==='hv',activeLeadDetail);
    if(fileHandle){const writable=await fileHandle.createWritable();await writable.write(blob);await writable.close();return;}
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  } catch(error) { if(error.name!=='AbortError')leadDetailsInfo.textContent=`Excel-Export fehlgeschlagen: ${error.message}`; }
  finally {exportLeadButton.disabled=liveRecords===null || !citySelect.value || citySelect.value==='all';}
});
