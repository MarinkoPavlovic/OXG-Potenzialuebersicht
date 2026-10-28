export function availableYears(files) {
  return [...new Set(files.map(file=>file.year))].sort((a,b)=>b-a);
}
export function availableMonths(files, year) {
  return [...new Set(files.filter(file=>year==='all'||file.year===Number(year)).map(file=>file.month))].sort((a,b)=>a-b);
}
export function filesForPeriod(files, year, month) {
  const months=Array.isArray(month)?month.map(Number):month==='all'?[]:[Number(month)];
  return files.filter(file=>(year==='all'||file.year===Number(year))&&(months.length===0||months.includes(file.month)));
}
