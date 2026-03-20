// Build script - uses only Node.js built-ins (no npm packages needed)
const fs = require('fs');
const path = require('path');

const LIBBY_URL = 'http://ical-cdn.teamsnap.com/team_schedule/filter/games/b464a2e6-ea1a-487b-afd2-732cdda1a61e.ics';
const SLOAN_URL = 'http://ical-cdn.teamsnap.com/team_schedule/a879d7f8-da28-4e71-b144-3b1229c0a24a.ics';
const HADLEY_URL = 'https://svanbrunt.github.io/clippersu8/';
const HADLEY_LOCATION = '24-7 UK Soccer, 210 Hegenberger Loop, Oakland, CA 94621';

// Simple iCal parser - extracts VEVENT blocks
function parseIcal(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const ev = {};
    // Handle folded lines (lines starting with space/tab are continuations)
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    for (const line of unfolded.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      let key = line.slice(0, colonIdx);
      const val = line.slice(colonIdx + 1);
      // Strip parameters like DTSTART;TZID=...
      const semiIdx = key.indexOf(';');
      const params = semiIdx >= 0 ? key.slice(semiIdx + 1) : '';
      if (semiIdx >= 0) key = key.slice(0, semiIdx);
      ev[key] = val;
      if (params) ev[key + '_PARAMS'] = params;
    }
    events.push(ev);
  }
  return events;
}

// Parse iCal datetime like "20260307T140000" with timezone
function parseIcalDate(dateStr, params) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, yr, mo, dy, hr, mi, se] = m;
  // Construct as a local time string for the timezone
  // TeamSnap uses America/Los_Angeles
  const dt = new Date(`${yr}-${mo}-${dy}T${hr}:${mi}:${se}`);
  // Determine if PDT or PST (rough: DST starts 2nd Sunday of March, ends 1st Sunday of November)
  const month = parseInt(mo);
  const day = parseInt(dy);
  const hour = parseInt(hr);
  let isPDT = false;
  if (month > 3 && month < 11) isPDT = true;
  else if (month === 3 && day >= 8) isPDT = true; // approximate DST start
  else if (month === 11 && day < 1) isPDT = true;
  const offset = isPDT ? '-07:00' : '-08:00';
  return `${yr}-${mo}-${dy}T${hr}:${mi}:${se}${offset}`;
}

function parseIcalEvents(rawEvents, child, sport, calendarId) {
  return rawEvents.map((ev, i) => {
    const summary = ev.SUMMARY || '';
    const description = (ev.DESCRIPTION || '').replace(/\\n/g, '\n').replace(/\\,/g, ',');
    const location = (ev.LOCATION || '').replace(/\\,/g, ',').replace(/\\n/g, ', ');

    const date = parseIcalDate(ev.DTSTART, ev.DTSTART_PARAMS);
    const endDate = parseIcalDate(ev.DTEND, ev.DTEND_PARAMS);

    // Extract notes from description
    const noteParts = [];
    const arrivalMatch = description.match(/Arrive\s*:?\s*(\d{1,2}:\d{2}\s*[AP]M)/i)
      || description.match(/Arrival\s*(?:Time)?\s*:?\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (arrivalMatch) noteParts.push(`Arrive ${arrivalMatch[1]}`);
    const jerseyMatch = description.match(/\(([^)]*(?:[Jj]ersey|[Ss]horts|[Tt]-[Ss]hirt)[^)]*)\)/);
    if (jerseyMatch) noteParts.push(jerseyMatch[1].trim());

    const snackMatch = description.match(/Snack\s*[Dd]uty\s*:?\s*([^\n]+)/i);

    return {
      id: `${calendarId}-${i}`,
      child,
      sport,
      calendar: calendarId,
      title: summary,
      date,
      endDate,
      location,
      notes: noteParts.length ? noteParts.join(' | ') : null,
      snacks: snackMatch ? snackMatch[1].trim() : null,
    };
  });
}

// Parse Hadley data from HTML (simple regex-based, no cheerio needed)
function parseHadleyHtml(html) {
  // Find the G3 panel section
  const g3Match = html.match(/g3-panel[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (!g3Match) return null;

  const tbody = g3Match[1];
  const rows = [...tbody.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi)];
  const events = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim()
    );
    if (cells.length < 2) continue;

    const dateText = cells[0];
    const opponent = cells[1];

    if (!dateText || /bye/i.test(opponent)) continue;

    // Parse all times from the date cell
    const allTimes = [...dateText.matchAll(/(\d{1,2}(?::\d{2})?\s*[AP]M)/gi)];
    // Parse the date portion
    const dateMatch = dateText.match(/(\w+)\s+(\d+)/);
    if (!dateMatch || allTimes.length === 0) continue;

    const monthStr = dateMatch[1];
    const day = parseInt(dateMatch[2]);
    const monthMap = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const month = monthMap[monthStr];
    if (!month) continue;

    // Check for multiple opponents (double-header with +)
    const opponents = opponent.split(/\s*\+\s*/);

    if (opponents.length > 1 && allTimes.length > 1) {
      // Double-header
      for (let j = 0; j < opponents.length; j++) {
        const t = parseTimeStr(allTimes[j] ? allTimes[j][1] : allTimes[0][1]);
        const offset = (month > 3 || (month === 3 && day >= 8)) ? '-07:00' : '-08:00';
        const iso = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:00${offset}`;
        const endH = t.h + Math.floor((t.m + 55) / 60);
        const endM = (t.m + 55) % 60;
        const endIso = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00${offset}`;
        events.push({ date: iso, end: endIso, opponent: opponents[j].trim() });
      }
    } else {
      const t = parseTimeStr(allTimes[0][1]);
      const offset = (month > 3 || (month === 3 && day >= 8)) ? '-07:00' : '-08:00';
      const iso = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:00${offset}`;
      const endH = t.h + Math.floor((t.m + 55) / 60);
      const endM = (t.m + 55) % 60;
      const endIso = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00${offset}`;
      const snacksText = cells.length > 3 ? cells[3].replace(/[^\w\s,]/g, '').trim() : '';
      events.push({ date: iso, end: endIso, opponent: opponent.trim(), snacks: snacksText || undefined });
    }
  }

  return events.length > 0 ? events : null;
}

function parseTimeStr(str) {
  const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return { h: 12, m: 0 };
  let h = parseInt(match[1]);
  const m = parseInt(match[2] || '0');
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, m };
}

// Fallback Hadley G3 data
const HADLEY_FALLBACK = [
  { date: '2026-02-22T10:00:00-08:00', end: '2026-02-22T10:55:00-08:00', opponent: 'CFC G2' },
  { date: '2026-03-01T10:00:00-08:00', end: '2026-03-01T10:55:00-08:00', opponent: 'CV G4' },
  { date: '2026-03-08T12:00:00-07:00', end: '2026-03-08T12:55:00-07:00', opponent: 'ASC G1' },
  { date: '2026-03-15T09:00:00-07:00', end: '2026-03-15T09:55:00-07:00', opponent: 'CV G1', snacks: 'Daniela' },
  { date: '2026-04-19T09:00:00-07:00', end: '2026-04-19T09:55:00-07:00', opponent: 'EBU G1' },
  { date: '2026-04-26T10:00:00-07:00', end: '2026-04-26T10:55:00-07:00', opponent: 'CFC G1' },
  { date: '2026-04-26T13:00:00-07:00', end: '2026-04-26T13:55:00-07:00', opponent: 'CV G3' },
  { date: '2026-05-03T11:00:00-07:00', end: '2026-05-03T11:55:00-07:00', opponent: 'CV G2' },
];

function hadleyToEvents(data) {
  return data.map((g, i) => ({
    id: `hadley-soccer-${i}`,
    child: 'Hadley',
    sport: 'Soccer',
    calendar: 'hadley-soccer',
    title: `vs ${g.opponent}`,
    date: g.date,
    endDate: g.end,
    location: HADLEY_LOCATION,
    notes: null,
    snacks: g.snacks || null,
  }));
}

function toIcalDate(isoStr) {
  const d = new Date(isoStr);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const hr = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const se = String(d.getSeconds()).padStart(2, '0');
  return `${yr}${mo}${dy}T${hr}${mi}${se}`;
}

function escIcal(str) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

async function main() {
  console.log('Fetching Libby Basketball...');
  const libbyRes = await fetch(LIBBY_URL);
  const libbyText = await libbyRes.text();
  const libbyRaw = parseIcal(libbyText);
  const libbyEvents = parseIcalEvents(libbyRaw, 'Libby', 'Basketball', 'libby-basketball');
  console.log(`  ${libbyEvents.length} events`);

  console.log('Fetching Sloan Soccer...');
  const sloanRes = await fetch(SLOAN_URL);
  const sloanText = await sloanRes.text();
  const sloanRaw = parseIcal(sloanText);
  // Filter to 2026+ events only
  const sloanFiltered = sloanRaw.filter(ev => {
    const dt = ev.DTSTART || '';
    return dt >= '20260101';
  });
  const sloanEvents = parseIcalEvents(sloanFiltered, 'Sloan', 'Soccer', 'sloan-soccer');
  console.log(`  ${sloanEvents.length} events`);

  console.log('Loading Hadley Soccer (CFC G3)...');
  // Using curated data - the HTML page structure is complex and changes;
  // update this array when the schedule changes.
  const hadleyData = HADLEY_FALLBACK;
  const hadleyEvents = hadleyToEvents(hadleyData);
  console.log(`  ${hadleyEvents.length} events`);

  const allEvents = [...libbyEvents, ...sloanEvents, ...hadleyEvents]
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const output = {
    lastUpdated: new Date().toISOString(),
    events: allEvents,
  };

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'events.json'), JSON.stringify(output, null, 2));
  console.log(`\nWrote ${allEvents.length} events to data/events.json`);

  // Generate combined iCal feed
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VB Sports//Combined Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VB Sports',
    'X-WR-TIMEZONE:America/Los_Angeles',
  ];

  for (const ev of allEvents) {
    const dtStart = toIcalDate(ev.date);
    const dtEnd = toIcalDate(ev.endDate);
    const uid = `${ev.id}@vbsports`;
    const summary = `${ev.child} ${ev.sport}: ${ev.title}`;
    const desc = [ev.notes, ev.snacks ? `Snacks: ${ev.snacks}` : null].filter(Boolean).join('\\n');

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTART;TZID=America/Los_Angeles:${dtStart}`);
    icsLines.push(`DTEND;TZID=America/Los_Angeles:${dtEnd}`);
    icsLines.push(`SUMMARY:${escIcal(summary)}`);
    if (ev.location) icsLines.push(`LOCATION:${escIcal(ev.location)}`);
    if (desc) icsLines.push(`DESCRIPTION:${escIcal(desc)}`);
    icsLines.push(`DTSTAMP:${toIcalDate(new Date().toISOString())}`);
    icsLines.push('END:VEVENT');
  }
  icsLines.push('END:VCALENDAR');
  fs.writeFileSync(path.join(dataDir, 'vb-sports.ics'), icsLines.join('\r\n'));
  console.log(`Wrote combined iCal feed to data/vb-sports.ics`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
