const cityPotentialCollator = new Intl.Collator('de-DE', {numeric: true, sensitivity: 'base'});
const cityPotentialCategories = ['contract', 'unworked', 'inprogress', 'interest', 'nonmarketable'];
const cityPotentialPriority = ['contract', 'interest', 'nonmarketable', 'inprogress', 'unworked'];

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

function uniqueCityPotentialExportRecords(allRecords, selectedRecords) {
  const keys = new Map(), bestStatus = new Map(), selected = new Map(), latestUnits = new Map();
  allRecords.forEach((row, index) => {
    const key = uniquePotentialKey(row, index);
    keys.set(row, key);
    const previous = bestStatus.get(key);
    const priority = cityPotentialPriority.indexOf(uniquePotentialCategory(row));
    if (!previous || priority < previous.priority || (priority === previous.priority && preferPotentialAddress(row, previous.row))) {
      bestStatus.set(key, {row, priority});
    }
  });
  selectedRecords.forEach((row, index) => {
    const key = keys.get(row) ?? uniquePotentialKey(row, allRecords.length + index);
    const previous = selected.get(key);
    if (!previous || preferPotentialAddress(row, previous)) selected.set(key, row);
    const units = Number(row[3]), period = String(row[0] ?? ''), current = latestUnits.get(key);
    if (Number.isFinite(units) && units >= 0 && (!current || period > current.period || (period === current.period && units > current.value))) {
      latestUnits.set(key, {period, value: units});
    }
  });
  return [...selected].map(([key, row]) => {
    const result = row.slice(), statusRow = bestStatus.get(key)?.row ?? row;
    result[3] = latestUnits.get(key)?.value ?? 0;
    result[4] = statusRow[4];
    if (!String(statusRow[4] ?? '').trim()) result[5] = statusRow[5];
    return result;
  });
}

function buildUniquePotentialSummary(allRecords, selectedRecords) {
  const keys = new Map();
  const bestCategories = new Map();
  allRecords.forEach((row, index) => {
    const key = uniquePotentialKey(row, index);
    keys.set(row, key);
    const category = uniquePotentialCategory(row);
    const previous = bestCategories.get(key);
    if (!previous || cityPotentialPriority.indexOf(category) < cityPotentialPriority.indexOf(previous)) {
      bestCategories.set(key, category);
    }
  });

  const selectedObjects = new Map();
  const objectUnits = new Map();
  const objectAdvisors = new Map();
  selectedRecords.forEach((row, index) => {
    const key = keys.get(row) ?? uniquePotentialKey(row, allRecords.length + index);
    const previous = selectedObjects.get(key);
    if (!previous || preferPotentialAddress(row, previous)) selectedObjects.set(key, row);
    const advisorName = String(row[2] ?? '').trim() || 'Nicht zugeordnet';
    const advisorKey = normalizePotentialLocation(advisorName);
    if (!objectAdvisors.has(key)) objectAdvisors.set(key, new Map());
    const assignments = objectAdvisors.get(key);
    const category = uniquePotentialCategory(row);
    const assignment = assignments.get(advisorKey);
    if (!assignment) {
      assignments.set(advisorKey, {name: advisorName, category, months: new Set([row[0]].filter(Boolean)), monthly: new Map()});
    } else {
      if (cityPotentialPriority.indexOf(category) < cityPotentialPriority.indexOf(assignment.category)) assignment.category = category;
      if (advisorName < assignment.name) assignment.name = advisorName;
      if (row[0]) assignment.months.add(row[0]);
    }
    const advisorAssignment = assignments.get(advisorKey);
    const allocationMonth = String(row[0] ?? '');
    const currentAllocation = advisorAssignment.monthly.get(allocationMonth);
    const rowUnits = Number(row[3]);
    if (!currentAllocation) advisorAssignment.monthly.set(allocationMonth, {category, units: Number.isFinite(rowUnits) && rowUnits >= 0 ? rowUnits : 0});
    else {
      if (cityPotentialPriority.indexOf(category) < cityPotentialPriority.indexOf(currentAllocation.category)) currentAllocation.category = category;
      if (Number.isFinite(rowUnits) && rowUnits >= 0) currentAllocation.units = Math.max(currentAllocation.units, rowUnits);
    }
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
    if (!city.streets.has(streetKey)) city.streets.set(streetKey, {name: streetName, ...emptyCityPotentialTotals(), advisors: new Map(), allocations: new Map()});
    const street = city.streets.get(streetKey);
    const category = bestCategories.get(key) ?? uniquePotentialCategory(row);
    const units = objectUnits.get(key)?.value ?? 0;
    for (const group of [totals, city, street]) {
      group.total += 1;
      group.units += units;
      group[category] += 1;
      group.categoryUnits[category] += units;
    }
    objectAdvisors.get(key).forEach((assignment, advisorKey) => {
      if (!street.advisors.has(advisorKey)) street.advisors.set(advisorKey, {name: assignment.name, months: new Set(), ...emptyCityPotentialTotals()});
      const advisor = street.advisors.get(advisorKey);
      assignment.months.forEach(month => advisor.months.add(month));
      advisor.total += 1;
      advisor.units += units;
      advisor[assignment.category] += 1;
      advisor.categoryUnits[assignment.category] += units;
      if (assignment.name < advisor.name) advisor.name = assignment.name;
      assignment.monthly.forEach((monthly, month) => {
        const allocationKey = JSON.stringify([advisorKey, month]);
        if (!street.allocations.has(allocationKey)) street.allocations.set(allocationKey, {name: assignment.name, month, ...emptyCityPotentialTotals()});
        const allocation = street.allocations.get(allocationKey);
        allocation.total += 1;
        allocation.units += monthly.units;
        allocation[monthly.category] += 1;
        allocation.categoryUnits[monthly.category] += monthly.units;
        if (assignment.name < allocation.name) allocation.name = assignment.name;
      });
    });
    if (key.startsWith('address:')) addressIdentified += 1;
    if (key.startsWith('unidentified:')) unidentified += 1;
  });

  const sortedCities = [...cities.values()].sort((a, b) => cityPotentialCollator.compare(a.name, b.name));
  sortedCities.forEach(city => {
    city.streets = [...city.streets.values()].sort((a, b) => cityPotentialCollator.compare(a.name, b.name));
    city.streets.forEach(street => {
      street.advisors = [...street.advisors.values()];
      street.advisors.forEach(advisor => { advisor.months = [...advisor.months].sort(); });
      street.advisors.sort((a, b) => {
        const firstMonthA = a.months[0] ?? '9999-99';
        const firstMonthB = b.months[0] ?? '9999-99';
        return firstMonthA.localeCompare(firstMonthB) || cityPotentialCollator.compare(a.name, b.name);
      });
      street.allocations = [...street.allocations.values()].sort((a,b) => (a.month || '9999-99').localeCompare(b.month || '9999-99') || cityPotentialCollator.compare(a.name,b.name));
    });
  });
  return {cities: sortedCities, totals, addressIdentified, unidentified};
}

function makeCityPotentialRow(name, totals, kind) {
  const row = document.createElement('tr');
  row.className = `city-potential-${kind}`;
  const label = document.createElement('th');
  label.scope = 'row';
  label.textContent = ['street', 'advisor'].includes(kind) ? `└ ${name}` : name;
  row.append(label);
  const count = document.createElement('td');
  count.textContent = number(totals.total);
  row.append(count);
  const unitTotal = document.createElement('td');
  unitTotal.textContent = number(totals.units);
  row.append(unitTotal);
  cityPotentialCategories.forEach(category => {
    const count = document.createElement('td');
    const units = document.createElement('td');
    const rate = document.createElement('td');
    const categoryClass = `city-potential-category city-potential-${category}`;
    count.className = `${categoryClass} city-potential-count`;
    units.className = `${categoryClass} city-potential-units`;
    rate.className = `${categoryClass} city-potential-rate`;
    count.textContent = number(totals[category]);
    units.textContent = number(totals.categoryUnits[category]);
    const rateBase = category === 'nonmarketable' ? totals.total : Math.max(0, totals.total - totals.nonmarketable);
    rate.textContent = rateBase ? pct(totals[category], rateBase) : '–';
    row.append(count, units, rate);
  });
  return row;
}

function cityPotentialRecords() {
  return typeRecords({ignoreMonth: true, ignoreAdvisor: true});
}

function refreshCityPotential() {
  const panel = document.querySelector('#cityPotentialPanel');
  panel.hidden = !liveRecords?.length;
  const selectedRecords = cityPotentialRecords();
  const summary = buildUniquePotentialSummary(liveRecords ?? [], selectedRecords);
  const exportButton = document.querySelector('#exportCityPotentialList');
  exportButton.disabled = !selectedRecords.length || exportButton.getAttribute('aria-busy') === 'true';
  document.querySelector('#cityPotentialExportStatus').textContent = '';
  const body = document.querySelector('#cityPotentialRows');
  body.replaceChildren();
  const selection = [];
  if (citySelect.value && citySelect.value !== 'all') selection.push(citySelect.value);
  if (yearSelect.value && yearSelect.value !== 'all') selection.push(yearSelect.value);
  if (leadTypeSelect.value === 'new') selection.push('Neue Leads');
  if (leadTypeSelect.value === 'old') selection.push('Alte Leads');
  document.querySelector('#cityPotentialSelection').textContent = `${selection.join(' · ') || 'Alle geladenen Potenziale'} · Alle Monate · Alle Berater`;

  summary.cities.forEach(city => {
    const row = makeCityPotentialRow(city.name, city, 'city');
    const streetEntries = city.streets.map(street => {
      const child = makeCityPotentialRow(street.name, street, 'street');
      child.hidden = true;
      const advisorRows = street.advisors.length > 1 ? street.allocations.map(advisor => {
        const advisorRow = makeCityPotentialRow(`${advisor.month || 'Ohne Monat'} ${advisor.name}`, advisor, 'advisor');
        advisorRow.hidden = true;
        return advisorRow;
      }) : [];
      let close = () => {};
      if (advisorRows.length) {
        const streetButton = document.createElement('button');
        streetButton.type = 'button';
        streetButton.className = 'city-potential-toggle';
        const setExpanded = expanded => {
          streetButton.textContent = `└ ${street.name} ${expanded ? '▴' : '▾'}`;
          streetButton.setAttribute('aria-expanded', String(expanded));
          streetButton.setAttribute('aria-label', `Berater für ${street.name} in ${city.name} ${expanded ? 'ausblenden' : 'anzeigen'}`);
          advisorRows.forEach(advisorRow => { advisorRow.hidden = !expanded; });
        };
        const toggleStreet = () => setExpanded(streetButton.getAttribute('aria-expanded') !== 'true');
        close = () => setExpanded(false);
        close();
        streetButton.addEventListener('click', event => { event.stopPropagation(); toggleStreet(); });
        child.addEventListener('click', toggleStreet);
        child.firstChild.replaceChildren(streetButton);
      }
      return {row: child, advisorRows, close};
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
      streetEntries.forEach(entry => { entry.row.hidden = !expanded; if (!expanded) entry.close(); });
    });
    row.firstChild.replaceChildren(button);
    body.append(row);
    streetEntries.forEach(entry => body.append(entry.row, ...entry.advisorRows));
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
