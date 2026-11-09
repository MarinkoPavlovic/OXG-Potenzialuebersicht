const cityPotentialCollator = new Intl.Collator('de-DE', {numeric: true, sensitivity: 'base'});
const cityPotentialCategories = ['contract', 'nonmarketable', 'interest', 'unworked', 'inprogress'];

function normalizePotentialLocation(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function uniquePotentialKey(row, index) {
  const id = normalizeAdsId(row[9]).replace(/^(\d+)\.0$/, '$1');
  if (id) return `id:${id}`;
  const address = [row[1], row[13], row[10], row[11], row[12]].map(normalizePotentialLocation);
  if (address[0] && address[2] && address[3]) return `address:${JSON.stringify(address)}`;
  return `unidentified:${index}`;
}

function uniquePotentialCategory(row) {
  const status = String(row[4] ?? '').trim();
  if (status === 'Vertrag abgeschlossen') return 'contract';
  if (nonmarketableStatuses.has(status)) return 'nonmarketable';
  if (status === 'ET hat kein Interesse') return 'interest';
  const determined = normalizePotentialLocation(row[5]);
  if (!status && (!determined || determined === 'nein')) return 'unworked';
  return 'inprogress';
}

function preferPotentialAddress(candidate, current) {
  // Choose one complete address, then the most recent month, independently of status priority.
  const completeness = row => [row[1], row[10], row[11]].filter(value => String(value ?? '').trim()).length;
  const difference = completeness(candidate) - completeness(current);
  if (difference) return difference > 0;
  const candidateMonth = String(candidate[0] ?? '');
  const currentMonth = String(current[0] ?? '');
  if (candidateMonth !== currentMonth) return candidateMonth > currentMonth;
  const address = row => [row[1], row[13], row[10], row[11], row[12]].map(normalizePotentialLocation).join('\u0000');
  return cityPotentialCollator.compare(address(candidate), address(current)) < 0;
}

function emptyCityPotentialTotals() {
  return {
    total: 0,
    units: 0,
    contract: 0,
    nonmarketable: 0,
    interest: 0,
    unworked: 0,
    inprogress: 0,
    categoryUnits: Object.fromEntries(cityPotentialCategories.map(category => [category, 0])),
  };
}

function buildUniquePotentialSummary(allRecords, selectedRecords) {
  const keys = new Map();
  const bestCategories = new Map();
  allRecords.forEach((row, index) => {
    const key = uniquePotentialKey(row, index);
    keys.set(row, key);
    const category = uniquePotentialCategory(row);
    const previous = bestCategories.get(key);
    if (!previous || cityPotentialCategories.indexOf(category) < cityPotentialCategories.indexOf(previous)) {
      bestCategories.set(key, category);
    }
  });

  const selectedObjects = new Map();
  const objectUnits = new Map();
  selectedRecords.forEach((row, index) => {
    const key = keys.get(row) ?? uniquePotentialKey(row, allRecords.length + index);
    const previous = selectedObjects.get(key);
    if (!previous || preferPotentialAddress(row, previous)) selectedObjects.set(key, row);
    const units = Number(row[3]);
    const period = String(row[0] ?? '');
    const previousUnits = objectUnits.get(key);
    // Use the latest available WE value once per object. For conflicting values in one month, use the larger value.
    if (Number.isFinite(units) && units >= 0 &&
        (!previousUnits || period > previousUnits.period || (period === previousUnits.period && units > previousUnits.value))) {
      objectUnits.set(key, {period, value: units});
    }
  });

  const cities = new Map();
  const totals = emptyCityPotentialTotals();
  let addressIdentified = 0;
  let unidentified = 0;
  selectedObjects.forEach((row, key) => {
    const cityName = String(row[1] ?? '').trim() || 'Ohne Ortsangabe';
    const streetName = String(row[10] ?? '').trim() || 'Ohne Straßenangabe';
    const cityKey = normalizePotentialLocation(cityName);
    const streetKey = normalizePotentialLocation(streetName);
    if (!cities.has(cityKey)) cities.set(cityKey, {name: cityName, ...emptyCityPotentialTotals(), streets: new Map()});
    const city = cities.get(cityKey);
    if (!city.streets.has(streetKey)) city.streets.set(streetKey, {name: streetName, ...emptyCityPotentialTotals()});
    const street = city.streets.get(streetKey);
    const category = bestCategories.get(key) ?? uniquePotentialCategory(row);
    const units = objectUnits.get(key)?.value ?? 0;
    for (const group of [totals, city, street]) {
      group.total += 1;
      group.units += units;
      group[category] += 1;
      group.categoryUnits[category] += units;
    }
    if (key.startsWith('address:')) addressIdentified += 1;
    if (key.startsWith('unidentified:')) unidentified += 1;
  });

  const sortedCities = [...cities.values()].sort((a, b) => cityPotentialCollator.compare(a.name, b.name));
  sortedCities.forEach(city => {
    city.streets = [...city.streets.values()].sort((a, b) => cityPotentialCollator.compare(a.name, b.name));
  });
  return {cities: sortedCities, totals, addressIdentified, unidentified};
}

function makeCityPotentialRow(name, totals, kind) {
  const row = document.createElement('tr');
  row.className = `city-potential-${kind}`;
  const label = document.createElement('th');
  label.scope = 'row';
  label.textContent = kind === 'street' ? `└ ${name}` : name;
  row.append(label);
  const count = document.createElement('td');
  count.textContent = number(totals.total);
  row.append(count);
  const unitTotal = document.createElement('td');
  unitTotal.textContent = number(totals.units);
  row.append(unitTotal);
  cityPotentialCategories.forEach(category => {
    const cell = document.createElement('td');
    cell.className = `city-potential-category city-potential-${category}`;
    const value = document.createElement('strong');
    const units = document.createElement('small');
    units.className = 'city-potential-units';
    units.textContent = `(${number(totals.categoryUnits[category])} WE)`;
    const rate = document.createElement('span');
    rate.className = 'city-potential-rate';
    value.textContent = number(totals[category]);
    rate.textContent = totals.total ? pct(totals[category], totals.total) : '–';
    cell.append(value, units, rate);
    row.append(cell);
  });
  return row;
}

function refreshCityPotential() {
  const panel = document.querySelector('#cityPotentialPanel');
  panel.hidden = !liveRecords?.length;
  const summary = buildUniquePotentialSummary(liveRecords ?? [], typeRecords());
  const body = document.querySelector('#cityPotentialRows');
  body.replaceChildren();
  const selection = [];
  if (citySelect.value && citySelect.value !== 'all') selection.push(citySelect.value);
  if (monthSelect.value && monthSelect.value !== 'all') selection.push(monthLabel(monthSelect.value));
  else if (yearSelect.value && yearSelect.value !== 'all') selection.push(yearSelect.value);
  if (selectedAdvisors.size) selection.push([...selectedAdvisors].sort(cityPotentialCollator.compare).join(', '));
  if (leadTypeSelect.value === 'new') selection.push('Neue Leads');
  if (leadTypeSelect.value === 'old') selection.push('Alte Leads');
  document.querySelector('#cityPotentialSelection').textContent = selection.join(' · ') || 'Alle geladenen Potenziale';

  summary.cities.forEach(city => {
    const row = makeCityPotentialRow(city.name, city, 'city');
    const streetRows = city.streets.map(street => {
      const child = makeCityPotentialRow(street.name, street, 'street');
      child.hidden = true;
      return child;
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-potential-toggle';
    button.textContent = `${city.name} ▾`;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', `Straßen für ${city.name} anzeigen`);
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', `Straßen für ${city.name} ${expanded ? 'ausblenden' : 'anzeigen'}`);
      button.textContent = `${city.name} ${expanded ? '▴' : '▾'}`;
      streetRows.forEach(child => { child.hidden = !expanded; });
    });
    row.firstChild.replaceChildren(button);
    body.append(row, ...streetRows);
  });
  document.querySelector('#cityPotentialTotals').replaceChildren(makeCityPotentialRow('Gesamt', summary.totals, 'total'));
  document.querySelector('#cityPotentialEmpty').hidden = summary.totals.total > 0;
  const notices = [];
  if (summary.addressIdentified) notices.push(`${number(summary.addressIdentified)} Objekte ohne ADS-ID wurden anhand der vollständigen Adresse zusammengeführt.`);
  if (summary.unidentified) notices.push(`${number(summary.unidentified)} Einträge ohne ADS-ID und vollständige Adresse werden einzeln gezählt.`);
  document.querySelector('#cityPotentialDataInfo').textContent = notices.join(' ');
}

window.refreshCityPotential = refreshCityPotential;
refreshCityPotential();
