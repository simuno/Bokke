/* Biel — atlas do powieści Szymona Urbanowskiego.
 * Mapa w jednym układzie (Web Mercator): arkusze Śląska, Wrocławia i Ostrowa Tumskiego leżą jeden na drugim
 * i przenikają się przy powiększaniu. Plan opactwa na Piasku ma osobny widok (układ pikselowy).
 * Dane: data/biel-data.js (window.BIEL_DATA). */
(function () {
  'use strict';

  const D = window.BIEL_DATA;
  if (!D || !window.L) {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px">Nie udało się wczytać mapy ani danych.</p>');
    return;
  }

  /* ---------- drobiazgi ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    }
    return e;
  }
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('biel:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('biel:' + k, JSON.stringify(v)); } catch (e) { /* bez pamięci */ } }
  };

  /* ---------- kalendarz juliański ---------- */
  const MON_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const WD = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  const FERIA = ['dominica', 'feria II', 'feria III', 'feria IV', 'feria V', 'feria VI', 'sabbatum'];
  function jdnJulian(y, m, d) {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
  }
  function gregorian(j) {
    const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
    const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
    return { d: e - Math.floor((153 * m + 2) / 5) + 1, m: m + 3 - 12 * Math.floor(m / 10), y: 100 * b + d - 4800 + Math.floor(m / 10) };
  }
  function day(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const j = jdnJulian(y, m, d);
    return { iso, y, m, d, j, wd: (j + 1) % 7, g: gregorian(j) };
  }
  const fmt = {
    long(iso) { const x = day(iso); return `${WD[x.wd]}, ${x.d} ${MON_GEN[x.m - 1]} ${x.y}`; },
    short(iso) { const x = day(iso); return `${x.d} ${ROM[x.m - 1]} ${x.y}`; },
    dm(iso) { const x = day(iso); return `${x.d} ${ROM[x.m - 1]}`; },
    greg(iso) { const g = day(iso).g; return `${g.d} ${MON_GEN[g.m - 1]}${g.y !== day(iso).y ? ' ' + g.y : ''}`; }
  };
  function sceneWhen(sc) {
    const dt = sc.date || {};
    if (!dt.j) return { main: dt.label || 'data nieznana', sub: '' };
    if (dt.prec === 'season') return { main: dt.label || fmt.short(dt.j), sub: '' };
    if (dt.prec === 'range' && dt.end) {
      return { main: `${fmt.dm(dt.j)} – ${fmt.short(dt.end)}`, sub: dt.label || '' };
    }
    const x = day(dt.j);
    const bits = [FERIA[x.wd]];
    if (D.feasts[dt.j]) bits.push(D.feasts[dt.j]);
    bits.push(`wg dzisiejszej rachuby ${fmt.greg(dt.j)}`);
    return { main: (dt.prec === 'approx' ? 'ok. ' : '') + fmt.long(dt.j), sub: bits.join(' · ') };
  }

  /* ---------- dane pochodne ---------- */
  const CH = D.chapters;                         // [{id:'P', num:0, title, motto}, …]
  const chByid = Object.fromEntries(CH.map((c) => [c.id, c]));
  const SC = D.scenes;                           // w kolejności książki
  SC.forEach((s, i) => { s.idx = i; s.num = chByid[s.ch].num; });
  const scById = Object.fromEntries(SC.map((s) => [s.id, s]));
  const P = D.places;
  const PEOPLE = D.characters;
  const maxNum = Math.max(...CH.map((c) => c.num));

  const state = {
    progress: clamp(store.get('progress', 1), 0, maxNum),
    sel: null,               // {type:'scene'|'place'|'person', id}
    tab: 'card',
    person: null,            // filtr postaci
    abbey: false,
    fresh: new Set()         // świeżo odsłonięte sceny (animacja „atramentu”)
  };
  const visible = (s) => s.num <= state.progress;
  const visScenes = () => SC.filter(visible);

  function ancestors(pid) {
    const out = []; let p = P[pid], guard = 0;
    while (p && guard++ < 12) { out.push(p); p = p.parent ? P[p.parent] : null; }
    return out;
  }
  function posOn(pid, sheet) {
    for (const p of ancestors(pid)) if (p.sheets && p.sheets[sheet]) return { id: p.id, ...p.sheets[sheet] };
    return null;
  }
  function inside(pid, rootId) { return ancestors(pid).some((p) => p.id === rootId); }
  const DETAIL = ['opactwo', 'ostrow', 'wroclaw', 'slask'];
  function bestSheet(pid) {
    for (const s of DETAIL) { const q = posOn(pid, s); if (q && q.id === pid) return s; }
    for (const s of DETAIL) if (posOn(pid, s)) return s;
    return 'slask';
  }
  function placeName(pid) { return (P[pid] && P[pid].name) || pid; }
  function scenesAt(pid, list) { return list.filter((s) => s.place === pid || inside(s.place, pid)); }
  function personName(id) {
    const c = PEOPLE[id]; if (!c) return id;
    const ok = (c.names || []).filter((n) => chByid[n.ch] && chByid[n.ch].num <= state.progress);
    return (ok.length ? ok[ok.length - 1].name : (c.names && c.names[0] ? c.names[0].name : c.name)) || id;
  }
  const shortName = (pid) => (P[pid] && (P[pid].short || P[pid].name)) || pid;

  /* ---------- słowniczek ---------- */
  const GL = D.glossary || [];
  let glRe = null; const glByForm = new Map();
  if (GL.length) {
    const forms = [];
    GL.forEach((g, i) => (g.forms || [g.term]).forEach((f) => { glByForm.set(f.toLowerCase(), i); forms.push(f); }));
    forms.sort((a, b) => b.length - a.length);
    const esc = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    try { glRe = new RegExp(`(?<![\\p{L}])(${esc.join('|')})(?![\\p{L}])`, 'giu'); } catch (e) { glRe = null; }
  }
  function glossify(text) {
    const frag = document.createDocumentFragment();
    if (!glRe || !text) { frag.append(text || ''); return frag; }
    let last = 0; const seen = new Set();
    text.replace(glRe, (m, _g, off) => {
      const i = glByForm.get(m.toLowerCase());
      if (i == null || seen.has(i)) return m;
      seen.add(i);
      frag.append(text.slice(last, off));
      frag.append(h('span', { class: 'gl', tabindex: '0', 'data-gl': String(i) }, m));
      last = off + m.length; return m;
    });
    frag.append(text.slice(last));
    return frag;
  }
  let glPop = null;
  function showGloss(target) {
    hideGloss();
    const g = GL[+target.dataset.gl]; if (!g) return;
    glPop = h('div', { class: 'gl-pop', role: 'tooltip' }, h('b', null, g.term), g.def, h('div', { style: 'margin-top:4px;color:var(--ink-3)' }, 'Słowniczek'));
    document.body.appendChild(glPop);
    const r = target.getBoundingClientRect(), pr = glPop.getBoundingClientRect();
    let x = r.left, y = r.bottom + 6;
    if (x + pr.width > innerWidth - 8) x = innerWidth - pr.width - 8;
    if (y + pr.height > innerHeight - 8) y = r.top - pr.height - 6;
    glPop.style.left = Math.max(8, x) + 'px'; glPop.style.top = Math.max(8, y) + 'px';
  }
  function hideGloss() { if (glPop) { glPop.remove(); glPop = null; } }
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('.gl'); if (t) showGloss(t); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.gl')) hideGloss(); });
  document.addEventListener('focusin', (e) => { if (e.target.classList && e.target.classList.contains('gl')) showGloss(e.target); });
  document.addEventListener('focusout', hideGloss);
  document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.gl'); if (t) { e.preventDefault(); showGloss(t); } else hideGloss(); });

  /* ---------- mapa geograficzna ---------- */
  const SM = L.Projection.SphericalMercator;
  const SH = D.sheets;
  const sheetMerc = {};
  for (const id of ['slask', 'wroclaw', 'ostrow']) {
    const s = SH[id];
    sheetMerc[id] = { sw: SM.project(L.latLng(s.bounds[0])), ne: SM.project(L.latLng(s.bounds[1])), W: s.size[0], H: s.size[1] };
  }
  function pxToLatLng(sheet, x, y) {
    const m = sheetMerc[sheet];
    return SM.unproject(L.point(m.sw.x + (x / m.W) * (m.ne.x - m.sw.x), m.ne.y - (y / m.H) * (m.ne.y - m.sw.y)));
  }
  const pxMeters = (sheet) => (sheetMerc[sheet].ne.x - sheetMerc[sheet].sw.x) / sheetMerc[sheet].W; // metry Mercatora na piksel arkusza
  const bounds = (id) => L.latLngBounds(SH[id].bounds);

  const map = L.map('map', {
    zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110,
    minZoom: 7, maxZoom: 19.5, attributionControl: false, zoomControl: false
  });
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
  const ATTR = 'Mapy: Szymon Urbanowski · podkład © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">autorzy OpenStreetMap</a>';
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Przybliż', zoomOutTitle: 'Oddal' }).addTo(map);
  map.setMaxBounds(bounds('slask').pad(0.2));

  const overlays = {
    slask: L.imageOverlay(SH.slask.img, SH.slask.bounds, { className: 'sheet', zIndex: 1, attribution: ATTR }),
    wroclaw: L.imageOverlay(SH.wroclaw.img, SH.wroclaw.bounds, { className: 'sheet inset', zIndex: 2, attribution: ATTR }),
    ostrow: L.imageOverlay(SH.ostrow.img, SH.ostrow.bounds, { className: 'sheet inset', zIndex: 3, attribution: ATTR })
  };
  const routeLayer = L.layerGroup().addTo(map);
  const walkLayer = L.layerGroup().addTo(map);
  const markLayer = L.layerGroup().addTo(map);

  function sheetOpacity(z) {
    return {
      slask: z <= 11.6 ? 1 : clamp(1 - (z - 11.6) / 1.1, 0.3, 1),
      wroclaw: clamp((z - 10.9) / 1.0, 0, 1),
      ostrow: clamp((z - 15.9) / 0.8, 0, 1)
    };
  }
  const SHOW = { slask: (z) => z < 13.6, wroclaw: (z) => z > 10.7, ostrow: (z) => z > 15.7 };
  function updateSheets(z) {
    const op = sheetOpacity(z);
    for (const id of Object.keys(overlays)) {
      const on = SHOW[id](z), has = map.hasLayer(overlays[id]);
      if (on && !has) overlays[id].addTo(map);
      if (!on && has) map.removeLayer(overlays[id]);
      if (on) overlays[id].setOpacity(op[id]);
    }
  }
  function geoLevel() {
    const z = map.getZoom();
    if (z < 12.0) return 'slask';
    if (z >= 16.6 && bounds('ostrow').pad(-0.05).contains(map.getCenter())) return 'ostrow';
    return 'wroclaw';
  }
  const CHAIN = { slask: ['slask'], wroclaw: ['wroclaw', 'slask'], ostrow: ['ostrow', 'wroclaw', 'slask'] };
  function displayFor(pid, level) {
    for (const s of CHAIN[level]) {
      const q = posOn(pid, s);
      if (q) return { sheet: s, ...q };
    }
    return null;
  }

  /* ---------- plan opactwa ---------- */
  let abbeyMap = null; let abbeyLayer = null;
  const AB = SH.opactwo;
  const abLatLng = (x, y) => L.latLng(-y, x);
  function ensureAbbey() {
    if (abbeyMap) return;
    abbeyMap = L.map('abbey', { crs: L.CRS.Simple, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: -3, maxZoom: 1.5, attributionControl: false, zoomControl: false });
    L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution('Plan: Szymon Urbanowski').addTo(abbeyMap);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Przybliż', zoomOutTitle: 'Oddal' }).addTo(abbeyMap);
    const b = [[-AB.size[1], 0], [0, AB.size[0]]];
    L.imageOverlay(AB.img, b, { className: 'sheet' }).addTo(abbeyMap);
    abbeyMap.setMaxBounds(L.latLngBounds(b).pad(0.1));
    abbeyLayer = L.layerGroup().addTo(abbeyMap);
    abbeyMap.fitBounds(b);
  }
  function setAbbey(on, focus) {
    state.abbey = on;
    $('#abbey').hidden = !on;
    if (on) {
      ensureAbbey();
      abbeyMap.invalidateSize();
      if (focus) {
        const q = posOn(focus, 'opactwo');
        if (q) abbeyMap.flyTo(abLatLng(q.x, q.y), Math.max(abbeyMap.getZoom(), -0.75), { duration: 0.6 });
      } else {
        abbeyMap.fitBounds([[-AB.size[1], 0], [0, AB.size[0]]]);
      }
    }
    renderMarkers(); syncSheetButtons();
  }

  /* ---------- znaczniki ---------- */
  const sealIcon = (count, cls) => L.divIcon({ className: 'seal-icon', iconSize: [0, 0], html: `<div class="seal ${cls || ''}">${count}</div>` });
  const badgeIcon = (count, cls) => L.divIcon({ className: 'seal-icon', iconSize: [0, 0], html: `<div class="count-badge ${cls || ''}">${count}</div>` });
  const pulseIcon = () => L.divIcon({ className: 'seal-icon', iconSize: [0, 0], html: '<div class="pulse"></div>' });
  const stopIcon = (label) => L.divIcon({ className: 'seal-icon', iconSize: [0, 0], html: `<div class="stop-dot"></div>${label ? `<div class="stop-label">${label}</div>` : ''}` });

  function selectedPlaceIds() {
    if (!state.sel) return new Set();
    if (state.sel.type === 'scene') { const s = scById[state.sel.id]; return new Set(s ? [s.place] : []); }
    if (state.sel.type === 'place') return new Set([state.sel.id]);
    return new Set();
  }
  function personHas(s) { return !state.person || (s.chars || []).includes(state.person) || s.pov === state.person; }

  function groupScenes(level) {
    const groups = new Map();
    for (const s of visScenes()) {
      const d = level === 'opactwo' ? (inside(s.place, 'piasek') ? { sheet: 'opactwo', ...(posOn(s.place, 'opactwo') || {}) } : null) : displayFor(s.place, level);
      if (!d || d.x == null) continue;
      const key = d.sheet + ':' + d.id;
      if (!groups.has(key)) groups.set(key, { ...d, scenes: [] });
      groups.get(key).scenes.push(s);
    }
    return groups;
  }

  function renderMarkers() {
    markLayer.clearLayers(); walkLayer.clearLayers();
    if (abbeyLayer) abbeyLayer.clearLayers();
    const level = geoLevel();
    const selIds = selectedPlaceIds();
    const selScene = state.sel && state.sel.type === 'scene' ? scById[state.sel.id] : null;

    // mapa geograficzna
    const groups = groupScenes(level);
    const legendDone = new Set();
    for (const g of groups.values()) {
      const n = g.scenes.length;
      const fresh = g.scenes.some((s) => state.fresh.has(s.id));
      const dim = state.person && !g.scenes.some(personHas);
      const isSel = [...selIds].some((pid) => pid === g.id || inside(pid, g.id));
      const ll = pxToLatLng(g.sheet, g.x, g.y);
      if (g.sheet === 'wroclaw' && g.cx != null && level !== 'slask') {
        // numerowane kółko z mapy autora: pierścień w metrach, rośnie razem z mapą
        const c = pxToLatLng('wroclaw', g.cx, g.cy);
        const r = (g.r || 23) * pxMeters('wroclaw') * Math.cos(c.lat * Math.PI / 180);
        L.circle(c, { radius: r, className: 'ring has' + (isSel ? ' sel' : '') + (fresh ? ' fresh' : ''), weight: 4, fill: true, fillOpacity: 0, opacity: dim ? 0.3 : 1 })
          .on('click', () => selectPlace(g.id, { fly: false }))
          .bindTooltip(tipFor(g.id, n), { className: 'tip', direction: 'top', offset: [0, -14] })
          .addTo(markLayer);
        legendDone.add(g.id);
      } else {
        L.marker(ll, { icon: sealIcon(n, [n > 9 ? '' : '', level === 'slask' && g.id !== 'wroclaw' ? 'small' : '', fresh ? 'fresh' : '', dim ? 'dim' : '', isSel ? 'current' : ''].join(' ')), riseOnHover: true, keyboard: true, title: placeName(g.id) })
          .on('click', () => selectPlace(g.id, { fly: g.sheet === 'slask' && g.id === 'wroclaw' }))
          .bindTooltip(tipFor(g.id, n), { className: 'tip', direction: 'top', offset: [0, -16] })
          .addTo(markLayer);
      }
      if (isSel) L.marker(g.cx != null && g.sheet === 'wroclaw' && level !== 'slask' ? pxToLatLng('wroclaw', g.cx, g.cy) : ll, { icon: pulseIcon(), interactive: false, keyboard: false }).addTo(markLayer);
    }
    // numerowane miejsca bez scen: ciche pola do kliknięcia (legenda autora)
    if (level !== 'slask') {
      for (const [pid, p] of Object.entries(P)) {
        const w = p.sheets && p.sheets.wroclaw;
        if (!w || w.cx == null || legendDone.has(pid)) continue;
        const c = pxToLatLng('wroclaw', w.cx, w.cy);
        const r = (w.r || 23) * pxMeters('wroclaw') * Math.cos(c.lat * Math.PI / 180);
        L.circle(c, { radius: r, className: 'ring', weight: 3, opacity: 0, fill: true, fillOpacity: 0 })
          .on('click', () => selectPlace(pid, { fly: false }))
          .bindTooltip(tipFor(pid, 0), { className: 'tip', direction: 'top', offset: [0, -14] })
          .addTo(markLayer);
      }
    }
    // droga w obrębie wybranej sceny
    if (selScene && selScene.path && selScene.path.length > 1 && !state.abbey) {
      const pts = selScene.path.map((pid) => displayFor(pid, level)).filter(Boolean).map((d) => pxToLatLng(d.sheet, d.cx != null && d.sheet === 'wroclaw' ? d.cx : d.x, d.cx != null && d.sheet === 'wroclaw' ? d.cy : d.y));
      const uniq = pts.filter((p, i) => i === 0 || !p.equals(pts[i - 1]));
      if (uniq.length > 1) L.polyline(uniq, { className: 'walk', weight: 2.5, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(walkLayer);
    }
    renderRoutes(level);
    if (state.abbey) renderAbbeyMarkers(selIds);
    updateCaption();
  }

  function tipFor(pid, n) {
    const p = P[pid] || {};
    const num = p.sheets && p.sheets.wroclaw && p.sheets.wroclaw.n ? `${p.sheets.wroclaw.n}. ` : '';
    const scenes = n ? ` · ${n} ${n === 1 ? 'scena' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'sceny' : 'scen')}` : '';
    return `${num}${p.name || pid}${scenes}`;
  }

  function renderAbbeyMarkers(selIds) {
    const groups = groupScenes('opactwo');
    const done = new Set();
    for (const g of groups.values()) {
      const n = g.scenes.length;
      const fresh = g.scenes.some((s) => state.fresh.has(s.id));
      const dim = state.person && !g.scenes.some(personHas);
      const isSel = [...selIds].some((pid) => pid === g.id || inside(pid, g.id));
      const c = abLatLng(g.cx != null ? g.cx : g.x, g.cy != null ? g.cy : g.y);
      if (g.cx != null) {
        L.circle(c, { radius: (g.r || 30) + 4, className: 'ring has' + (isSel ? ' sel' : '') + (fresh ? ' fresh' : ''), weight: 5, fill: true, fillOpacity: 0, opacity: dim ? 0.3 : 1 })
          .on('click', () => selectPlace(g.id, { fly: false }))
          .bindTooltip(tipFor(g.id, n), { className: 'tip', direction: 'top', offset: [0, -16] })
          .addTo(abbeyLayer);
      } else {
        L.marker(c, { icon: sealIcon(n, [fresh ? 'fresh' : '', dim ? 'dim' : '', isSel ? 'current' : ''].join(' ')), title: placeName(g.id) })
          .on('click', () => selectPlace(g.id, { fly: false }))
          .bindTooltip(tipFor(g.id, n), { className: 'tip', direction: 'top', offset: [0, -16] })
          .addTo(abbeyLayer);
      }
      if (isSel) L.marker(c, { icon: pulseIcon(), interactive: false, keyboard: false }).addTo(abbeyLayer);
      done.add(g.id);
    }
    for (const [pid, p] of Object.entries(P)) {
      const a = p.sheets && p.sheets.opactwo;
      if (!a || a.cx == null || done.has(pid)) continue;
      L.circle(abLatLng(a.cx, a.cy), { radius: (a.r || 30) + 2, className: 'ring', weight: 3, opacity: 0, fill: true, fillOpacity: 0 })
        .on('click', () => selectPlace(pid, { fly: false }))
        .bindTooltip(tipFor(pid, 0), { className: 'tip', direction: 'top', offset: [0, -16] })
        .addTo(abbeyLayer);
    }
  }

  function renderRoutes(level) {
    routeLayer.clearLayers();
    if (level !== 'slask') return;
    for (const j of D.journeys || []) {
      if (chByid[j.ch].num > state.progress) continue;
      const pts = j.stops.map((pid) => posOn(pid, 'slask')).filter(Boolean).map((q) => pxToLatLng('slask', q.x, q.y));
      if (pts.length < 2) continue;
      const fresh = state.fresh.size && j.scenes.some((id) => state.fresh.has(id));
      L.polyline(pts, { className: 'route' + (fresh ? ' fresh' : ''), weight: 3, dashArray: '1 8', lineCap: 'round', interactive: true })
        .bindTooltip(j.label, { className: 'tip', sticky: true })
        .addTo(routeLayer);
      (j.labels || []).forEach((lab) => {
        const q = posOn(lab.place, 'slask'); if (!q) return;
        L.marker(pxToLatLng('slask', q.x, q.y), { icon: stopIcon(lab.text), interactive: false, keyboard: false }).addTo(routeLayer);
      });
    }
  }

  function updateCaption() {
    const cap = $('#caption');
    const lv = state.abbey ? 'opactwo' : geoLevel();
    cap.replaceChildren(h('b', null, SH[lv].title), ' ', SH[lv].subtitle || '');
  }

  function syncSheetButtons() {
    const lv = state.abbey ? 'opactwo' : geoLevel();
    document.querySelectorAll('#sheets button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sheet === lv)));
  }

  function flyToSheet(id) {
    if (id === 'opactwo') { setAbbey(true); return; }
    if (state.abbey) setAbbey(false);
    map.flyToBounds(bounds(id), { padding: [10, 10], duration: 1.1 });
  }
  const ZOOM_FOR = { slask: 9.4, wroclaw: 15.3, ostrow: 17.3 };
  function flyToPlace(pid) {
    const s = bestSheet(pid);
    if (s === 'opactwo') { setAbbey(true, pid); return; }
    if (state.abbey) setAbbey(false);
    const q = posOn(pid, s);
    if (!q) return;
    const ll = pxToLatLng(s, q.cx != null && s === 'wroclaw' ? q.cx : q.x, q.cx != null && s === 'wroclaw' ? q.cy : q.y);
    const cur = map.getZoom();
    const z = s === 'slask' ? (cur >= 8.6 && cur <= 10.4 ? cur : ZOOM_FOR.slask) : ZOOM_FOR[s];
    map.flyTo(ll, z, { duration: 1.0 });
    peek();
  }

  let lastLevel = null;
  map.on('zoomanim', (e) => updateSheets(e.zoom));
  map.on('zoom', () => updateSheets(map.getZoom()));
  map.on('zoomend moveend', () => {
    updateSheets(map.getZoom());
    map.getContainer().classList.toggle('z-low', map.getZoom() < 9.3);
    const lv = geoLevel();
    if (lv !== lastLevel) { lastLevel = lv; renderMarkers(); }
    syncSheetButtons(); updateCaption();
  });

  /* ---------- podgląd karty na wąskim ekranie ---------- */
  const narrow = window.matchMedia('(max-width: 860px)');
  function peek() {
    const el = $('#peek'); if (!el) return;
    if (!narrow.matches || !state.sel) { el.hidden = true; return; }
    let t = '';
    if (state.sel.type === 'scene') { const s = scById[state.sel.id]; t = `${s.id} ${s.title} · ${shortName(s.place)}`; }
    else if (state.sel.type === 'place') t = placeName(state.sel.id);
    else t = personName(state.sel.id);
    el.replaceChildren(h('span', null, t), h('button', { type: 'button', onclick: () => $('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Karta ↓'));
    el.hidden = false;
  }

  /* ---------- wybór ---------- */
  function selectScene(id, opts = {}) {
    const s = scById[id]; if (!s) return;
    if (!visible(s)) { showLocked(s); return; }
    state.sel = { type: 'scene', id };
    state.tab = 'card';
    if (opts.fly !== false) flyToPlace(s.place);
    renderAll();
    setHash(id);
  }
  function selectPlace(pid, opts = {}) {
    state.sel = { type: 'place', id: pid };
    state.tab = 'card';
    if (opts.fly) flyToPlace(pid);
    renderAll();
    setHash('');
  }
  function selectPerson(id) {
    state.sel = { type: 'person', id };
    state.tab = 'card';
    renderAll();
    setHash('');
  }
  function setHash(v) {
    try { history.replaceState(null, '', v ? '#' + v : location.pathname + location.search); } catch (e) { /* ramka bez historii */ }
  }
  function stepScene(dir) {
    const vis = visScenes();
    if (!vis.length) return;
    let i = -1;
    if (state.sel && state.sel.type === 'scene') i = vis.findIndex((s) => s.id === state.sel.id);
    const j = i < 0 ? (dir > 0 ? 0 : vis.length - 1) : clamp(i + dir, 0, vis.length - 1);
    selectScene(vis[j].id);
  }

  /* ---------- panel ---------- */
  const panel = $('#panel');
  function renderPanel() {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
    let body;
    if (state.tab === 'scenes') body = viewScenes();
    else if (state.tab === 'places') body = viewPlaces();
    else if (state.tab === 'people') body = viewPeople();
    else if (state.tab === 'about') body = viewAbout();
    else body = viewCard();
    panel.replaceChildren(body);
    const cur = panel.querySelector('[aria-current="true"]');
    if (cur && state.tab !== 'card') cur.scrollIntoView({ block: 'nearest' });
  }
  function viewCard() {
    if (!state.sel) return viewHome();
    if (state.sel.type === 'scene') return viewScene(scById[state.sel.id]);
    if (state.sel.type === 'place') return viewPlace(state.sel.id);
    if (state.sel.type === 'person') return viewPerson(state.sel.id);
    return viewHome();
  }

  function sceneRow(s, opts = {}) {
    const cur = state.sel && state.sel.type === 'scene' && state.sel.id === s.id;
    const w = s.date && s.date.j ? (s.date.prec === 'season' ? (s.date.label || '') : fmt.dm(s.date.j)) : '';
    return h('li', null, h('button', { type: 'button', class: 'row', 'aria-current': cur ? 'true' : null, onclick: () => selectScene(s.id) },
      h('span', { class: 'id' }, s.id),
      h('span', { class: 't' }, s.title, opts.place !== false ? h('small', null, shortName(s.place)) : null),
      h('span', { class: 'd' }, w)));
  }

  function viewHome() {
    const vis = visScenes();
    const ch = chByid[CH.find((c) => c.num === state.progress).id];
    const places = new Set(vis.map((s) => s.place));
    return h('div', { class: 'card' },
      h('img', { class: 'cover', src: D.meta.cover, alt: 'Okładka powieści „Biel”', width: '104', height: '139' }),
      h('div', { class: 'crumb' }, h('span', null, 'Wrocław i Śląsk, 1293–1294')),
      h('h2', null, 'Gdzie i kiedy dzieje się „Biel”'),
      h('p', null, 'Każda scena powieści ma tu swoje miejsce na mapach autora i swój dzień w kalendarzu juliańskim. Kliknij pieczęć na mapie, kropkę na osi czasu albo przejdź scena po scenie strzałkami.'),
      h('p', null, `Odsłonięte: prolog${state.progress === 1 ? ' i rozdział I' : state.progress > 1 ? ` i rozdziały I–${ch.id}` : ''}, czyli ${vis.length} ${vis.length === 1 ? 'scena' : (vis.length % 10 >= 2 && vis.length % 10 <= 4 && (vis.length % 100 < 10 || vis.length % 100 >= 20) ? 'sceny' : 'scen')} w ${places.size} ${places.size === 1 ? 'miejscu' : 'miejscach'}. ${state.progress < maxNum ? 'Reszta jest zabielona.' : ''}`),
      h('div', { class: 'nav' },
        h('button', { type: 'button', onclick: () => stepScene(1) }, h('small', null, 'Zacznij od początku'), vis[0] ? `${vis[0].id} ${vis[0].title}` : '—'),
        h('button', { type: 'button', onclick: () => { const v = visScenes(); if (v.length) selectScene(v[v.length - 1].id); } }, h('small', null, 'Ostatnia przeczytana'), vis.length ? `${vis[vis.length - 1].id} ${vis[vis.length - 1].title}` : '—')));
  }

  function viewScene(s) {
    const ch = chByid[s.ch];
    const w = sceneWhen(s);
    const vis = visScenes(); const i = vis.findIndex((x) => x.id === s.id);
    const prev = vis[i - 1], next = vis[i + 1];
    const pl = P[s.place] || {};
    const legend = pl.sheets && (pl.sheets.opactwo && pl.sheets.opactwo.n ? `plan opactwa, nr ${pl.sheets.opactwo.n}` : pl.sheets.wroclaw && pl.sheets.wroclaw.n ? `mapa Wrocławia, nr ${pl.sheets.wroclaw.n}` : '');
    const people = (s.chars || []).filter((c) => PEOPLE[c]);
    return h('article', { class: 'card' },
      h('div', { class: 'crumb' }, h('span', { class: 'folio' }, s.id), h('span', null, ch.num ? `Rozdział ${ch.id} · ` : '', h('i', null, ch.title))),
      h('h2', null, s.title),
      h('dl', { class: 'meta' },
        h('div', null, h('dt', null, 'kiedy'), h('dd', null, w.main, w.sub ? h('div', { class: 'sub' }, w.sub) : null)),
        s.time ? h('div', null, h('dt', null, 'pora'), h('dd', null, glossify(s.time))) : null,
        h('div', null, h('dt', null, 'gdzie'), h('dd', null, h('button', { type: 'button', class: 'linkish', onclick: () => selectPlace(s.place, { fly: true }) }, placeName(s.place)), legend ? h('div', { class: 'sub' }, legend) : null)),
        (s.pov && s.pov !== 'dietrich') || s.povLabel ? h('div', null, h('dt', null, 'oczami'), h('dd', null,
          s.povLabel ? (s.povLabel === 'narrator' ? 'narrator, bez postaci' : s.povLabel) : h('button', { type: 'button', class: 'linkish', onclick: () => selectPerson(s.pov) }, personName(s.pov)))) : null),
      h('p', null, glossify(s.summary)),
      s.quote ? h('p', { class: 'quote' }, `„${s.quote}”`) : null,
      people.length ? [h('h3', null, 'Na scenie'), h('ul', { class: 'chips' }, people.map((c) => h('li', null, PEOPLE[c].minor
        ? h('span', { class: 'chip minor' }, personName(c))
        : h('button', { type: 'button', class: 'chip' + (c === s.pov ? ' pov' : ''), onclick: () => selectPerson(c) }, personName(c)))))] : null,
      s.objects && s.objects.length ? [h('h3', null, 'Rzeczy'), h('p', { style: 'color:var(--ink-2)' }, s.objects.join(' · '))] : null,
      h('div', { class: 'nav' },
        h('button', { type: 'button', disabled: !prev, onclick: () => prev && selectScene(prev.id) }, h('small', null, '‹ poprzednia'), prev ? `${prev.id} ${prev.title}` : '—'),
        h('button', { type: 'button', disabled: !next, onclick: () => next && selectScene(next.id) }, h('small', null, next ? 'następna ›' : 'dalej zabielone'), next ? `${next.id} ${next.title}` : (state.progress < maxNum ? 'zmień „Przeczytane do”' : 'koniec'))));
  }

  function readable(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter((x) => chByid[x.ch] && chByid[x.ch].num <= state.progress && !seen.has(x.text) && seen.add(x.text));
  }
  function viewPlace(pid) {
    const p = P[pid] || { name: pid };
    const vis = visScenes();
    const here = scenesAt(pid, vis);
    const mentions = vis.filter((s) => (s.mentioned || []).includes(pid) && !here.includes(s));
    const leg = [];
    if (p.sheets) {
      if (p.sheets.wroclaw && p.sheets.wroclaw.n) leg.push(`mapa Wrocławia, nr ${p.sheets.wroclaw.n}`);
      if (p.sheets.opactwo && p.sheets.opactwo.n) leg.push(`plan opactwa, nr ${p.sheets.opactwo.n}`);
      if (p.sheets.ostrow) leg.push('mapa Ostrowa Tumskiego');
      if (p.sheets.slask && !leg.length) leg.push('mapa Śląska');
    }
    const parent = p.parent && P[p.parent];
    const num = (p.sheets && ((p.sheets.opactwo && p.sheets.opactwo.n) || (p.sheets.wroclaw && p.sheets.wroclaw.n))) || null;
    return h('article', { class: 'card' },
      h('div', { class: 'crumb' }, parent ? h('button', { type: 'button', class: 'linkish', onclick: () => selectPlace(parent.id, { fly: true }) }, parent.name) : h('span', null, 'Miejsce'), leg.length ? h('span', null, leg.join(' · ')) : null),
      h('h2', null, num ? h('span', { class: 'num' }, String(num)) : null, p.name),
      p.approx ? h('p', { class: 'note' }, h('b', null, 'Położenie umowne. '), p.approx === true ? 'Tego miejsca nie ma na mapie autora; znacznik stoi tam, gdzie wskazuje tekst.' : p.approx) : null,
      readable(p.desc).map((x) => h('p', null, h('span', { class: 'chtag' }, x.ch === 'P' ? 'prolog' : x.ch), glossify(x.text))),
      readable(p.notes).map((x) => h('p', { class: 'note' }, h('b', null, 'Z przypisów: '), glossify(x.text))),
      pid === 'piasek' || inside(pid, 'piasek') ? h('p', null, h('button', { type: 'button', class: 'chip', onclick: () => setAbbey(true, pid === 'piasek' ? null : pid) }, 'Otwórz plan opactwa')) : null,
      h('h3', null, here.length ? `Sceny w tym miejscu (${here.length})` : 'Sceny w tym miejscu'),
      here.length ? h('ul', { class: 'list' }, here.map((s) => sceneRow(s, { place: s.place !== pid }))) : h('p', { class: 'locked' }, 'W przeczytanych rozdziałach nic się tu jeszcze nie wydarzyło.'),
      mentions.length ? [h('h3', null, 'Wspomniane w'), h('ul', { class: 'list' }, mentions.map((s) => sceneRow(s)))] : null);
  }

  function introBlock(intro) {
    const para = (x) => h('p', null, h('span', { class: 'chtag' }, x.ch === 'P' ? 'prolog' : x.ch), glossify(x.text));
    if (intro.length <= 3) return intro.map(para);
    const older = intro.slice(0, -2), newer = intro.slice(-2);
    return [h('details', { class: 'older' }, h('summary', null, `Wcześniej (${older.length} ${older.length < 5 ? 'rozdziały' : 'rozdziałów'})`), older.map(para)), newer.map(para)];
  }
  function viewPerson(id) {
    const c = PEOPLE[id] || { name: id };
    const vis = visScenes();
    const scenes = vis.filter((s) => (s.chars || []).includes(id) || s.pov === id);
    const intro = (c.intro || []).filter((x) => chByid[x.ch] && chByid[x.ch].num <= state.progress);
    const filterOn = state.person === id;
    return h('article', { class: 'card' },
      h('div', { class: 'crumb' }, h('span', null, c.group || 'Postać'), c.hist ? h('span', { class: 'badge' }, 'postać historyczna') : null),
      h('h2', null, personName(id)),
      c.role && personName(id) !== c.role ? h('p', { class: 'sub-role' }, c.role) : null,
      intro.length ? introBlock(intro) : h('p', { class: 'locked' }, 'O tej postaci w przeczytanych rozdziałach nie wiadomo jeszcze nic więcej.'),
      h('p', null, h('button', { type: 'button', class: 'chip' + (filterOn ? ' pov' : ''), 'aria-pressed': String(filterOn), onclick: () => { state.person = filterOn ? null : id; renderAll(); } }, filterOn ? 'Pokaż znowu wszystkie sceny' : 'Pokaż na mapie tylko jej/jego sceny')),
      h('h3', null, `Sceny (${scenes.length})`),
      scenes.length ? h('ul', { class: 'list' }, scenes.map((s) => sceneRow(s))) : h('p', { class: 'locked' }, 'Jeszcze się nie pojawia.'));
  }

  function viewScenes() {
    const wrap = h('div', { class: 'card' });
    for (const ch of CH) {
      if (ch.num > state.progress) {
        wrap.append(h('div', { class: 'ch-head' }, h('span', { class: 'r' }, ch.num ? ch.id : 'P'), h('span', { class: 'ti', style: 'color:var(--ink-3)' }, 'zabielone')));
        continue;
      }
      wrap.append(h('div', { class: 'ch-head' }, h('span', { class: 'r' }, ch.num ? ch.id : 'P'), h('span', { class: 'ti' }, ch.title)));
      if (ch.motto && ch.motto.text) wrap.append(h('p', { class: 'ch-motto' }, ch.motto.text, ch.motto.source ? ` — ${ch.motto.source}` : ''));
      wrap.append(h('ul', { class: 'list' }, SC.filter((s) => s.ch === ch.id).map((s) => sceneRow(s))));
    }
    return wrap;
  }

  const SHEET_GROUPS = [['opactwo', 'Opactwo na Piasku'], ['ostrow', 'Ostrów Tumski'], ['wroclaw', 'Wrocław'], ['slask', 'Śląsk'], ['far', 'Poza mapą']];
  function viewPlaces() {
    const vis = visScenes();
    const counts = new Map();
    vis.forEach((s) => counts.set(s.place, (counts.get(s.place) || 0) + 1));
    const mentioned = new Set(vis.flatMap((s) => s.mentioned || []));
    const wrap = h('div', { class: 'card' });
    const byGroup = new Map(SHEET_GROUPS.map(([k]) => [k, []]));
    for (const [pid, p] of Object.entries(P)) {
      if (p.hidden) continue;
      const n = counts.get(pid) || 0;
      const onLegend = p.sheets && ((p.sheets.wroclaw && p.sheets.wroclaw.n) || (p.sheets.opactwo && p.sheets.opactwo.n));
      if (!n && !mentioned.has(pid) && !onLegend) continue;
      const g = p.far ? 'far' : bestSheet(pid);
      byGroup.get(g).push({ pid, p, n, num: onLegend || null });
    }
    for (const [k, label] of SHEET_GROUPS) {
      const items = byGroup.get(k);
      if (!items.length) continue;
      items.sort((a, b) => (b.n - a.n) || ((a.num || 99) - (b.num || 99)) || a.p.name.localeCompare(b.p.name, 'pl'));
      wrap.append(h('div', { class: 'group-h' }, label));
      wrap.append(h('ul', { class: 'list' }, items.map(({ pid, p, n, num }) => h('li', null,
        h('button', { type: 'button', class: 'row', 'aria-current': state.sel && state.sel.type === 'place' && state.sel.id === pid ? 'true' : null, onclick: () => selectPlace(pid, { fly: true }) },
          h('span', { class: 'id' }, num ? String(num) : ''),
          h('span', { class: 't' }, p.name, !n && mentioned.has(pid) ? h('small', null, 'tylko wspomniane') : null),
          h('span', { class: 'd' }, n ? String(n) : ''))))));
    }
    return wrap;
  }

  function viewPeople() {
    const vis = visScenes();
    const count = new Map();
    vis.forEach((s) => new Set([...(s.chars || []), s.pov].filter(Boolean)).forEach((c) => count.set(c, (count.get(c) || 0) + 1)));
    const wrap = h('div', { class: 'card' });
    const groups = new Map();
    let minor = 0;
    for (const [id, c] of Object.entries(PEOPLE)) {
      if (!count.get(id)) continue;
      if (c.minor) { minor++; continue; }
      const g = c.group || 'Inni';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ id, c, n: count.get(id) });
    }
    const order = D.personGroups || [...groups.keys()];
    for (const g of order) {
      const items = groups.get(g); if (!items) continue;
      items.sort((a, b) => b.n - a.n || personName(a.id).localeCompare(personName(b.id), 'pl'));
      wrap.append(h('div', { class: 'group-h' }, g));
      wrap.append(h('ul', { class: 'list' }, items.map(({ id, c, n }) => h('li', null,
        h('button', { type: 'button', class: 'row', 'aria-current': state.sel && state.sel.type === 'person' && state.sel.id === id ? 'true' : null, onclick: () => selectPerson(id) },
          h('span', { class: 'id' }, c.hist ? '✶' : ''),
          h('span', { class: 't' }, personName(id), c.role && c.role !== personName(id) ? h('small', null, c.role) : null),
          h('span', { class: 'd' }, String(n)))))));
    }
    if (!groups.size) wrap.append(h('p', { class: 'locked' }, 'Nikt się jeszcze nie pojawił.'));
    if (minor) wrap.append(h('p', { class: 'locked' }, `Oprócz nich ${minor} ${minor === 1 ? 'postać epizodyczna' : 'postaci epizodycznych'}: widać je w kartach scen.`));
    wrap.append(h('p', { class: 'note' }, '✶ postać historyczna. Opisy postaci rosną razem z lekturą: widać tylko to, co wiadomo do wybranego rozdziału.'));
    return wrap;
  }

  function viewAbout() {
    return h('article', { class: 'card' },
      h('h2', null, 'O mapie'),
      h('p', null, 'Podkładem są cztery mapy autora: Śląsk, Wrocław i Ostrów Tumski około roku 1293 oraz plan opactwa Najświętszej Marii na Piasku. Arkusze leżą jeden na drugim w prawdziwych współrzędnych, więc przy przybliżaniu Śląsk przechodzi we Wrocław, a Wrocław w Ostrów.'),
      h('p', null, 'Każda scena ma datę według kalendarza juliańskiego, którego wtedy używano, z nazwą dnia w rachubie kościelnej. Dzisiejsza data jest o siedem dni późniejsza.'),
      h('p', null, 'Pieczęć z liczbą oznacza miejsce, w którym dzieją się sceny. Czerwony pierścień na numerowanym kółku to miejsce z legendy mapy autora. Niebieska przerywana linia to podróż.'),
      h('p', { class: 'note' }, h('b', null, 'Bez spoilerów. '), 'Wybór „Przeczytane do” chowa wszystkie sceny, postacie i opisy z dalszych rozdziałów. Ustawienie zostaje w tej przeglądarce.'),
      h('h3', null, 'Źródła'),
      h('p', null, 'Mapy: Szymon Urbanowski (podkład © autorzy OpenStreetMap). Streszczenia scen i opisy miejsc na podstawie rozdziałów prolog–XI, przypisów, Słowniczka i Kalendarza powieści. Znaczniki opisane jako „położenie umowne” wskazują miejsca, których nie ma na mapach autora.'),
      h('p', { style: 'color:var(--ink-3)' }, `Wersja danych: ${D.meta.version}.`));
  }

  function showLocked(s) {
    state.sel = null; state.tab = 'card';
    renderAll();
    const ch = chByid[s.ch];
    panel.replaceChildren(h('article', { class: 'card' },
      h('div', { class: 'crumb' }, h('span', { class: 'folio' }, s.id)),
      h('h2', null, 'Ta scena jest jeszcze zabielona'),
      h('p', null, `Pochodzi z rozdziału ${ch.id} (${ch.title}). Mapa pokazuje teraz sceny tylko do rozdziału ${CH.find((c) => c.num === state.progress).id}.`),
      h('p', null, h('button', { type: 'button', class: 'chip pov', onclick: () => { setProgress(s.num); selectScene(s.id); } }, `Odsłoń do rozdziału ${ch.id}`))));
  }

  /* ---------- oś czasu ---------- */
  const strip = $('#strip');
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; }
  const mainScenes = SC.filter((s) => s.date && s.date.j && s.date.prec !== 'season');
  const J0 = Math.min(...mainScenes.map((s) => day(s.date.j).j)) - 3;
  const J1 = Math.max(...mainScenes.map((s) => day(s.date.end || s.date.j).j)) + 3;
  function renderStrip() {
    const W = Math.max(strip.clientWidth, 300), H = strip.clientHeight || 92;
    const PX0 = 58, X = (j) => PX0 + (j - J0) / (J1 - J0) * (W - PX0 - 6);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Oś czasu: sceny od jesieni 1293 do wiosny 1294' });
    const yAxis = H - 18, yCh = 12, yFeast = 25, top = 30;
    // pasma rozdziałów z numerem nad pasmem
    CH.filter((c) => c.num > 0).forEach((c, k) => {
      const ss = SC.filter((s) => s.ch === c.id && s.date && s.date.j && s.date.prec !== 'season');
      if (!ss.length) return;
      const a = Math.min(...ss.map((s) => day(s.date.j).j)), b = Math.max(...ss.map((s) => day(s.date.end || s.date.j).j));
      const x0 = X(a - 0.5), x1 = X(b + 0.5);
      svg.append(sv('rect', { class: 'band' + (k % 2 ? ' alt' : ''), x: x0, y: top - 2, width: Math.max(2, x1 - x0), height: yAxis - top + 2 }));
      svg.append(sv('text', { class: 'band-lbl', x: (x0 + x1) / 2, y: yCh, 'text-anchor': 'middle' }, c.id));
    });
    svg.append(sv('line', { class: 'axis', x1: PX0, x2: W - 4, y1: yAxis, y2: yAxis }));
    for (let y = 1293, m = 1; y <= 1294; m++) {
      if (m > 12) { m = 1; y++; if (y > 1294) break; }
      const j = jdnJulian(y, m, 1);
      if (j < J0 || j > J1) continue;
      const x = X(j);
      svg.append(sv('line', { class: 'tick', x1: x, x2: x, y1: yAxis, y2: yAxis + 5 }));
      svg.append(sv('text', { class: 'mon', x: x + 3, y: yAxis + 14 }, ROM[m - 1] + (m === 1 ? ' ' + y : '')));
    }
    let lastFeastX = -99;
    for (const f of D.keyFeasts || []) {
      const j = day(f.date).j; if (j < J0 || j > J1) continue;
      const x = X(j);
      svg.append(sv('line', { class: 'feast', x1: x, x2: x, y1: yFeast + 3, y2: yAxis }));
      if (W > 640 && x - lastFeastX > 62) { svg.append(sv('text', { class: 'feast-lbl', x, y: yFeast, 'text-anchor': 'middle' }, f.label)); lastFeastX = x; }
    }
    svg.append(sv('rect', { class: 'prolog', x: 2, y: top - 2, width: PX0 - 10, height: yAxis - top + 2, rx: 3 }));
    svg.append(sv('text', { class: 'band-lbl', x: (PX0 - 8) / 2 + 2, y: yCh, 'text-anchor': 'middle' }, 'P'));
    svg.append(sv('text', { class: 'mon', x: 4, y: yAxis + 14 }, 'wiosna 1293'));
    const firstLocked = SC.find((s) => !visible(s) && s.date && s.date.j);
    if (firstLocked) {
      const x = X(day(firstLocked.date.j).j - 0.5);
      svg.append(sv('rect', { class: 'lime', x, y: 0, width: Math.max(0, W - x), height: H }));
      if (W - x > 90) svg.append(sv('text', { class: 'lime-lbl', x: x + 8, y: yAxis - 8 }, 'dalej zabielone'));
    }
    const stack = new Map();
    const selId = state.sel && state.sel.type === 'scene' ? state.sel.id : null;
    const step = Math.min(7, (yAxis - top - 6) / 7);
    for (const s of visScenes()) {
      const season = !s.date || !s.date.j || s.date.prec === 'season';
      const x = season ? (PX0 - 8) / 2 + 2 : X(day(s.date.j).j);
      const key = season ? 'P' : Math.round(x / 3);
      const k = stack.get(key) || 0; stack.set(key, k + 1);
      const y = yAxis - 6 - k * step;
      if (s.date && s.date.prec === 'range' && s.date.end) {
        svg.append(sv('line', { x1: x, x2: X(day(s.date.end).j), y1: y, y2: y, stroke: 'var(--wax)', 'stroke-width': 2, opacity: 0.45 }));
      }
      const dot = sv('circle', { class: 'dot' + (s.id === selId ? ' cur' : '') + (state.person && !personHas(s) ? ' dim' : ''), cx: x, cy: y, r: s.id === selId ? 5 : 3.6 });
      dot.append(sv('title', null, `${s.id} ${s.title} — ${sceneWhen(s).main}`));
      dot.addEventListener('click', () => selectScene(s.id));
      svg.append(dot);
      if (s.id === selId && !season) svg.append(sv('line', { class: 'cursor', x1: x, x2: x, y1: top - 2, y2: yAxis }));
    }
    strip.replaceChildren(svg);
    const when = $('#when');
    const sel = selId ? scById[selId] : null;
    if (sel) {
      const w = sceneWhen(sel);
      when.replaceChildren(h('b', null, `${sel.id} ${sel.title}`), h('span', null, w.main), w.sub ? h('span', { class: 'g' }, w.sub) : null);
    } else {
      when.replaceChildren(h('span', null, 'Oś czasu: od prologu (wiosna 1293) do połowy marca 1294. Kliknij kropkę, żeby przejść do sceny.'));
    }
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => renderStrip()).observe(strip);

  /* ---------- postęp lektury ---------- */
  const sel = $('#progress');
  CH.forEach((c) => sel.append(h('option', { value: String(c.num) }, c.num ? `${c.id} · ${c.title}` : 'Prolog')));
  function setProgress(n) {
    const before = new Set(visScenes().map((s) => s.id));
    state.progress = clamp(n, 0, maxNum);
    store.set('progress', state.progress);
    sel.value = String(state.progress);
    state.fresh = new Set(visScenes().map((s) => s.id).filter((id) => !before.has(id)));
    if (state.sel && state.sel.type === 'scene' && !visible(scById[state.sel.id])) state.sel = null;
    if (state.person && !visScenes().some((s) => (s.chars || []).includes(state.person))) state.person = null;
    renderAll();
    setTimeout(() => { state.fresh.clear(); }, 2000);
  }
  sel.addEventListener('change', () => setProgress(+sel.value));

  /* ---------- zdarzenia UI ---------- */
  $('#sheets').addEventListener('click', (e) => { const b = e.target.closest('button[data-sheet]'); if (b) flyToSheet(b.dataset.sheet); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { state.tab = b.dataset.tab; renderPanel(); } });
  $('#prev').addEventListener('click', () => stepScene(-1));
  $('#next').addEventListener('click', () => stepScene(1));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight' && !e.altKey) { stepScene(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && !e.altKey) { stepScene(-1); e.preventDefault(); }
    if (e.key === 'Escape') { hideGloss(); }
  }, true);

  // powitanie
  const wel = $('#welcome');
  CH.forEach((c) => $('#welcome-pick').append(h('button', { type: 'button', onclick: () => { setProgress(c.num); closeWelcome(); } }, c.num ? c.id : 'P')));
  function closeWelcome() { wel.hidden = true; store.set('welcomed', true); }
  $('#welcome-close').addEventListener('click', closeWelcome);
  if (!store.get('welcomed', false)) wel.hidden = false;

  function renderAll() {
    renderMarkers();
    renderPanel();
    renderStrip();
    syncSheetButtons();
    peek();
  }

  /* ---------- start ---------- */
  sel.value = String(state.progress);
  map.fitBounds(bounds('slask'), { padding: [8, 8] });
  updateSheets(map.getZoom());
  map.getContainer().classList.toggle('z-low', map.getZoom() < 9.3);
  lastLevel = geoLevel();
  renderAll();
  const hash = decodeURIComponent((location.hash || '').slice(1));
  if (hash && scById[hash]) selectScene(hash);
  else if (hash && P[hash]) selectPlace(hash, { fly: true });
})();
