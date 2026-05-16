// ─── Picks Data ───────────────────────────────────────────────────────────────

const SCHOOL = {
  WF:   { label: 'WF',   color: '#9b2335' },   // Wake Forest — Cameron Young
  TT:   { label: 'TT',   color: '#cc0000' },   // Texas Tech
  TEX:  { label: 'TEX',  color: '#bf5700' },   // Texas
  UNC:  { label: 'UNC',  color: '#4b9cd3' },   // UNC
  SDSU: { label: 'SDSU', color: '#a6192e' },   // San Diego State
  FSU:  { label: 'FSU',  color: '#782f40' },   // Florida State
  OU:   { label: 'OU',   color: '#841617' },   // Oklahoma
  DUKE: { label: 'DUKE', color: '#003087' },   // Duke
  STAN: { label: 'STAN', color: '#8c1515' },   // Stanford
  KSU:  { label: 'KSU',  color: '#512888' },   // Kansas State
  UCLA: { label: 'UCLA', color: '#2d68c4' },   // UCLA
};

const WIN_PICKS = [
  { player: 'Cameron Young',   school: 'WF',   odds: '16-1',  units: 2   },
  { player: 'Ludvig Aberg',    school: 'TT',   odds: '20-1',  units: 1   },
  { player: 'Jordan Spieth',   school: 'TEX',  odds: '63-1',  units: 1   },
  { player: 'Ben Griffin',     school: 'UNC',  odds: '105-1', units: 0.5 },
];

const T20_PICKS = [
  { player: 'Cameron Young',    school: 'WF',   odds: '-110',  units: 1,   hammers: 0 },
  { player: 'Xander Schauffele',school: 'SDSU', odds: '-110',  units: 7.5, hammers: 1 },
  { player: 'Ludvig Aberg',     school: 'TT',   odds: '+110',  units: 1,   hammers: 0 },
  { player: 'Brooks Koepka',    school: 'FSU',  odds: '+175',  units: 1,   hammers: 0 },
];

const FRL1_PICKS = [
  { player: 'Cameron Young',  school: 'WF',  odds: '27-1', units: 1 },
  { player: 'Ludvig Aberg',   school: 'TT',  odds: '29-1', units: 1 },
  { player: 'Chris Gotterup', school: 'OU',  odds: '52-1', units: 1 },
];

const FRL2_PICKS = [
  { player: 'Ben Griffin',     school: 'UNC',  odds: '67-1',  units: 1   },
  { player: 'Alex Smalley',    school: 'DUKE', odds: '82-1',  units: 1   },
  { player: 'Patrick Rodgers', school: 'STAN', odds: '130-1', units: 0.5 },
];

const PROPS = [
  {
    type: 'T40 Parlay',
    players: ['Xander Schauffele', 'Ludvig Aberg'],
    schools: ['SDSU', 'TT'],
    odds: '-110', units: 15, hammers: 2, betType: 't40parlay',
  },
  {
    type: 'Exact 1-2 Finish',
    players: ['Cameron Young', 'Scottie Scheffler'],
    schools: ['WF', 'TEX'],
    odds: '125-1', units: 1, hammers: 0, betType: 'exact12',
  },
  {
    type: 'To Make Cut',
    players: ['Ben Kern'],
    schools: ['KSU'],
    odds: '+425', units: 1, hammers: 0, betType: 'makecut',
  },
  {
    type: 'To Miss Cut',
    players: ['Patrick Cantlay'],
    schools: ['UCLA'],
    odds: '+275', units: 1, hammers: 0, betType: 'misscut',
  },
];

// All tracked players (deduped)
const ALL_PLAYERS = [
  ...new Set([
    ...WIN_PICKS.map(p => p.player),
    ...T20_PICKS.map(p => p.player),
    ...FRL1_PICKS.map(p => p.player),
    ...FRL2_PICKS.map(p => p.player),
    ...PROPS.flatMap(p => p.players),
  ]),
];

// Aliases for fuzzy name matching against ESPN data
const ALIASES = {
  'Cameron Young':     ['Cameron Young', 'C. Young'],
  'Ludvig Aberg':      ['Ludvig Aberg', 'L. Aberg', 'Ludvig Åberg', 'L. Åberg'],
  'Jordan Spieth':     ['Jordan Spieth', 'J. Spieth'],
  'Ben Griffin':       ['Ben Griffin', 'B. Griffin'],
  'Xander Schauffele': ['Xander Schauffele', 'X. Schauffele'],
  'Brooks Koepka':     ['Brooks Koepka', 'B. Koepka'],
  'Chris Gotterup':    ['Chris Gotterup', 'C. Gotterup'],
  'Alex Smalley':      ['Alex Smalley', 'A. Smalley'],
  'Patrick Rodgers':   ['Patrick Rodgers', 'P. Rodgers'],
  'Scottie Scheffler': ['Scottie Scheffler', 'S. Scheffler'],
  'Ben Kern':          ['Ben Kern', 'B. Kern'],
  'Patrick Cantlay':   ['Patrick Cantlay', 'P. Cantlay'],
};

// ─── State ────────────────────────────────────────────────────────────────────

let playerData = {};     // name → { pos, posNum, score, r1, r1Num, round, status }
let tournamentInfo = {}; // { name, status, round, cutLine }
let frlWinner = null;    // saved round-1 leader
let refreshTimer = null;

// ─── ESPN API ─────────────────────────────────────────────────────────────────

async function fetchLeaderboard() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');

  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    processData(data);
    setStatus('Live · updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    document.getElementById('live-pulse').classList.remove('offline');
  } catch (e) {
    console.warn('ESPN fetch failed:', e);
    setStatus('Offline — retrying in 60s');
    document.getElementById('live-pulse').classList.add('offline');
  } finally {
    btn.classList.remove('spinning');
  }
}

function processData(data) {
  const events = data.events || [];

  // Prefer an event named "PGA Championship"; fall back to first event
  const event =
    events.find(e =>
      e.name?.toLowerCase().includes('pga championship') ||
      e.shortName?.toLowerCase().includes('pga championship')
    ) || events[0];

  if (!event) {
    document.getElementById('event-info').textContent = 'No active PGA Tour event found.';
    return;
  }

  const competition = event.competitions?.[0];
  if (!competition) return;

  // Tournament metadata
  const statusName = event.status?.type?.name || '';
  const isComplete = event.status?.type?.completed || false;
  const currentRound = competition.status?.period || 1;

  tournamentInfo = {
    name: event.name || '2026 PGA Championship',
    status: statusName,
    round: currentRound,
    complete: isComplete,
  };

  document.getElementById('event-info').textContent =
    isComplete
      ? `Final · ${event.name}`
      : statusName.includes('PRE')
        ? `Pre-tournament · ${event.name}`
        : `Live · Round ${currentRound} · ${event.name}`;

  // Parse all competitors
  playerData = {};
  const allCompetitors = competition.competitors || [];

  allCompetitors.forEach(comp => {
    const name = comp.athlete?.displayName;
    if (!name) return;

    const pos = comp.status?.position?.displayName || '-';
    const posNum = parsePos(pos);
    const score = comp.score || 'E';
    const status = comp.status?.type?.name || '';

    // Round-by-round from statistics array
    const stats = {};
    (comp.statistics || []).forEach(s => {
      stats[s.name] = s.displayValue;
    });

    // Alternatively from linescores
    const linescores = comp.linescores || [];

    const r1Raw = stats['R1'] || (linescores[0]?.value != null ? String(linescores[0].value) : null);
    const r1Num = r1Raw && r1Raw !== '-' ? parseInt(r1Raw) : null;

    playerData[name] = { name, pos, posNum, score, r1: r1Raw, r1Num, round: currentRound, status };
  });

  // Detect first-round leader once round 1 data exists
  updateFRL(currentRound, allCompetitors);

  renderAll();
}

function updateFRL(currentRound, competitors) {
  // If we're past round 1 and haven't saved FRL yet, compute from R1 scores
  if (currentRound >= 2 && !frlWinner) {
    const withR1 = competitors
      .map(c => ({
        name: c.athlete?.displayName,
        r1: parseR1Score(c),
      }))
      .filter(p => p.name && p.r1 !== null)
      .sort((a, b) => a.r1 - b.r1);

    if (withR1.length > 0) {
      frlWinner = withR1[0].name;
      try { localStorage.setItem('pga_frl_winner', frlWinner); } catch (_) {}
    }
  }

  // Restore from localStorage on page load
  if (!frlWinner) {
    try {
      const saved = localStorage.getItem('pga_frl_winner');
      if (saved) frlWinner = saved;
    } catch (_) {}
  }
}

function parseR1Score(comp) {
  const stats = {};
  (comp.statistics || []).forEach(s => { stats[s.name] = s.displayValue; });
  const r1 = stats['R1'];
  if (r1 && r1 !== '-') return parseInt(r1);
  const ls = comp.linescores?.[0];
  return ls?.value != null ? Number(ls.value) : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePos(pos) {
  if (!pos || pos === '-' || pos === 'E') return 999;
  if (pos === 'CUT' || pos === 'MC') return 1000;
  if (pos === 'WD')  return 1001;
  if (pos === 'DQ')  return 1002;
  const n = parseInt(pos.replace(/T/i, ''));
  return isNaN(n) ? 999 : n;
}

function findPlayer(canonicalName) {
  const aliases = ALIASES[canonicalName] || [canonicalName];
  for (const [espnName, data] of Object.entries(playerData)) {
    if (
      aliases.some(a =>
        espnName.toLowerCase() === a.toLowerCase() ||
        espnName.toLowerCase().includes(a.toLowerCase()) ||
        a.toLowerCase().includes(espnName.toLowerCase())
      )
    ) return data;
  }
  return null;
}

function scoreClass(scoreStr) {
  if (!scoreStr || scoreStr === '-') return '';
  if (scoreStr === 'E') return 'even';
  return scoreStr.startsWith('-') ? 'under' : 'over';
}

function posBadgeClass(posNum, status) {
  if (status?.includes('CUT') || posNum >= 1000) return 'pos-cut';
  if (posNum === 1)   return 'pos-1';
  if (posNum <= 5)    return 'pos-top5';
  if (posNum <= 20)   return 'pos-top20';
  if (posNum <= 40)   return 'pos-top40';
  return 'pos-other';
}

function posBadgeHTML(pData) {
  if (!pData) return `<span class="pos-badge pos-pending">–</span>`;
  const cut = pData.status?.includes('CUT') || pData.posNum >= 1000;
  if (cut) return `<span class="pos-badge pos-cut">CUT</span>`;
  const cls = posBadgeClass(pData.posNum, pData.status);
  return `<span class="pos-badge ${cls}">${pData.pos} <span style="opacity:0.7;font-size:0.85em">${pData.score}</span></span>`;
}

// ─── Bet status logic ─────────────────────────────────────────────────────────

function winStatus(p) {
  if (!p) return 'pending';
  if (p.status?.includes('CUT') || p.posNum >= 1000) return 'losing';
  if (p.posNum === 1) return 'winning';
  if (p.posNum <= 5)  return 'alive';
  return 'losing';
}

function t20Status(p) {
  if (!p) return 'pending';
  if (p.status?.includes('CUT') || p.posNum >= 1000) return 'losing';
  if (p.posNum <= 20) return 'winning';
  if (p.posNum <= 25) return 'alive';
  return 'losing';
}

function frlStatus(playerName) {
  const p = findPlayer(playerName);
  const round = tournamentInfo.round || 1;

  if (round === 1 || !frlWinner) {
    // Round 1 in progress — show current standing
    if (!p) return 'pending';
    if (p.posNum === 1) return 'winning';
    if (p.posNum <= 5)  return 'alive';
    return 'losing';
  }

  // Round 1 complete — settled
  if (frlWinner) {
    const aliases = ALIASES[playerName] || [playerName];
    const won = aliases.some(a =>
      frlWinner.toLowerCase().includes(a.toLowerCase()) ||
      a.toLowerCase().includes(frlWinner.toLowerCase())
    );
    return won ? 'settled-win' : 'settled-loss';
  }

  return 'pending';
}

function makeCutStatus(p) {
  if (!p) return 'pending';
  if (tournamentInfo.round >= 3) {
    if (p.status?.includes('CUT') || p.posNum >= 1000) return 'losing';
    return 'winning';
  }
  return 'alive'; // cut not yet determined
}

function missCutStatus(p) {
  if (!p) return 'pending';
  if (tournamentInfo.round >= 3) {
    if (p.status?.includes('CUT') || p.posNum >= 1000) return 'winning';
    return 'losing';
  }
  return 'alive';
}

function t40parlayStatus(p1, p2) {
  if (!p1 || !p2) return 'pending';
  const cut1 = p1.posNum >= 1000;
  const cut2 = p2.posNum >= 1000;
  if (cut1 || cut2) return 'losing';
  const both40 = p1.posNum <= 40 && p2.posNum <= 40;
  const either40 = p1.posNum <= 40 || p2.posNum <= 40;
  if (both40) return 'winning';
  if (either40) return 'alive';
  return 'losing';
}

function exact12Status(p1, p2) {
  if (!p1 || !p2) return 'pending';
  if (tournamentInfo.complete) {
    return (p1.posNum === 1 && p2.posNum === 2) || (p1.posNum === 2 && p2.posNum === 1)
      ? 'settled-win' : 'settled-loss';
  }
  const positions = [p1.posNum, p2.posNum].sort((a, b) => a - b);
  if (positions[0] === 1 && positions[1] === 2) return 'winning';
  if (positions[0] <= 2 && positions[1] <= 5) return 'alive';
  return 'losing';
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function schoolBadge(schoolKey) {
  const s = SCHOOL[schoolKey];
  if (!s) return '';
  return `<span class="school-badge" style="background:${s.color}">${s.label}</span>`;
}

function hammers(n) {
  if (!n) return '';
  return `<span class="hammer">${'🔨'.repeat(n)}</span>`;
}

function renderPickList(containerId, picks, statusFn) {
  const el = document.getElementById(containerId);
  el.innerHTML = picks.map(pick => {
    const p = findPlayer(pick.player);
    const status = statusFn(pick, p);
    const unitsLabel = Number.isInteger(pick.units)
      ? `${pick.units}u`
      : `${pick.units}u`;

    return `
      <li class="pick-item status-${status}">
        ${schoolBadge(pick.school)}
        <div class="pick-info">
          <div class="pick-name">${pick.player}</div>
          <div class="pick-meta">
            <span class="odds">${pick.odds}</span>
            <span class="units"> (${unitsLabel})</span>
            ${hammers(pick.hammers || 0)}
          </div>
        </div>
        ${posBadgeHTML(p)}
      </li>`;
  }).join('');
}

function renderProps() {
  const el = document.getElementById('props-list');
  el.innerHTML = PROPS.map(prop => {
    const players = prop.players.map(name => findPlayer(name));
    let status = 'pending';

    if (prop.betType === 't40parlay') status = t40parlayStatus(players[0], players[1]);
    else if (prop.betType === 'exact12') status = exact12Status(players[0], players[1]);
    else if (prop.betType === 'makecut') status = makeCutStatus(players[0]);
    else if (prop.betType === 'misscut') status = missCutStatus(players[0]);

    const playerHTML = prop.players.map((name, i) => {
      const p = players[i];
      return `
        <span class="prop-player">
          ${schoolBadge(prop.schools[i])}
          <span class="prop-player-name">${name}</span>
        </span>`;
    }).join(`<span class="prop-connector">&amp;</span>`);

    const statusBadges = prop.players.map((name, i) => {
      const p = players[i];
      if (!p) return '';
      return posBadgeHTML(p);
    }).join('');

    return `
      <li class="prop-item status-${status}">
        <div class="prop-left">
          <div class="prop-type">${prop.type}${hammers(prop.hammers)}</div>
          <div class="prop-players">${playerHTML}</div>
          <div class="prop-status-badges">${statusBadges}</div>
        </div>
        <div class="prop-right">
          <div class="prop-odds">${prop.odds}</div>
          <span class="prop-units">${prop.units}u</span>
        </div>
      </li>`;
  }).join('');
}

function renderLeaderboard() {
  const wrap = document.getElementById('leaderboard-wrap');

  if (Object.keys(playerData).length === 0) {
    wrap.innerHTML = '<div class="loading-msg">Waiting for tournament data...</div>';
    return;
  }

  // Build rows for all tracked players
  const rows = ALL_PLAYERS.map(name => {
    const p = findPlayer(name);
    return { name, p };
  }).sort((a, b) => {
    const posA = a.p?.posNum ?? 999;
    const posB = b.p?.posNum ?? 999;
    return posA - posB;
  });

  // Determine bets for each player
  function playerBets(name) {
    const tags = [];
    if (WIN_PICKS.some(p => p.player === name)) {
      const p = findPlayer(name);
      const s = winStatus(p);
      tags.push({ label: 'WIN', status: s });
    }
    if (T20_PICKS.some(p => p.player === name)) {
      const p = findPlayer(name);
      const s = t20Status(p);
      tags.push({ label: 'T20', status: s });
    }
    if ([...FRL1_PICKS, ...FRL2_PICKS].some(p => p.player === name)) {
      const s = frlStatus(name);
      tags.push({ label: 'FRL', status: s });
    }
    PROPS.forEach(prop => {
      if (prop.players.includes(name)) {
        tags.push({ label: prop.type.split(' ')[0], status: 'pending' });
      }
    });
    return tags;
  }

  const tableRows = rows.map(({ name, p }) => {
    const cut = p?.posNum >= 1000;
    const posCls = cut ? 'pos-cut'
      : p?.posNum === 1 ? 'pos-1'
      : p?.posNum <= 5 ? 'pos-top5'
      : p?.posNum <= 20 ? 'pos-top20'
      : p?.posNum <= 999 ? 'pos-other' : 'pos-other';

    const sCls = scoreClass(p?.score);
    const bets = playerBets(name);

    const betTagHTML = bets.map(b => {
      const tagCls =
        b.status === 'winning' || b.status === 'settled-win' ? 'on'
        : b.status === 'alive' ? 'close'
        : b.status === 'losing' || b.status === 'settled-loss' ? 'off'
        : '';
      return `<span class="lb-bet-tag ${tagCls}">${b.label}</span>`;
    }).join('');

    // Find the school for this player (from any pick group)
    const pickEntry =
      WIN_PICKS.find(x => x.player === name) ||
      T20_PICKS.find(x => x.player === name) ||
      FRL1_PICKS.find(x => x.player === name) ||
      FRL2_PICKS.find(x => x.player === name) ||
      null;
    const schoolEntry = PROPS.find(pr => pr.players.includes(name));
    const schoolKey = pickEntry?.school || (schoolEntry ? PROPS.find(pr => pr.players.includes(name))?.schools[PROPS.find(pr => pr.players.includes(name)).players.indexOf(name)] : null);

    return `
      <tr>
        <td>
          <div class="lb-player-cell">
            ${schoolKey ? schoolBadge(schoolKey) : ''}
            <span>${name}</span>
          </div>
        </td>
        <td><div class="lb-bets">${betTagHTML}</div></td>
        <td><span class="lb-pos ${posCls}">${p ? p.pos : '–'}</span></td>
        <td><span class="lb-score ${sCls}">${p ? p.score : '–'}</span></td>
        <td>${p?.r1 && p.r1 !== '-' ? p.r1 : '–'}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="lb-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Bets</th>
          <th>Pos</th>
          <th>Score</th>
          <th>R1</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;
}

function renderAll() {
  renderPickList('win-list',  WIN_PICKS,  (pick, p) => winStatus(p));
  renderPickList('t20-list',  T20_PICKS,  (pick, p) => t20Status(p));
  renderPickList('frl1-list', FRL1_PICKS, (pick)    => frlStatus(pick.player));
  renderPickList('frl2-list', FRL2_PICKS, (pick)    => frlStatus(pick.player));
  renderProps();
  renderLeaderboard();
}

function setStatus(msg) {
  document.getElementById('live-status').textContent = msg;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function refresh() {
  clearInterval(refreshTimer);
  await fetchLeaderboard();
  refreshTimer = setInterval(fetchLeaderboard, 60_000);
}

document.getElementById('refresh-btn').addEventListener('click', refresh);

// Render static picks immediately (no data yet)
renderAll();

// Kick off live data
refresh();
