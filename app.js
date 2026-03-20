(async function () {
  const res = await fetch('data/events.json');
  const data = await res.json();
  const events = data.events;

  const SPORT_ICONS = {
    'Basketball': '\u{1F3C0}',
    'Soccer': '\u26BD',
  };

  // Display last updated
  const updatedEl = document.getElementById('last-updated');
  updatedEl.textContent = `Updated ${new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;

  // State
  let activeCalendars = new Set(['libby-basketball', 'sloan-soccer', 'hadley-soccer']);
  let currentView = 'list';
  let monthOffset = 0;

  // Restore filter state from localStorage
  try {
    const saved = localStorage.getItem('vb-filters');
    if (saved) activeCalendars = new Set(JSON.parse(saved));
  } catch (e) {}

  // Set checkbox state
  document.querySelectorAll('.filter input').forEach(cb => {
    cb.checked = activeCalendars.has(cb.dataset.calendar);
  });

  // Filter handlers
  document.querySelectorAll('.filter input').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) activeCalendars.add(cb.dataset.calendar);
      else activeCalendars.delete(cb.dataset.calendar);
      localStorage.setItem('vb-filters', JSON.stringify([...activeCalendars]));
      render();
    });
  });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      monthOffset = 0;
      render();
    });
  });

  const main = document.getElementById('calendar');

  function filteredEvents() {
    return events.filter(e => activeCalendars.has(e.calendar));
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatDayLabel(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function dateKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function weekKey(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    return dateKey(sun.toISOString());
  }

  function weekLabel(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    return `${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  function isPast(dateStr) {
    return new Date(dateStr) < new Date();
  }

  function shortTitle(event) {
    let title = event.title;
    title = title.replace(/^.*?(?=vs |at )/i, '');
    if (!title) title = event.title;
    return title;
  }

  function shortLocation(loc) {
    if (!loc) return '';
    const parts = loc.split(',');
    if (parts.length > 2) return parts.slice(0, 2).join(',').trim();
    return loc;
  }

  function gcalUrl(ev) {
    const start = new Date(ev.date);
    const end = new Date(ev.endDate || new Date(start.getTime() + 60 * 60000));
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const title = `${ev.child} ${ev.sport}: ${shortTitle(ev)}`;
    const details = [ev.notes, ev.snacks ? `Snacks: ${ev.snacks}` : null].filter(Boolean).join('\n');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${fmt(start)}/${fmt(end)}`,
      location: ev.location || '',
      details: details,
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  }

  function sportIcon(sport) {
    return SPORT_ICONS[sport] || '';
  }

  function renderList() {
    const evts = filteredEvents();
    if (evts.length === 0) {
      main.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">No events to show</p>';
      return;
    }

    const weeks = new Map();
    for (const ev of evts) {
      const wk = weekKey(ev.date);
      if (!weeks.has(wk)) weeks.set(wk, new Map());
      const dk = dateKey(ev.date);
      const days = weeks.get(wk);
      if (!days.has(dk)) days.set(dk, []);
      days.get(dk).push(ev);
    }

    let html = '';
    for (const [wk, days] of weeks) {
      const firstEvt = days.values().next().value[0];
      html += `<div class="week-group">`;
      html += `<div class="week-label">${weekLabel(firstEvt.date)}</div>`;
      for (const [dk, dayEvts] of days) {
        html += `<div class="day-group">`;
        html += `<div class="day-label">${formatDayLabel(dayEvts[0].date)}</div>`;
        for (const ev of dayEvts) {
          const past = isPast(ev.endDate || ev.date) ? ' past' : '';
          html += `<div class="event-card ${ev.calendar}${past}">`;
          html += `<div class="event-header">`;
          html += `<span class="event-child">${sportIcon(ev.sport)} ${ev.child} ${ev.sport}</span>`;
          html += `<span class="event-time">${formatTime(ev.date)}</span>`;
          html += `</div>`;
          html += `<div class="event-title">${shortTitle(ev)}</div>`;
          if (ev.location) html += `<div class="event-location">${shortLocation(ev.location)}</div>`;
          const noteParts = [];
          if (ev.notes) noteParts.push(ev.notes);
          if (ev.snacks) noteParts.push(`Snacks: ${ev.snacks}`);
          if (noteParts.length) html += `<div class="event-notes">${noteParts.join(' | ')}</div>`;
          html += `<a class="gcal-link" href="${gcalUrl(ev)}" target="_blank" rel="noopener">+ Google Cal</a>`;
          html += `</div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    main.innerHTML = html;
  }

  function renderMonth() {
    const now = new Date();
    const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const monthName = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const evts = filteredEvents();
    const dayIndex = {};
    for (const ev of evts) {
      const d = new Date(ev.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dk = d.getDate();
        if (!dayIndex[dk]) dayIndex[dk] = [];
        dayIndex[dk].push(ev);
      }
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayDate = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : -1;

    let html = `<div class="month-nav">`;
    html += `<button id="prev-month">&lt;</button>`;
    html += `<span class="month-title">${monthName}</span>`;
    html += `<button id="next-month">&gt;</button>`;
    html += `</div>`;

    html += `<div class="month-grid">`;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const d of dayNames) {
      html += `<div class="day-header">${d}</div>`;
    }

    for (let i = 0; i < firstDay; i++) {
      html += `<div class="day-cell empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === todayDate;
      html += `<div class="day-cell${isToday ? ' today' : ''}">`;
      html += `<div class="day-num">${day}</div>`;
      if (dayIndex[day]) {
        for (const ev of dayIndex[day]) {
          const past = isPast(ev.endDate || ev.date) ? ' past' : '';
          const icon = sportIcon(ev.sport);
          html += `<a class="day-event ${ev.calendar}${past}" href="${gcalUrl(ev)}" target="_blank" rel="noopener" title="${ev.child}: ${shortTitle(ev)} ${formatTime(ev.date)}">${icon} ${formatTime(ev.date)}</a>`;
        }
      }
      html += `</div>`;
    }
    html += `</div>`;

    main.innerHTML = html;

    document.getElementById('prev-month').addEventListener('click', () => { monthOffset--; render(); });
    document.getElementById('next-month').addEventListener('click', () => { monthOffset++; render(); });
  }

  function render() {
    if (currentView === 'list') renderList();
    else renderMonth();
  }

  render();
})();
