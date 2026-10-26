import { config } from './config.mjs';
export const PROJECT_ID = config.id;
export const MAX_BACKUP_BYTES = 2_000_000;
export function dayKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function recentDays(now = new Date()) {
  return Array.from({length:7}, (_, index) => { const date = new Date(now); date.setDate(date.getDate()-6+index); return dayKey(date); });
}
export function toggleDay(days, day = dayKey()) {
  if (!validDay(day)) throw new Error('Ongeldige datum.');
  return days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
}
export function validateItems(items) {
  if (!Array.isArray(items) || items.length > 200) throw new Error('Maximaal 200 items worden ondersteund.');
  const ids = new Set();
  const clean = items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120
      || typeof item.detail !== 'string' || item.detail.length > 2000
      || !config.states.some(s => s.value === item.status)
      || !(item.date === '' || validDay(item.date))
      || !Array.isArray(item.days) || item.days.length > 10000
      || item.days.some(d => !validDay(d)) || new Set(item.days).size !== item.days.length
      || typeof item.updatedAt !== 'string' || Number.isNaN(Date.parse(item.updatedAt)))
      throw new Error('Een item bevat ongeldige gegevens. Er is niets overschreven.');
    if ((config.kind !== 'habits' && item.days.length) || (config.kind !== 'tasks' && item.date !== ''))
      throw new Error('Deze gegevens passen niet bij dit project.');
    ids.add(item.id);
    return {id:item.id,title:item.title.trim(),detail:item.detail,status:item.status,date:item.date,days:[...item.days].sort(),updatedAt:item.updatedAt};
  });
  if (new TextEncoder().encode(JSON.stringify(clean)).length > MAX_BACKUP_BYTES-1024) throw new Error('Je gegevens zijn samen te groot (maximaal 2 MB).');
  return clean;
}
export function validateDocument(value) {
  if (value === undefined) return {schemaVersion:1,revision:0,items:[]};
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER)
    throw new Error('De opgeslagen gegevens zijn ongeldig. Ze zijn niet overschreven.');
  return {schemaVersion:1,revision:value.revision,items:validateItems(value.items)};
}
export function exportBackup(items) {
  return JSON.stringify({apphubBackup:1,project:PROJECT_ID,exportedAt:new Date().toISOString(),items:validateItems(items)});
}
export function importBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('De back-up is te groot (maximaal 2 MB).');
  let value; try {value=JSON.parse(text);} catch {throw new Error('Dit is geen geldige JSON-back-up.');}
  if (!value || value.apphubBackup !== 1 || value.project !== PROJECT_ID || typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt)))
    throw new Error('Deze back-up hoort niet bij dit project.');
  return validateItems(value.items);
}
