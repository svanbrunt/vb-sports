// ─── School colours ──────────────────────────────────────────────────────────
const SCHOOL = {
  WF:   { label: 'WF',   bg: '#9b2335' }, // Wake Forest
  TT:   { label: 'TT',   bg: '#cc0000' }, // Texas Tech
  TEX:  { label: 'TEX',  bg: '#bf5700' }, // Texas
  UNC:  { label: 'UNC',  bg: '#4b9cd3' }, // UNC
  SDSU: { label: 'SDSU', bg: '#a6192e' }, // San Diego State
  FSU:  { label: 'FSU',  bg: '#782f40' }, // Florida State
  OU:   { label: 'OU',   bg: '#841617' }, // Oklahoma
  DUKE: { label: 'DUKE', bg: '#003087' }, // Duke
  STAN: { label: 'STAN', bg: '#8c1515' }, // Stanford
  KSU:  { label: 'KSU',  bg: '#512888' }, // Kansas State
  UCLA: { label: 'UCLA', bg: '#2d68c4' }, // UCLA
};

// ─── Picks ────────────────────────────────────────────────────────────────────
const WIN_PICKS = [
  { player: 'Cameron Young',    school: 'WF',   odds: '16-1',  units: 2   },
  { player: 'Ludvig Aberg',     school: 'TT',   odds: '20-1',  units: 1   },
  { player: 'Jordan Spieth',    school: 'TEX',  odds: '63-1',  units: 1   },
  { player: 'Ben Griffin',      school: 'UNC',  odds: '105-1', units: 0.5 },
];

const T20_PICKS = [
  { player: 'Cameron Young',    school: 'WF',   odds: '-110',  units: 1,   hammers: 0 },
  { player: 'Xander Schauffele',school: 'SDSU', odds: '-110',  units: 7.5, hammers: 1 },
  { player: 'Ludvig Aberg',     school: 'TT',   odds: '+110',  units: 1,   hammers: 0 },
  { player: 'Brooks Koepka',    school: 'FSU',  odds: '+175',  units: 1,   hammers: 0 },
];

const FRL_PICKS = [
  { player: 'Cameron Young',    school: 'WF',   odds: '27-1',  units: 1   },
  { player: 'Ludvig Aberg',     school: 'TT',   odds: '29-1',  units: 1   },
  { player: 'Chris Gotterup',   school: 'OU',   odds: '52-1',  units: 1   },
  { player: 'Ben Griffin',      school: 'UNC',  odds: '67-1',  units: 1   },
  { player: 'Alex Smalley',     school: 'DUKE', odds: '82-1',  units: 1   },
  { player: 'Patrick Rodgers',  school: 'STAN', odds: '130-1', units: 0.5 },
];

const PROPS = [
  {
    type: 'T40 Parlay', label: 't40',
    players: ['Xander Schauffele', 'Ludvig Aberg'],
    schools:  ['SDSU', 'TT'],
    odds: '-110', units: 15, hammers: 2,
  },
  {
    type: 'Exact 1-2 Finish', label: 'exact12',
    players: ['Cameron Young', 'Scottie Scheffler'],
    schools:  ['WF', 'TEX'],
    odds: '125-1', units: 1, hammers: 0,
  },
  {
    type: 'To Make Cut', label: 'makecut',
    players: ['Ben Kern'],
    schools:  ['KSU'],
    odds: '+425', units: 1, hammers: 0,
  },
  {
    type: 'To Miss Cut', label: 'misscut',
    players: ['Patrick Cantlay'],
    schools:  ['UCLA'],
    odds: '+275', units: 1, hammers: 0,
  },
];

// All unique players across all bet types
const ALL_PLAYERS = [...new Set([
  ...WIN_PICKS.map(p => p.player),
  ...T20_PICKS.map(p => p.player),
  ...FRL_PICKS.map(p => p.player),
  ...PROPS.flatMap(p => p.players),
])];

// Name aliases for fuzzy matching against ESPN display names
const ALIASES = {
  'Cameron Young':     ['Cameron Young',    'C. Young'],
  'Ludvig Aberg':      ['Ludvig Aberg',     'L. Aberg', 'Ludvig Åberg', 'L. Åberg'],
  'Jordan Spieth':     ['Jordan Spieth',    'J. Spieth'],
  'Ben Griffin':       ['Ben Griffin',      'B. Griffin'],
  'Xander Schauffele': ['Xander Schauffele','X. Schauffele'],
  'Brooks Koepka':     ['Brooks Koepka',    'B. Koepka'],
  'Chris Gotterup':    ['Chris Gotterup',   'C. Gotterup'],
  'Alex Smalley':      ['Alex Smalley',     'A. Smalley'],
  'Patrick Rodgers':   ['Patrick Rodgers',  'P. Rodgers'],
  'Scottie Scheffler': ['Scottie Scheffler','S. Scheffler'],
  'Ben Kern':          ['Ben Kern',         'B. Kern'],
  'Patrick Cantlay':   ['Patrick Cantlay',  'P. Cantlay'],
};

// ─── State ────────────────────────────────────────────────────────────────────
let liveData    = {};       // ESPN display name → player object
let tourney     = {};       // { name, round, complete, preStart }
let frlWinners  = null;     // array of ESPN names who led after R1, or null if unknown
let frlFinalized = false;   // true when round >= 2 and we have R1 data
let refreshTimer = null;

// ─── Odds / P/L math ─────────────────────────────────────────────────────────
function calcProfit(oddsStr, units) {
  const s = oddsStr.trim();
  // Fractional: "16-1", "29-1", "125-1" etc — no leading sign, contains '-'
  if (!s.startsWith('+') && !s.startsWith('-') && s.includes('-')) {
    const [n, d] = s.split('-').map(Number);
    if (d && !isNaN(n)) return +(units * (n / d)).toFixed(2);
  }
  // American: "+175" or "-110"
  const v = parseInt(s, 10);
  if (!isNaN(v) && v !== 0) {
    return v > 0
      ? +(units * (v / 100)).toFixed(2)
      : +(units * (100 / Math.abs(v))).toFixed(2);
  }
  return 0;
}

function fmtPL(val, includeSign = true) {
  const sign = val >= 0 ? '+' : '';
  const s    = val % 1 === 0 ? String(val) : val.toFixed(1);
  return includeSign ? sign + s + 'u' : s + 'u';
}

// ─── ESPN fetch & parse ───────────────────────────────────────────────────────
async function fetchLeaderboard() {
  document.getElementById('refresh-btn').classList.add('spinning');
  try {
    const res  = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parseESPN(await res.json());
    setStatus('Live · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    document.getElementById('pulse').classList.remove('offline');
    document.getElementById('live-label').textContent = 'Live';
  } catch (e) {
    console.warn('ESPN error:', e);
    setStatus('Offline · retrying in 60s');
    document.getElementById('pulse').classList.add('offline');
    document.getElementById('live-label').textContent = 'Offline';
  } finally {
    document.getElementById('refresh-btn').classList.remove('spinning');
  }
}

function parseESPN(data) {
  const events = data.events || [];
  const event  = events.find(e =>
    (e.name || '').toLowerCase().includes('pga championship')
  ) || events[0];
  if (!event) return;

  const comp      = event.competitions?.[0];
  const period    = comp?.status?.period ?? 1;
  const complete  = !!event.status?.type?.completed;
  const statusStr = event.status?.type?.name || '';
  const preStart  = statusStr.includes('PRE') || statusStr.includes('SCHEDULED');

  tourney = { name: event.name || '108th PGA Championship', round: period, complete, preStart };

  document.getElementById('event-meta').textContent = preStart
    ? `Pre-tournament · ${tourney.name}`
    : complete
    ? `Final · ${tourney.name}`
    : `Live · Round ${period} · ${tourney.name}`;

  // Parse all competitors
  liveData = {};
  const competitors = comp?.competitors || [];
  competitors.forEach(c => {
    const name = c.athlete?.displayName;
    if (!name) return;
    const pos    = c.status?.position?.displayName || '-';
    const posNum = parsePos(pos);
    const score  = c.score || 'E';
    const status = c.status?.type?.name || '';
    const r1     = extractR1(c);
    liveData[name] = { name, pos, posNum, score, status, r1 };
  });

  // Determine FRL once we're in round 2+ (R1 is fully scored)
  if (!frlFinalized && period >= 2 && competitors.length > 0) {
    const r1Ranked = competitors
      .map(c => ({ name: c.athlete?.displayName, r1: extractR1(c) }))
      .filter(x => x.name && x.r1 !== null)
      .sort((a, b) => a.r1 - b.r1);

    if (r1Ranked.length > 0) {
      const best = r1Ranked[0].r1;
      frlWinners  = r1Ranked.filter(x => x.r1 === best).map(x => x.name);
      frlFinalized = true;
      try { localStorage.setItem('pga26_frl', JSON.stringify(frlWinners)); } catch (_) {}
    }
  }

  // Restore FRL from localStorage if not yet computed
  if (!frlFinalized) {
    try {
      const s = localStorage.getItem('pga26_frl');
      if (s) { frlWinners = JSON.parse(s); frlFinalized = true; }
    } catch (_) {}
  }

  renderAll();
}

function extractR1(comp) {
  const stats = {};
  (comp.statistics || []).forEach(s => { stats[s.name] = s.displayValue; });
  if (stats['R1'] && stats['R1'] !== '-') return parseInt(stats['R1'], 10);
  const ls = comp.linescores?.[0];
  return ls?.value != null ? Number(ls.value) : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parsePos(pos) {
  if (!pos || pos === '-') return 9999;
  const up = pos.toUpperCase();
  if (up === 'CUT' || up === 'MC') return 1001;
  if (up === 'WD')  return 1002;
  if (up === 'DQ')  return 1003;
  const n = parseInt(pos.replace(/T/i, ''), 10);
  return isNaN(n) ? 9999 : n;
}

function find(canonicalName) {
  const aliases = ALIASES[canonicalName] || [canonicalName];
  for (const [name, d] of Object.entries(liveData)) {
    if (aliases.some(a =>
      name.toLowerCase() === a.toLowerCase() ||
      name.toLowerCase().includes(a.toLowerCase().split(' ').pop()) // last name match
    )) return d;
  }
  return null;
}

function isCut(p)    { return p && p.posNum >= 1001; }
function scoreClass(s) {
  if (!s || s === '-') return '';
  if (s === 'E') return 'even';
  return s.startsWith('-') ? 'under' : 'over';
}

function posBadge(p) {
  if (!p) return `<span class="pos-badge pnone">–</span>`;
  if (isCut(p)) return `<span class="pos-badge pcut">CUT</span>`;
  const n = p.posNum;
  const cls = n === 1 ? 'p1' : n <= 5 ? 'ptop5' : n <= 20 ? 'ptop20' : n <= 40 ? 'ptop40' : 'pother';
  return `<span class="pos-badge ${cls}">${p.pos} <span style="opacity:.7;font-size:.85em">${p.score}</span></span>`;
}

// ─── Bet outcome logic ────────────────────────────────────────────────────────
// Returns { status: 'win'|'loss'|'pending'|'final-win'|'final-loss', profit }

function winOutcome(pick) {
  const p = find(pick.player);
  if (!p) return { status: 'pending', profit: 0 };
  const profit = calcProfit(pick.odds, pick.units);
  if (isCut(p)) return { status: 'loss', profit: -pick.units };
  if (p.posNum === 1) return { status: 'win', profit };
  return { status: 'loss', profit: -pick.units };
}

function t20Outcome(pick) {
  const p = find(pick.player);
  if (!p) return { status: 'pending', profit: 0 };
  const profit = calcProfit(pick.odds, pick.units);
  if (isCut(p)) return { status: 'loss', profit: -pick.units };
  if (p.posNum <= 20) return { status: 'win', profit };
  return { status: 'loss', profit: -pick.units };
}

function frlOutcome(pick) {
  const profit = calcProfit(pick.odds, pick.units);

  // Finalized: we know who led R1
  if (frlFinalized && frlWinners) {
    const aliases = ALIASES[pick.player] || [pick.player];
    const won = frlWinners.some(w =>
      aliases.some(a =>
        w.toLowerCase().includes(a.toLowerCase().split(' ').pop())
      )
    );
    return { status: won ? 'final-win' : 'final-loss', profit: won ? profit : -pick.units };
  }

  // Round 1 in progress — use current R1 standing as live prediction
  const p = find(pick.player);
  if (!p) return { status: 'pending', profit: 0 };
  if (p.posNum === 1) return { status: 'win', profit };
  return { status: 'loss', profit: -pick.units };
}

function t40ParlayOutcome(prop) {
  const p1 = find(prop.players[0]);
  const p2 = find(prop.players[1]);
  if (!p1 || !p2) return { status: 'pending', profit: 0 };
  const profit = calcProfit(prop.odds, prop.units);
  if (isCut(p1) || isCut(p2)) return { status: 'loss', profit: -prop.units };
  if (p1.posNum <= 40 && p2.posNum <= 40) return { status: 'win', profit };
  return { status: 'loss', profit: -prop.units };
}

function exact12Outcome(prop) {
  const p1 = find(prop.players[0]);
  const p2 = find(prop.players[1]);
  if (!p1 || !p2) return { status: 'pending', profit: 0 };
  const profit = calcProfit(prop.odds, prop.units);
  if (tourney.complete) {
    const won = ([p1.posNum, p2.posNum].sort((a,b)=>a-b).join(',') === '1,2');
    return { status: won ? 'win' : 'loss', profit: won ? profit : -prop.units };
  }
  const positions = [p1.posNum, p2.posNum].sort((a, b) => a - b);
  if (positions[0] === 1 && positions[1] === 2) return { status: 'win', profit };
  return { status: 'loss', profit: -prop.units };
}

function makeCutOutcome(prop) {
  const p = find(prop.players[0]);
  if (!p) return { status: 'pending', profit: 0 };
  const profit = calcProfit(prop.odds, prop.units);
  if (tourney.round >= 3 || tourney.complete) {
    if (isCut(p)) return { status: 'loss', profit: -prop.units };
    return { status: 'win', profit };
  }
  // Cut not yet made — show live position as optimistic indicator
  if (isCut(p)) return { status: 'loss', profit: -prop.units };
  return { status: 'pending', profit: 0 };
}

function missCutOutcome(prop) {
  const p = find(prop.players[0]);
  if (!p) return { status: 'pending', profit: 0 };
  const profit = calcProfit(prop.odds, prop.units);
  if (tourney.round >= 3 || tourney.complete) {
    if (isCut(p)) return { status: 'win', profit };
    return { status: 'loss', profit: -prop.units };
  }
  if (isCut(p)) return { status: 'win', profit };
  return { status: 'pending', profit: 0 };
}

function propOutcome(prop) {
  if (prop.label === 't40')     return t40ParlayOutcome(prop);
  if (prop.label === 'exact12') return exact12Outcome(prop);
  if (prop.label === 'makecut') return makeCutOutcome(prop);
  if (prop.label === 'misscut') return missCutOutcome(prop);
  return { status: 'pending', profit: 0 };
}

// ─── HTML builders ────────────────────────────────────────────────────────────
function schoolBadge(key) {
  if (!key) return '';
  const s = SCHOOL[key];
  return s ? `<span class="school" style="background:${s.bg}">${s.label}</span>` : '';
}

function outcomeBadgeHTML(status, profit) {
  const label =
    status === 'win'        ? 'WIN ✓' :
    status === 'loss'       ? 'LOSS ✗' :
    status === 'final-win'  ? 'WON ✓' :
    status === 'final-loss' ? 'LOST ✗' : 'PENDING';

  const badgeCls =
    status === 'win' || status === 'final-win'   ? 'win' :
    status === 'loss' || status === 'final-loss' ? 'loss' :
    status === 'final-win' || status === 'final-loss' ? 'final' : 'pending';

  const plCls   = profit > 0 ? 'pos' : profit < 0 ? 'neg' : 'zero';
  const plText  = profit === 0 ? '–' : fmtPL(profit);

  return `
    <div class="outcome-col">
      <span class="outcome-badge ${badgeCls}">${label}</span>
      <span class="pl-value ${plCls}">${plText}</span>
    </div>`;
}

// ─── Renderers ────────────────────────────────────────────────────────────────
function renderSection(containerId, picks, outcomeFn) {
  const el = document.getElementById(containerId);
  el.innerHTML = picks.map(pick => {
    const { status, profit } = outcomeFn(pick);
    const p = find(pick.player);
    const hammers = pick.hammers ? `<span class="hammer">${'🔨'.repeat(pick.hammers)}</span>` : '';
    const units = Number.isInteger(pick.units) ? `${pick.units}u` : `${pick.units}u`;
    return `
      <div class="bet-row ${status}">
        ${schoolBadge(pick.school)}
        <div class="bet-info">
          <div class="bet-name">${pick.player}</div>
          <div class="bet-detail">
            <span class="bet-odds">${pick.odds}</span>
            <span class="bet-units">(${units})</span>
            ${hammers}
          </div>
        </div>
        ${posBadge(p)}
        ${outcomeBadgeHTML(status, profit)}
      </div>`;
  }).join('');
}

function renderFRL() {
  // Update FRL header pill
  const pill = document.getElementById('frl-status-pill');
  const note = document.getElementById('frl-note');

  if (frlFinalized && frlWinners?.length) {
    pill.textContent = 'FINAL';
    pill.classList.add('finalized');
    note.style.display = 'block';
    note.textContent = `R1 leader${frlWinners.length > 1 ? 's (tied)' : ''}: ${frlWinners.join(', ')}`;
  } else if (tourney.preStart) {
    pill.textContent = 'Pre-Tournament';
  } else if (tourney.round === 1) {
    pill.textContent = 'R1 Live';
  } else {
    pill.textContent = 'Pending';
  }

  renderSection('frl-bets', FRL_PICKS, frlOutcome);
}

function renderProps() {
  const el = document.getElementById('props-bets');
  el.innerHTML = PROPS.map(prop => {
    const { status, profit } = propOutcome(prop);
    const hammers = prop.hammers ? `<span class="hammer">${'🔨'.repeat(prop.hammers)}</span>` : '';

    const playersHTML = prop.players.map((name, i) => `
      <span class="prop-player">
        ${schoolBadge(prop.schools[i])}
        <span class="prop-name">${name}</span>
      </span>`
    ).join(`<span class="prop-amp">&amp;</span>`);

    const positionsHTML = prop.players.map(name => posBadge(find(name))).join('');

    return `
      <div class="prop-row ${status}">
        <div class="prop-body">
          <div class="prop-type">${prop.type} ${hammers}</div>
          <div class="prop-players">${playersHTML}</div>
          <div class="prop-positions">${positionsHTML}</div>
        </div>
        <div class="prop-right">
          <div class="prop-odds">${prop.odds}</div>
          <span class="prop-units">${prop.units}u</span>
          ${outcomeBadgeHTML(status, profit)}
        </div>
      </div>`;
  }).join('');
}

function renderSummary() {
  const allOutcomes = [
    ...WIN_PICKS.map(p => winOutcome(p)),
    ...T20_PICKS.map(p => t20Outcome(p)),
    ...FRL_PICKS.map(p => frlOutcome(p)),
    ...PROPS.map(p => propOutcome(p)),
  ];

  const allPicks = [
    ...WIN_PICKS, ...T20_PICKS, ...FRL_PICKS, ...PROPS
  ];

  let netPL = 0, staked = 0, winning = 0, losing = 0, pending = 0;

  allOutcomes.forEach((out, i) => {
    const units = allPicks[i].units;
    staked += units;
    if (out.status === 'pending') { pending++; return; }
    netPL += out.profit;
    if (out.profit > 0) winning++;
    else losing++;
  });

  const plEl  = document.getElementById('summary-pl');
  plEl.textContent = fmtPL(netPL);
  plEl.className   = `summary-pl ${netPL > 0 ? 'pos' : netPL < 0 ? 'neg' : 'zero'}`;

  document.getElementById('stat-stake').textContent   = `${staked}u`;
  document.getElementById('stat-winning').textContent = winning;
  document.getElementById('stat-losing').textContent  = losing;
  document.getElementById('stat-pending').textContent = pending;
}

function renderLeaderboard() {
  const wrap = document.getElementById('leaderboard');
  if (Object.keys(liveData).length === 0) {
    wrap.innerHTML = '<div class="loading">Waiting for tournament data...</div>';
    return;
  }

  // Sort tracked players by position
  const rows = ALL_PLAYERS
    .map(name => ({ name, p: find(name) }))
    .sort((a, b) => (a.p?.posNum ?? 9999) - (b.p?.posNum ?? 9999));

  function betTags(name) {
    const tags = [];
    const wo = WIN_PICKS.find(x => x.player === name);
    if (wo) { const { status } = winOutcome(wo); tags.push({ label: 'WIN', status }); }
    const t = T20_PICKS.find(x => x.player === name);
    if (t)  { const { status } = t20Outcome(t);  tags.push({ label: 'T20', status }); }
    const f = FRL_PICKS.find(x => x.player === name);
    if (f)  { const { status } = frlOutcome(f);  tags.push({ label: 'FRL', status }); }
    PROPS.forEach(pr => {
      if (pr.players.includes(name)) {
        const { status } = propOutcome(pr);
        const lbl = pr.label === 't40' ? 'T40' : pr.label === 'exact12' ? '1-2' :
                    pr.label === 'makecut' ? 'CUT+' : 'CUT-';
        tags.push({ label: lbl, status });
      }
    });
    return tags;
  }

  const school = name => {
    const row = [...WIN_PICKS, ...T20_PICKS, ...FRL_PICKS].find(x => x.player === name);
    if (row) return row.school;
    const pr = PROPS.find(p => p.players.includes(name));
    if (pr) return pr.schools[pr.players.indexOf(name)];
    return null;
  };

  const bodyHTML = rows.map(({ name, p }) => {
    const cut = p ? isCut(p) : false;
    const n   = p?.posNum ?? 9999;
    const posCls = cut ? 'pcut' : n === 1 ? 'p1' : n <= 5 ? 'ptop5' : n <= 20 ? 'ptop20' : 'pother';
    const sCls   = scoreClass(p?.score);

    const tags = betTags(name).map(t => {
      const cls =
        t.status === 'win' || t.status === 'final-win'   ? 'on' :
        t.status === 'loss' || t.status === 'final-loss' ? 'off' : 'tbd';
      return `<span class="lb-tag ${cls}">${t.label}</span>`;
    }).join('');

    return `<tr>
      <td><div class="lb-name-cell">${schoolBadge(school(name))}<span>${name}</span></div></td>
      <td><div class="lb-tags">${tags}</div></td>
      <td><span class="lb-pos ${posCls}">${p ? p.pos : '–'}</span></td>
      <td><span class="lb-score ${sCls}">${p ? p.score : '–'}</span></td>
      <td>${p?.r1 != null ? p.r1 : '–'}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="lb-table">
      <thead><tr>
        <th>Player</th><th>Bets</th><th>Pos</th><th>Score</th><th>R1</th>
      </tr></thead>
      <tbody>${bodyHTML}</tbody>
    </table>`;
}

function renderAll() {
  renderSection('win-bets', WIN_PICKS, winOutcome);
  renderSection('t20-bets', T20_PICKS, t20Outcome);
  renderFRL();
  renderProps();
  renderSummary();
  renderLeaderboard();
}

function setStatus(msg) {
  const el = document.getElementById('event-meta');
  if (el.textContent.startsWith('Connecting')) el.textContent = msg;
  else el.textContent = el.textContent.replace(/·[^·]+$/, `· ${msg.replace('Live · ', '')}`);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function refresh() {
  clearInterval(refreshTimer);
  await fetchLeaderboard();
  refreshTimer = setInterval(fetchLeaderboard, 60_000);
}

document.getElementById('refresh-btn').addEventListener('click', refresh);

// Render picks immediately with no data (shows pending state)
renderAll();

// Kick off live fetch
refresh();
