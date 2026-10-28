/* Read-only OneDrive file discovery. Authentication and Excel processing are
   intentionally supplied by the application, not embedded in this module. */
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const advisorName = /^\d{2}-\d+_/;
const monthlyFile = /^(20\d{2})-(0[1-9]|1[0-2])(?=$|[^\d]).*\.xlsx$/i;

export function parsePotentialFilename(name) {
  if (name.startsWith('~$')) return null;
  const match = monthlyFile.exec(name);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

async function graphGet(url, accessToken, signal) {
  const parsed = new URL(url, GRAPH_ROOT);
  if (parsed.origin !== 'https://graph.microsoft.com' || !parsed.pathname.startsWith('/v1.0/')) {
    throw new Error('Ungültige OneDrive-Antwortadresse.');
  }
  const response = await fetch(parsed.href, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
  if (!response.ok) throw new Error(`OneDrive-Zugriff fehlgeschlagen (HTTP ${response.status}).`);
  return response;
}

async function listChildren(url, accessToken, signal) {
  const items = [];
  while (url) {
    const page = await (await graphGet(url, accessToken, signal)).json();
    if (!Array.isArray(page.value)) throw new Error('Unvollständige OneDrive-Ordnerantwort.');
    items.push(...page.value);
    url = page['@odata.nextLink'] || null;
  }
  return items;
}

export async function discoverPotentialFiles(accessToken, { signal } = {}) {
  if (!accessToken) throw new Error('Microsoft-Anmeldung erforderlich.');
  const advisors = await listChildren(`${GRAPH_ROOT}/me/drive/root:/Vodafone:/children`, accessToken, signal);
  const files = [], errors = [];
  for (const advisor of advisors.filter(item => item.folder && advisorName.test(item.name))) {
    try {
      const folders = await listChildren(`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(advisor.id)}/children`, accessToken, signal);
      const potential = folders.find(item => item.folder && item.name.toLocaleLowerCase('de-DE') === 'potenzial');
      if (!potential) continue;
      const children = await listChildren(`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(potential.id)}/children`, accessToken, signal);
      for (const item of children) {
        const period = item.file && parsePotentialFilename(item.name);
        if (period) files.push({ advisor: advisor.name, name: item.name, itemId: item.id, downloadUrl: item['@microsoft.graph.downloadUrl'] || item['@content.downloadUrl'] || null, lastModified: item.lastModifiedDateTime, ...period });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push({ advisor: advisor.name, message: error.message });
    }
  }
  return { files, errors };
}

export async function downloadPotentialFile(itemId, accessToken, { signal, downloadUrl: listedUrl } = {}) {
  let downloadUrl = listedUrl;
  const responseFields = new Set();
  if (!downloadUrl) {
    const metadata = await (await graphGet(`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(itemId)}`, accessToken, signal)).json();
    Object.keys(metadata).forEach(key => responseFields.add(key));
    downloadUrl = metadata['@microsoft.graph.downloadUrl'] || metadata['@content.downloadUrl'];
  }
  if (!downloadUrl) {
    const metadata = await (await graphGet(`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,file,@microsoft.graph.downloadUrl`, accessToken, signal)).json();
    Object.keys(metadata).forEach(key => responseFields.add(key));
    downloadUrl = metadata['@microsoft.graph.downloadUrl'] || metadata['@content.downloadUrl'];
  }
  if (!downloadUrl) throw new Error(`OneDrive-Downloadadresse fehlt. Gelieferte Feldnamen: ${[...responseFields].sort().join(', ') || 'keine'}.`);
  if (new URL(downloadUrl).protocol !== 'https:') throw new Error('OneDrive-Downloadadresse ist ungültig.');
  let response = await fetch(downloadUrl, { signal });
  if (listedUrl && (response.status === 401 || response.status === 403)) {
    const metadata = await (await graphGet(`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(itemId)}`, accessToken, signal)).json();
    const freshUrl = metadata['@microsoft.graph.downloadUrl'] || metadata['@content.downloadUrl'];
    if (freshUrl && new URL(freshUrl).protocol === 'https:') response = await fetch(freshUrl, { signal });
  }
  if (!response.ok) throw new Error(`OneDrive-Datei konnte nicht gelesen werden (HTTP ${response.status}).`);
  return response.arrayBuffer();
}
