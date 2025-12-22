import * as cheerio from 'cheerio';

const DOG_URL = 'https://www.xunta.gal/dog/Publicados/2022/20220926/AnuncioG0655-190922-0001_es.html';

function cleanText(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normCode(code) {
  return cleanText(code).toUpperCase().replace(/\s+/g, '');
}

const VALID_PREFIXES = ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE', 'CCEC'];
const CODE_RE = new RegExp(`^(${VALID_PREFIXES.join('|')})\\d+$`);
const CODE_IN_TEXT_RE = new RegExp(`(?:^|\\s)(?:▪|\u25AA|\u2022)?\\s*(${VALID_PREFIXES.join('|')})\\s*(\\d+)\\s*\\.`);

const res = await fetch(DOG_URL, {
  headers: {
    // some sites return different HTML for no UA
    'user-agent': 'Mozilla/5.0 (compatible; avaliacion-bot/1.0)',
  },
});
if (!res.ok) {
  throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
}
const html = await res.text();

// Restrict parsing to the part of the decree that contains the key-competence descriptor table.
// This avoids accidentally matching later curriculum tables (where CE/CC mean other things).
const lower = html.toLowerCase();
const anchor = 'descriptores operativos de las competencias clave';
const startIdx = lower.indexOf(anchor);
if (startIdx < 0) {
  throw new Error(`Could not find anchor section: ${anchor}`);
}

const tailHtml = html.slice(startIdx);
const $ = cheerio.load(tailHtml);

/**
 * The DOG page uses multiple tables; the descriptor table rows include:
 * - first cell: descriptor code (e.g., CCL1)
 * - second cell: Primaria text
 * - third cell: ESO text
 */
const out = {};

const descriptorLikeRe = new RegExp(
  `(?:^|\\s)(?:▪|\u25AA|\u2022)?\\s*(?:${VALID_PREFIXES.join('|')})\\s*\\d+\\s*\\.`,
  'g'
);

const tables = $('table').toArray();
const seenPrefixes = new Set();

// The key-competence descriptor table is split across multiple HTML tables close to the anchor.
// We scan early tables first and stop once we've collected all 8 key competence prefixes.
for (let i = 0; i < tables.length; i++) {
  const table = tables[i];
  const text = $(table).text();
  const score = (text.match(descriptorLikeRe) || []).length;
  if (score === 0) continue;

  $(table)
    .find('tbody tr')
    .each((_j, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 2) return;

      const primariaRaw = cleanText($(cells[0]).text());
      const esoRaw = cleanText($(cells[1]).text());

      const m = primariaRaw.match(CODE_IN_TEXT_RE) || esoRaw.match(CODE_IN_TEXT_RE);
      if (!m) return;

      const prefix = normCode(m[1]);
      const num = String(m[2] || '').trim();
      const code = `${prefix}${num}`;
      if (!CODE_RE.test(code)) return;

      const stripLeading = (text) => {
        // Remove leading bullet + CODE.
        const mm = text.match(CODE_IN_TEXT_RE);
        if (!mm) return text;
        const idx = text.indexOf('.') ;
        return idx >= 0 ? cleanText(text.slice(idx + 1)) : text;
      };

      const primaria = stripLeading(primariaRaw);
      const eso = stripLeading(esoRaw);
      if (!primaria) return;

      if (!out[prefix]) out[prefix] = [];

      const existing = out[prefix].find((x) => x.code === code);
      if (existing) {
        if (primaria.length > existing.primaria.length) existing.primaria = primaria;
        if (eso.length > existing.eso.length) existing.eso = eso;
        return;
      }

      out[prefix].push({ code, primaria, eso });
      seenPrefixes.add(prefix);
  });

  if (VALID_PREFIXES.every((p) => seenPrefixes.has(p))) {
    break;
  }
}

// Sort by numeric suffix
for (const prefix of Object.keys(out)) {
  out[prefix].sort((a, b) => {
    const na = Number(a.code.replace(prefix, ''));
    const nb = Number(b.code.replace(prefix, ''));
    return na - nb;
  });
}

// Validate we actually extracted something sensible
const counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));

console.error('Extracted counts:', counts);
console.log(JSON.stringify(out, null, 2));
