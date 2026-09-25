/* Biel — atlas do powieści Szymona Urbanowskiego.
 * Mapa w jednym układzie (Web Mercator): arkusze Śląska, Wrocławia, miasta w murach i Ostrowa Tumskiego leżą
 * jeden na drugim i przenikają się przy powiększaniu. Plany (opactwo na Piasku, Kotlina Cicha, opactwo
 * św. Wawrzyńca) mają osobny widok w układzie pikselowym.
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
  const plural = (n, one, few, many) => (n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many));

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
    if (dt.prec === 'range' && dt.end) return { main: `${fmt.dm(dt.j)} – ${fmt.short(dt.end)}`, sub: dt.label || '' };
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
  const chScenes = (cid) => SC.filter((s) => s.ch === cid);
  const lastOf = (cid) => { const l = chScenes(cid); return l[l.length - 1].idx; };
  const P = D.places;
  const PEOPLE = D.characters;
  const SH = D.sheets;

  /* ---------- miejsce w lekturze ---------- */
  function initialUpto() {
    const id = store.get('upto', null);
    if (id && scById[id]) return scById[id].idx;
    const old = store.get('progress', null);                // zapis ze starszej wersji: numer rozdziału
    if (typeof old === 'number') { const c = CH.find((x) => x.num === old); if (c) return lastOf(c.id); }
    return lastOf('I');
  }
  const state = {
    upto: initialUpto(),     // indeks ostatniej przeczytanej sceny
    sel: null,               // {type:'scene'|'place'|'person', id}
    tab: 'card',
    person: null,            // filtr postaci
    plan: null,              // otwarty plan: opactwo | kotlina | wawrzyniec
    fresh: new Set()         // świeżo odsłonięte sceny (animacja „atramentu”)
  };
  const visible = (s) => s.idx <= state.upto;
  const visScenes = () => SC.filter(visible);
  const curScene = () => SC[state.upto];
  const curNum = () => curScene().num;                                   // rozdział, który się czyta
  const doneNum = () => (lastOf(curScene().ch) === state.upto ? curNum() : curNum() - 1); // ostatni skończony
  const chRead = (cid) => chByid[cid] && chByid[cid].num <= doneNum();   // treści przypisane do całego rozdziału
  const allRead = () => state.upto === SC.length - 1;

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
  const PLANS = Object.keys(SH).filter((k) => SH[k].plan);
  const planOpen = (id) => !SH[id].from || chByid[SH[id].from].num <= curNum();
  const DETAIL = ['opactwo', 'wawrzyniec', 'kotlina', 'ostrow', 'mury', 'wroclaw', 'slask'];
  function bestSheet(pid) {
    const order = DETAIL.filter((s) => !SH[s].plan || planOpen(s));
    for (const s of order) { const q = posOn(pid, s); if (q && q.id === pid) return s; }
    for (const s of order) if (posOn(pid, s)) return s;
    return 'slask';
  }
  // czy czytelnik już zna to miejsce (pierwsza scena lub wzmianka jest za nim)
  const known = (pid) => { const f = P[pid] && P[pid].first; return !f || !scById[f] || scById[f].idx <= state.upto; };
  function placeName(pid) { return (P[pid] && P[pid].name) || pid; }
  const shortName = (pid) => (P[pid] && (P[pid].short || P[pid].name)) || pid;
  function scenesAt(pid, list) { return list.filter((s) => s.place === pid || inside(s.place, pid)); }
  function personName(id) {
    const c = PEOPLE[id]; if (!c) return id;
    const ok = (c.names || []).filter((n) => chRead(n.ch));
    return (ok.length ? ok[ok.length - 1].name : (c.names && c.names[0] ? c.names[0].name : c.name)) || id;
  }

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
    glPop = h('div', { class: 'gl-pop', role: 'tooltip' }, h('b', null, g.term), g.def, h('div', { class: 'gl-src' }, 'Słowniczek'));
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
  const GEO = ['slask', 'wroclaw', 'mury', 'ostrow'];
  const LEGEND = new Set(['wroclaw', 'mury']);           // arkusze z numerowanymi kółkami legendy
  const sheetMerc = {};
  for (const id of GEO) {
    const s = SH[id];
    sheetMerc[id] = { sw: SM.project(L.latLng(s.bounds[0])), ne: SM.project(L.latLng(s.bounds[1])), W: s.size[0], H: s.size[1] };
  }
  function pxToLatLng(sheet, x, y) {
    const m = sheetMerc[sheet];
    return SM.unproject(L.point(m.sw.x + (x / m.W) * (m.ne.x - m.sw.x), m.ne.y - (y / m.H) * (m.ne.y - m.sw.y)));
  }
  const pxMeters = (sheet) => (sheetMerc[sheet].ne.x - sheetMerc[sheet].sw.x) / sheetMerc[sheet].W;
  const bounds = (id) => L.latLngBounds(SH[id].bounds);

  const map = L.map('map', {
    zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110,
    minZoom: 7, maxZoom: 19.5, attributionControl: false, zoomControl: false
  });
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
  const ATTR = 'Mapy: Szymon Urbanowski · podkład © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">autorzy OpenStreetMap</a>';
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Przybliż', zoomOutTitle: 'Oddal' }).addTo(map);
  map.setMaxBounds(bounds('slask').pad(0.2));

  const overlays = {};
  GEO.forEach((id, i) => { overlays[id] = L.imageOverlay(SH[id].img, SH[id].bounds, { className: 'sheet' + (i ? ' inset' : ''), zIndex: i + 1, attribution: ATTR }); });
  const routeLayer = L.layerGroup().addTo(map);
  const walkLayer = L.layerGroup().addTo(map);
  const markLayer = L.layerGroup().addTo(map);

  const OPACITY = {
    slask: (z) => (z <= 11.6 ? 1 : clamp(1 - (z - 11.6) / 1.1, 0.3, 1)),
    wroclaw: (z) => clamp((z - 10.9) / 1.0, 0, 1),
    mury: (z) => clamp((z - 14.9) / 0.7, 0, 1),
    ostrow: (z) => clamp((z - 16.2) / 0.6, 0, 1)
  };
  const SHOW = { slask: (z) => z < 13.6, wroclaw: (z) => z > 10.7, mury: (z) => z > 14.7, ostrow: (z) => z > 16.0 };
  function updateSheets(z) {
    for (const id of GEO) {
      const on = SHOW[id](z), has = map.hasLayer(overlays[id]);
      if (on && !has) overlays[id].addTo(map);
      if (!on && has) map.removeLayer(overlays[id]);
      if (on) overlays[id].setOpacity(OPACITY[id](z));
    }
  }
  function geoLevel() {
    const z = map.getZoom(), c = map.getCenter();
    if (z < 12.0) return 'slask';
    if (z >= 16.8 && bounds('ostrow').pad(-0.05).contains(c)) return 'ostrow';
    if (z >= 15.2 && bounds('mury').pad(-0.03).contains(c)) return 'mury';
    return 'wroclaw';
  }
  const CHAIN = { slask: ['slask'], wroclaw: ['wroclaw', 'slask'], mury: ['mury', 'wroclaw', 'slask'], ostrow: ['ostrow', 'mury', 'wroclaw', 'slask'] };
  function displayFor(pid, level) {
    for (const s of CHAIN[level]) {
      const q = posOn(pid, s);
      if (q) return { sheet: s, ...q };
    }
    return null;
  }
  const anchor = (d) => (LEGEND.has(d.sheet) && d.cx != null ? pxToLatLng(d.sheet, d.cx, d.cy) : pxToLatLng(d.sheet, d.x, d.y));

  /* ---------- plany (opactwo na Piasku, Kotlina Cicha, opactwo św. Wawrzyńca) ---------- */
  let planMap = null; let planLayer = null; let planImg = null;
  const abLatLng = (x, y) => L.latLng(-y, x);
  const planBounds = (id) => [[-SH[id].size[1], 0], [0, SH[id].size[0]]];
  function setPlan(id, focus) {
    state.plan = id;
    $('#abbey').hidden = !id;
    if (id) {
      $('#abbey').setAttribute('aria-label', SH[id].title);
      if (!planMap) {
        planMap = L.map('abbey', { crs: L.CRS.Simple, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: -3, maxZoom: 1.5, attributionControl: false, zoomControl: false });
        L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution('Plan: Szymon Urbanowski').addTo(planMap);
        L.control.zoom({ position: 'bottomright', zoomInTitle: 'Przybliż', zoomOutTitle: 'Oddal' }).addTo(planMap);
        planLayer = L.layerGroup().addTo(planMap);
      }
      planMap.invalidateSize();
      if (!planImg || planImg._plan !== id) {
        if (planImg) planMap.removeLayer(planImg);
        planImg = L.imageOverlay(SH[id].img, planBounds(id), { className: 'sheet' }).addTo(planMap);
        planImg._plan = id;
        planMap.setMaxBounds(L.latLngBounds(planBounds(id)).pad(0.15));
        planMap.fitBounds(planBounds(id));
      }
      const q = focus && posOn(focus, id);
      if (q) planMap.flyTo(abLatLng(q.cx != null ? q.cx : q.x, q.cy != null ? q.cy : q.y), Math.max(planMap.getZoom(), -0.75), { duration: 0.6 });
      else if (!focus) planMap.fitBounds(planBounds(id));
    }
    renderMarkers(); syncSheetButtons();
  }

  /* ---------- znaczniki ---------- */
  const sealIcon = (count, cls) => L.divIcon({ className: 'seal-icon', iconSize: [0, 0], html: `<div class="seal ${cls || ''}">${count}</div>` });
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
      const isPlan = SH[level] && SH[level].plan;
      const q = isPlan ? posOn(s.place, level) : null;
      const d = isPlan ? (q ? { sheet: level, ...q } : null) : displayFor(s.place, level);
      if (!d || d.x == null) continue;
      const key = d.sheet + ':' + d.id;
      if (!groups.has(key)) groups.set(key, { ...d, scenes: [] });
      groups.get(key).scenes.push(s);
    }
    return groups;
  }

  function tipFor(pid, n, sheet) {
    const p = P[pid] || {};
    const lg = sheet && p.sheets && p.sheets[sheet];
    const num = lg && lg.n ? `${lg.n}. ` : '';
    if (!known(pid)) return num ? `nr ${lg.n}` : '';
    const name = (lg && lg.label) || p.name || pid;
    return `${num}${name}${n ? ` · ${n} ${plural(n, 'scena', 'sceny', 'scen')}` : ''}`;
  }
  function ringRadius(sheet, cx, cy, r) {
    const c = pxToLatLng(sheet, cx, cy);
    return (r || 23) * pxMeters(sheet) * Math.cos(c.lat * Math.PI / 180);
  }

  function renderMarkers() {
    markLayer.clearLayers(); walkLayer.clearLayers();
    if (planLayer) planLayer.clearLayers();
    const level = geoLevel();
    const selIds = selectedPlaceIds();
    const selScene = state.sel && state.sel.type === 'scene' ? scById[state.sel.id] : null;
    const groups = groupScenes(level);
    const done = new Set();
    for (const g of groups.values()) {
      const n = g.scenes.length;
      const fresh = g.scenes.some((s) => state.fresh.has(s.id));
      const dim = state.person && !g.scenes.some(personHas);
      const isSel = [...selIds].some((pid) => pid === g.id || inside(pid, g.id));
      const ll = anchor(g);
      if (LEGEND.has(g.sheet) && g.cx != null && level !== 'slask') {
        // numerowane kółko z mapy autora: pierścień w metrach, rośnie razem z mapą
        L.circle(ll, { radius: ringRadius(g.sheet, g.cx, g.cy, g.r), className: 'ring has' + (isSel ? ' sel' : '') + (fresh ? ' fresh' : ''), weight: 4, fill: true, fillOpacity: 0, opacity: dim ? 0.3 : 1 })
          .on('click', () => selectPlace(g.id, { fly: false }))
          .bindTooltip(tipFor(g.id, n, g.sheet), { className: 'tip', direction: 'top', offset: [0, -14] })
          .addTo(markLayer);
      } else {
        L.marker(ll, { icon: sealIcon(n, [level === 'slask' && g.id !== 'wroclaw' ? 'small' : '', fresh ? 'fresh' : '', dim ? 'dim' : '', isSel ? 'current' : ''].join(' ')), riseOnHover: true, keyboard: true, title: placeName(g.id) })
          .on('click', () => selectPlace(g.id, { fly: g.sheet === 'slask' && g.id === 'wroclaw' }))
          .bindTooltip(tipFor(g.id, n, g.sheet), { className: 'tip', direction: 'top', offset: [0, -16] })
          .addTo(markLayer);
      }
      if (isSel) L.marker(ll, { icon: pulseIcon(), interactive: false, keyboard: false }).addTo(markLayer);
      done.add(g.sheet + ':' + g.id);
    }
    // numerowane miejsca bez scen: ciche pola do kliknięcia (legenda autora)
    if (level !== 'slask') {
      const sheets = level === 'wroclaw' ? ['wroclaw'] : ['mury', 'wroclaw'];
      const mb = bounds('mury');
      for (const sheet of sheets) {
        for (const [pid, p] of Object.entries(P)) {
          const w = p.sheets && p.sheets[sheet];
          if (!w || w.cx == null || done.has(sheet + ':' + pid)) continue;
          const ll = pxToLatLng(sheet, w.cx, w.cy);
          if (sheet === 'wroclaw' && level !== 'wroclaw' && mb.contains(ll)) continue;   // tu leży już arkusz miasta w murach
          L.circle(ll, { radius: ringRadius(sheet, w.cx, w.cy, w.r), className: 'ring', weight: 3, opacity: 0, fill: true, fillOpacity: 0 })
            .on('click', () => selectPlace(pid, { fly: false }))
            .bindTooltip(tipFor(pid, 0, sheet), { className: 'tip', direction: 'top', offset: [0, -14] })
            .addTo(markLayer);
        }
      }
    }
    // droga w obrębie wybranej sceny
    if (selScene && selScene.path && selScene.path.length > 1 && !state.plan) {
      const pts = selScene.path.map((pid) => displayFor(pid, level)).filter(Boolean).map(anchor);
      const uniq = pts.filter((p, i) => i === 0 || !p.equals(pts[i - 1]));
      if (uniq.length > 1) L.polyline(uniq, { className: 'walk', weight: 2.5, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(walkLayer);
    }
    renderRoutes(level);
    if (state.plan) renderPlanMarkers(state.plan, selIds);
    updateCaption();
  }

  function renderPlanMarkers(plan, selIds) {
    const groups = groupScenes(plan);
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
          .bindTooltip(tipFor(g.id, n, plan), { className: 'tip', direction: 'top', offset: [0, -16] })
          .addTo(planLayer);
      } else {
        L.marker(c, { icon: sealIcon(n, [fresh ? 'fresh' : '', dim ? 'dim' : '', isSel ? 'current' : ''].join(' ')), title: placeName(g.id) })
          .on('click', () => selectPlace(g.id, { fly: false }))
          .bindTooltip(tipFor(g.id, n, plan), { className: 'tip', direction: 'top', offset: [0, -16] })
          .addTo(planLayer);
      }
      if (isSel) L.marker(c, { icon: pulseIcon(), interactive: false, keyboard: false }).addTo(planLayer);
      done.add(g.id);
    }
    for (const [pid, p] of Object.entries(P)) {
      const a = p.sheets && p.sheets[plan];
      if (!a || a.cx == null || done.has(pid)) continue;
      L.circle(abLatLng(a.cx, a.cy), { radius: (a.r || 30) + 2, className: 'ring', weight: 3, opacity: 0, fill: true, fillOpacity: 0 })
        .on('click', () => selectPlace(pid, { fly: false }))
        .bindTooltip(tipFor(pid, 0, plan), { className: 'tip', direction: 'top', offset: [0, -16] })
        .addTo(planLayer);
    }
  }

  function renderRoutes(level) {
    routeLayer.clearLayers();
    if (level !== 'slask') return;
    for (const j of D.journeys || []) {
      const shown = j.stops.map((pid, i) => ({ pid, sc: scById[(j.stopScenes || [])[i]] })).filter((x) => !x.sc || visible(x.sc));
      const pts = shown.map((x) => posOn(x.pid, 'slask')).filter(Boolean).map((q) => pxToLatLng('slask', q.x, q.y));
      if (pts.length < 2) continue;
      const fresh = state.fresh.size && j.scenes.some((id) => state.fresh.has(id));
      L.polyline(pts, { className: 'route' + (fresh ? ' fresh' : ''), weight: 3, dashArray: '1 8', lineCap: 'round', interactive: true })
        .bindTooltip(j.label, { className: 'tip', sticky: true })
        .addTo(routeLayer);
      (j.labels || []).forEach((lab) => {
        if (!shown.some((x) => x.pid === lab.place)) return;
        const q = posOn(lab.place, 'slask'); if (!q) return;
        L.marker(pxToLatLng('slask', q.x, q.y), { icon: stopIcon(lab.text), interactive: false, keyboard: false }).addTo(routeLayer);
      });
    }
  }

  function updateCaption() {
    const lv = state.plan || geoLevel();
    $('#caption').replaceChildren(h('b', null, SH[lv].title), ' ', SH[lv].subtitle || '');
  }
  function syncSheetButtons() {
    const lv = state.plan || geoLevel();
    document.querySelectorAll('#sheets button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.sheet === lv));
      b.hidden = !!(SH[b.dataset.sheet] && SH[b.dataset.sheet].plan && !planOpen(b.dataset.sheet));
    });
  }
  function flyToSheet(id) {
    if (SH[id].plan) { setPlan(id); return; }
    if (state.plan) setPlan(null);
    map.flyToBounds(bounds(id), { padding: [10, 10], duration: 1.1 });
  }
  const ZOOM_FOR = { slask: 9.4, wroclaw: 14.6, mury: 16.3, ostrow: 17.4 };
  function flyToPlace(pid) {
    const s = bestSheet(pid);
    if (SH[s].plan) { setPlan(s, pid); peek(); return; }
    if (state.plan) setPlan(null);
    const q = posOn(pid, s);
    if (!q) return;
    const ll = anchor({ sheet: s, ...q });
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
    else if (state.sel.type === 'place') t = known(state.sel.id) ? placeName(state.sel.id) : 'Miejsce z dalszej części';
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
    if (opts.fly && known(pid)) flyToPlace(pid);
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
    const views = { scenes: viewScenes, places: viewPlaces, people: viewPeople, glossary: viewGlossary, about: viewAbout };
    panel.replaceChildren((views[state.tab] || viewCard)());
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
  function readingLabel() {
    const s = curScene(), list = chScenes(s.ch), k = list.findIndex((x) => x.id === s.id) + 1;
    const ch = chByid[s.ch];
    if (k === list.length) return ch.num ? `cały rozdział ${ch.id}, ${ch.title}` : 'prolog';
    return `${ch.num ? `rozdział ${ch.id}` : 'prolog'}, do sceny ${k} z ${list.length}`;
  }

  function viewHome() {
    const vis = visScenes();
    const places = new Set(vis.map((s) => s.place));
    const s = curScene();
    return h('div', { class: 'card' },
      h('img', { class: 'cover', src: D.meta.cover, alt: 'Okładka powieści „Biel”', width: '104', height: '139' }),
      h('div', { class: 'crumb' }, h('span', null, 'Wrocław i Śląsk, 1293–1294')),
      h('h2', null, 'Gdzie i kiedy dzieje się „Biel”'),
      h('p', null, 'Każda scena powieści ma tu swoje miejsce na mapach autora i swój dzień w kalendarzu juliańskim. Kliknij znacznik na mapie, kropkę na osi czasu albo przejdź scena po scenie strzałkami.'),
      h('p', null, `Przeczytane: ${readingLabel()}. Na mapie ${vis.length} ${plural(vis.length, 'scena', 'sceny', 'scen')} w ${places.size} ${places.size === 1 ? 'miejscu' : 'miejscach'}.${allRead() ? '' : ' Dalej zabielone.'}`),
      s.incipit ? h('p', { class: 'note' }, h('b', null, `${s.id} zaczyna się: `), `„${s.incipit}”`) : null,
      h('div', { class: 'nav' },
        h('button', { type: 'button', onclick: () => selectScene(SC[0].id) }, h('small', null, 'Zacznij od początku'), `${SC[0].id} ${SC[0].title}`),
        h('button', { type: 'button', onclick: () => selectScene(s.id) }, h('small', null, 'Ostatnia przeczytana'), `${s.id} ${s.title}`)),
      h('p', { class: 'more' }, h('button', { type: 'button', class: 'linkish', onclick: showAbout }, 'O mapie, źródła i linki do rozdziałów')));
  }
  function showAbout() { state.tab = 'about'; renderPanel(); panel.scrollTop = 0; }

  function viewScene(s) {
    const ch = chByid[s.ch];
    const w = sceneWhen(s);
    const vis = visScenes(); const i = vis.findIndex((x) => x.id === s.id);
    const prev = vis[i - 1], next = vis[i + 1];
    const lgd = legendOf(P[s.place] || {});
    const people = (s.chars || []).filter((c) => PEOPLE[c]);
    return h('article', { class: 'card' },
      h('div', { class: 'crumb' }, h('span', { class: 'folio' }, s.id), h('span', null, ch.num ? `Rozdział ${ch.id} · ` : '', h('i', null, ch.title))),
      h('h2', null, s.title),
      h('dl', { class: 'meta' },
        h('div', null, h('dt', null, 'kiedy'), h('dd', null, w.main, w.sub ? h('div', { class: 'sub' }, w.sub) : null)),
        s.time ? h('div', null, h('dt', null, 'pora'), h('dd', null, glossify(s.time))) : null,
        h('div', null, h('dt', null, 'gdzie'), h('dd', null, h('button', { type: 'button', class: 'linkish', onclick: () => selectPlace(s.place, { fly: true }) }, placeName(s.place)), lgd ? h('div', { class: 'sub' }, lgd.text) : null)),
        (s.pov && s.pov !== 'dietrich') || s.povLabel ? h('div', null, h('dt', null, 'oczami'), h('dd', null,
          s.povLabel ? (s.povLabel === 'narrator' ? 'narrator, bez postaci' : s.povLabel) : h('button', { type: 'button', class: 'linkish', onclick: () => selectPerson(s.pov) }, personName(s.pov)))) : null),
      h('p', null, glossify(s.summary)),
      s.quote ? h('p', { class: 'quote' }, `„${s.quote}”`) : null,
      people.length ? [h('h3', null, 'Na scenie'), h('ul', { class: 'chips' }, people.map((c) => h('li', null, PEOPLE[c].minor
        ? h('span', { class: 'chip minor' }, personName(c))
        : h('button', { type: 'button', class: 'chip' + (c === s.pov ? ' pov' : ''), onclick: () => selectPerson(c) }, personName(c)))))] : null,
      s.objects && s.objects.length ? [h('h3', null, 'Rzeczy'), h('p', { class: 'things' }, s.objects.join(' · '))] : null,
      h('div', { class: 'nav' },
        h('button', { type: 'button', disabled: !prev, onclick: () => prev && selectScene(prev.id) }, h('small', null, '‹ poprzednia'), prev ? `${prev.id} ${prev.title}` : '—'),
        next ? h('button', { type: 'button', onclick: () => selectScene(next.id) }, h('small', null, 'następna ›'), `${next.id} ${next.title}`)
          : allRead() ? h('button', { type: 'button', disabled: true }, h('small', null, 'koniec'), 'na razie to wszystko')
            : h('button', { type: 'button', onclick: () => setUpto(state.upto + 1, { select: true }) }, h('small', null, 'przeczytana następna scena?'), 'Odsłoń jedną scenę dalej')));
  }

  function readable(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter((x) => chRead(x.ch) && !seen.has(x.text) && seen.add(x.text));
  }
  const PLAN_LABEL = { opactwo: 'plan opactwa na Piasku', wawrzyniec: 'plan opactwa św. Wawrzyńca', kotlina: 'schemat Kotliny Cichej', mury: 'plan miasta w murach', wroclaw: 'mapa Wrocławia' };
  function legendOf(p) {
    const sh = (p && p.sheets) || {};
    for (const k of ['opactwo', 'wawrzyniec', 'mury', 'wroclaw']) if (sh[k] && sh[k].n) return { sheet: k, n: sh[k].n, text: `${PLAN_LABEL[k]}, nr ${sh[k].n}` };
    return null;
  }
  function viewPlace(pid) {
    const p = P[pid] || { name: pid };
    if (!known(pid)) {
      const lg = legendOf(p);
      return h('article', { class: 'card' },
        h('div', { class: 'crumb' }, h('span', null, lg ? lg.text : 'Miejsce')),
        h('h2', null, lg ? h('span', { class: 'num' }, String(lg.n)) : null, 'Jeszcze zabielone'),
        h('p', null, 'To miejsce pojawia się w dalszej części książki. Opis odsłoni się, kiedy mapa dojdzie do tej sceny.'));
    }
    const vis = visScenes();
    const here = scenesAt(pid, vis);
    const mentions = vis.filter((s) => (s.mentioned || []).includes(pid) && !here.includes(s));
    const leg = [];
    if (p.sheets) {
      for (const k of ['mury', 'wroclaw', 'opactwo', 'wawrzyniec']) if (p.sheets[k] && p.sheets[k].n) leg.push(`${PLAN_LABEL[k]}, nr ${p.sheets[k].n}`);
      if (p.sheets.kotlina && planOpen('kotlina')) leg.push(PLAN_LABEL.kotlina);
      if (p.sheets.ostrow) leg.push('mapa Ostrowa Tumskiego');
      if (p.sheets.slask && !leg.length) leg.push('mapa Śląska');
    }
    const parent = p.parent && P[p.parent];
    const lg = legendOf(p);
    const plans = PLANS.filter((k) => planOpen(k) && ancestors(pid).concat(Object.values(P).filter((q) => q.parent === pid)).some((q) => q.sheets && q.sheets[k]));
    return h('article', { class: 'card' },
      h('div', { class: 'crumb' }, parent ? h('button', { type: 'button', class: 'linkish', onclick: () => selectPlace(parent.id, { fly: true }) }, parent.name) : h('span', null, 'Miejsce'), leg.length ? h('span', null, leg.join(' · ')) : null),
      h('h2', null, lg ? h('span', { class: 'num' }, String(lg.n)) : null, p.name),
      p.approx ? h('p', { class: 'note' }, h('b', null, 'Położenie umowne. '), p.approx === true ? 'Tego miejsca nie ma na mapach autora; znacznik stoi tam, gdzie wskazuje tekst.' : p.approx) : null,
      readable(p.desc).map((x) => h('p', null, h('span', { class: 'chtag' }, x.ch === 'P' ? 'prolog' : x.ch), glossify(x.text))),
      readable(p.notes).map((x) => h('p', { class: 'note' }, h('b', null, 'Z przypisów: '), glossify(x.text))),
      plans.length ? h('p', { class: 'chips' }, plans.map((k) => h('button', { type: 'button', class: 'chip', onclick: () => setPlan(k, posOn(pid, k) && posOn(pid, k).id === pid ? pid : null) }, `Otwórz: ${SH[k].title}`))) : null,
      h('h3', null, here.length ? `Sceny w tym miejscu (${here.length})` : 'Sceny w tym miejscu'),
      here.length ? h('ul', { class: 'list' }, here.map((s) => sceneRow(s, { place: s.place !== pid }))) : h('p', { class: 'locked' }, 'W przeczytanej części nic się tu jeszcze nie wydarzyło.'),
      mentions.length ? [h('h3', null, 'Wspomniane w'), h('ul', { class: 'list' }, mentions.map((s) => sceneRow(s)))] : null);
  }

  function introBlock(intro) {
    const para = (x) => h('p', null, h('span', { class: 'chtag' }, x.ch === 'P' ? 'prolog' : x.ch), glossify(x.text));
    if (intro.length <= 3) return intro.map(para);
    const older = intro.slice(0, -2), newer = intro.slice(-2);
    return [h('details', { class: 'older' }, h('summary', null, `Wcześniej (${older.length} ${plural(older.length, 'rozdział', 'rozdziały', 'rozdziałów')})`), older.map(para)), newer.map(para)];
  }
  function viewPerson(id) {
    const c = PEOPLE[id] || { name: id };
    const vis = visScenes();
    const scenes = vis.filter((s) => (s.chars || []).includes(id) || s.pov === id);
    const intro = (c.intro || []).filter((x) => chRead(x.ch));
    const filterOn = state.person === id;
    return h('article', { class: 'card' },
      h('div', { class: 'crumb' }, h('span', null, c.group || 'Postać'), c.hist ? h('span', { class: 'badge' }, 'postać historyczna') : null),
      h('h2', null, personName(id)),
      c.role && personName(id) !== c.role && chRead((c.names || [{ ch: 'P' }]).slice(-1)[0].ch) ? h('p', { class: 'sub-role' }, c.role) : null,
      intro.length ? introBlock(intro) : h('p', { class: 'locked' }, 'Opis tej postaci odsłoni się po przeczytaniu rozdziału, w którym się pojawia.'),
      h('p', null, h('button', { type: 'button', class: 'chip' + (filterOn ? ' pov' : ''), 'aria-pressed': String(filterOn), onclick: () => { state.person = filterOn ? null : id; renderAll(); } }, filterOn ? 'Pokaż znowu wszystkie sceny' : 'Pokaż na mapie tylko sceny z tą postacią')),
      h('h3', null, `Sceny (${scenes.length})`),
      scenes.length ? h('ul', { class: 'list' }, scenes.map((s) => sceneRow(s))) : h('p', { class: 'locked' }, 'Jeszcze się nie pojawia.'));
  }

  function viewScenes() {
    const wrap = h('div', { class: 'card' });
    for (const ch of CH) {
      const list = chScenes(ch.id);
      if (list[0].idx > state.upto) {
        wrap.append(h('div', { class: 'ch-head' }, h('span', { class: 'r' }, ch.num ? ch.id : 'P'), h('span', { class: 'ti muted' }, 'zabielone')));
        continue;
      }
      wrap.append(h('div', { class: 'ch-head' }, h('span', { class: 'r' }, ch.num ? ch.id : 'P'), h('span', { class: 'ti' }, ch.title)));
      if (ch.motto && ch.motto.text) wrap.append(h('p', { class: 'ch-motto' }, ch.motto.text, ch.motto.source ? ` — ${ch.motto.source}` : ''));
      const read = list.filter(visible);
      wrap.append(h('ul', { class: 'list' }, read.map((s) => sceneRow(s))));
      if (read.length < list.length) wrap.append(h('p', { class: 'locked' }, `Dalej w tym rozdziale: ${list.length - read.length} ${plural(list.length - read.length, 'scena', 'sceny', 'scen')}, jeszcze zabielone.`));
    }
    return wrap;
  }

  const SHEET_GROUPS = [['opactwo', 'Opactwo na Piasku'], ['ostrow', 'Ostrów Tumski'], ['mury', 'Wrocław w murach'], ['wroclaw', 'Wrocław i okolice'], ['kotlina', 'Kotlina Cicha i Głuszyca'], ['wawrzyniec', 'Opactwo św. Wawrzyńca'], ['slask', 'Śląsk'], ['far', 'Poza mapą']];
  function viewPlaces() {
    const vis = visScenes();
    const counts = new Map();
    vis.forEach((s) => counts.set(s.place, (counts.get(s.place) || 0) + 1));
    const mentioned = new Set(vis.flatMap((s) => s.mentioned || []));
    const wrap = h('div', { class: 'card' });
    const byGroup = new Map(SHEET_GROUPS.map(([k]) => [k, []]));
    for (const [pid, p] of Object.entries(P)) {
      if (p.hidden || !known(pid)) continue;
      const n = counts.get(pid) || 0;
      const lg = legendOf(p);
      const cityLegend = lg && (lg.sheet === 'wroclaw' || lg.sheet === 'mury' || lg.sheet === 'opactwo');
      if (!n && !mentioned.has(pid) && !cityLegend) continue;
      const g = p.far ? 'far' : bestSheet(pid);
      byGroup.get(g).push({ pid, p, n, num: lg ? lg.n : null });
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
    for (const g of D.personGroups || [...groups.keys()]) {
      const items = groups.get(g); if (!items) continue;
      items.sort((a, b) => b.n - a.n || personName(a.id).localeCompare(personName(b.id), 'pl'));
      wrap.append(h('div', { class: 'group-h' }, g));
      wrap.append(h('ul', { class: 'list' }, items.map(({ id, c, n }) => h('li', null,
        h('button', { type: 'button', class: 'row', 'aria-current': state.sel && state.sel.type === 'person' && state.sel.id === id ? 'true' : null, onclick: () => selectPerson(id) },
          h('span', { class: 'id' }, c.hist ? '✶' : ''),
          h('span', { class: 't' }, personName(id), c.role && c.role !== personName(id) && chRead((c.names || [{ ch: 'P' }]).slice(-1)[0].ch) ? h('small', null, c.role) : null),
          h('span', { class: 'd' }, String(n)))))));
    }
    if (!groups.size) wrap.append(h('p', { class: 'locked' }, 'Nikt się jeszcze nie pojawił.'));
    if (minor) wrap.append(h('p', { class: 'locked' }, `Oprócz nich ${minor} ${plural(minor, 'postać epizodyczna', 'postaci epizodyczne', 'postaci epizodycznych')}: widać je w kartach scen.`));
    wrap.append(h('p', { class: 'note' }, '✶ postać historyczna. Opisy postaci rosną razem z lekturą: widać to, co wiadomo po skończonych rozdziałach.'));
    return wrap;
  }

  function viewGlossary() {
    const wrap = h('div', { class: 'card' });
    wrap.append(h('p', { class: 'lead' }, 'Słowa, które w książce wracają: godziny, miary i monety, urzędy, rzeczy z warsztatu pisarza i pojęcia prawa. Objaśnienia autora ze Słowniczka powieści.'));
    let group = null, dl = null;
    for (const g of GL) {
      if (g.group !== group) {
        group = g.group;
        wrap.append(h('div', { class: 'group-h' }, group || 'Inne'));
        dl = h('dl', { class: 'gloss' }); wrap.append(dl);
      }
      dl.append(h('dt', null, g.term), h('dd', null, g.def));
    }
    wrap.append(h('p', { class: 'note' }, 'W kartach scen i miejsc te słowa mają kropkowane podkreślenie: najedź albo stuknij, żeby zobaczyć objaśnienie.'));
    return wrap;
  }

  function viewAbout() {
    return h('article', { class: 'card' },
      h('h2', null, 'O mapie'),
      h('p', null, h('button', { type: 'button', class: 'chip pov', onclick: () => openIntro() }, 'Pokaż stronę powitalną')),
      h('p', null, 'Podkładem są mapy autora: Śląsk, Wrocław z okolicą, miasto w murach i Ostrów Tumski około roku 1293 oraz plan opactwa Najświętszej Marii na Piasku, a z „Żółci” plan opactwa św. Wawrzyńca i schemat Kotliny Cichej z Głuszycą (stan sprzed pożaru, około 1290). Arkusze Śląska, Wrocławia, miasta w murach i Ostrowa leżą jeden na drugim w prawdziwych współrzędnych, więc przy przybliżaniu przechodzą jeden w drugi.'),
      h('p', null, 'Każda scena ma datę według kalendarza juliańskiego, którego wtedy używano, z nazwą dnia w rachubie kościelnej. Dzisiejsza data jest o siedem dni późniejsza.'),
      h('p', null, 'Czarny znacznik z liczbą oznacza miejsce, w którym dzieją się sceny. Czarny pierścień na numerowanym kółku to miejsce z legendy mapy autora. Szara przerywana linia to podróż.'),
      h('p', { class: 'note' }, h('b', null, 'Bez spoilerów. '), 'Ustawienie „Przeczytane do” (rozdział i scena) chowa dalsze sceny, postacie, opisy i nazwy miejsc. Opisy postaci i miejsc odsłaniają się po skończeniu rozdziału. Ustawienie zostaje w tej przeglądarce.'),
      h('h3', null, 'Linki do rozdziałów'),
      h('p', null, 'Adres z dopiskiem #do-IX otwiera mapę odsłoniętą do końca rozdziału IX (nigdy nie cofa lektury). Nadaje się na kod QR na końcu rozdziału w książce. Dopisek #IX.3 otwiera konkretną scenę.'),
      h('h3', null, 'Źródła'),
      h('p', null, 'Mapy: Szymon Urbanowski (podkład © autorzy OpenStreetMap). Streszczenia scen i opisy miejsc na podstawie rozdziałów prolog–XI, przypisów, Słowniczka i Kalendarza powieści. Znaczniki opisane jako „położenie umowne” wskazują miejsca, których nie ma na mapach autora.'),
      h('p', { class: 'muted' }, `Wersja danych: ${D.meta.version}.`));
  }

  function showLocked(s) {
    state.sel = null; state.tab = 'card';
    renderAll();
    panel.replaceChildren(h('article', { class: 'card' },
      h('div', { class: 'crumb' }, h('span', { class: 'folio' }, s.id)),
      h('h2', null, 'Ta scena jest jeszcze zabielona'),
      h('p', null, `Mapa pokazuje teraz: ${readingLabel()}.`),
      h('p', null, h('button', { type: 'button', class: 'chip pov', onclick: () => { setUpto(s.idx); selectScene(s.id); } }, `Odsłoń do sceny ${s.id}`))));
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
    const defs = sv('defs'); const pat = sv('pattern', { id: 'hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' });
    pat.append(sv('rect', { width: 7, height: 7, fill: '#ffffff' }), sv('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#d9d5ce', 'stroke-width': 1.2 }));
    defs.append(pat); svg.append(defs);
    const yAxis = H - 18, yCh = 12, yFeast = 25, top = 30;
    CH.filter((c) => c.num > 0).forEach((c, k) => {
      const ss = chScenes(c.id).filter((s) => s.date && s.date.j && s.date.prec !== 'season');
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
    const selS = selId ? scById[selId] : null;
    if (selS) {
      const w = sceneWhen(selS);
      when.replaceChildren(h('b', null, `${selS.id} ${selS.title}`), h('span', null, w.main), w.sub ? h('span', { class: 'g' }, w.sub) : null);
    } else {
      when.replaceChildren(h('span', null, 'Oś czasu: od prologu (wiosna 1293) do połowy marca 1294. Kliknij kropkę, żeby przejść do sceny.'));
    }
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => renderStrip()).observe(strip);

  /* ---------- „Przeczytane do”: rozdział i scena ---------- */
  const chSel = $('#progress');
  CH.forEach((c) => chSel.append(h('option', { value: c.id }, c.num ? `${c.id} · ${c.title}` : 'Prolog')));
  function syncProgressUI() {
    const s = curScene(), list = chScenes(s.ch), k = list.findIndex((x) => x.id === s.id) + 1;
    chSel.value = s.ch;
    $('#sc-count').textContent = `${k}/${list.length}`;
    const step = $('#sc-step');
    step.title = `Przeczytane do sceny ${s.id}${s.incipit ? `, która zaczyna się: „${s.incipit}”` : ''}`;
    $('#sc-minus').disabled = state.upto === 0;
    $('#sc-plus').disabled = allRead();
  }
  function setUpto(idx, opts = {}) {
    const before = new Set(visScenes().map((s) => s.id));
    state.upto = clamp(idx, 0, SC.length - 1);
    store.set('upto', SC[state.upto].id);
    state.fresh = new Set(visScenes().map((s) => s.id).filter((id) => !before.has(id)));
    if (state.sel && state.sel.type === 'scene' && !visible(scById[state.sel.id])) state.sel = null;
    if (state.sel && state.sel.type === 'place' && !known(state.sel.id)) state.sel = null;
    if (state.plan && !planOpen(state.plan)) setPlan(null);
    if (state.person && !visScenes().some((s) => (s.chars || []).includes(state.person))) state.person = null;
    syncProgressUI();
    if (opts.select) selectScene(SC[state.upto].id); else renderAll();
    setTimeout(() => { state.fresh.clear(); }, 2000);
  }
  chSel.addEventListener('change', () => setUpto(lastOf(chSel.value)));
  $('#sc-minus').addEventListener('click', () => setUpto(state.upto - 1));
  $('#sc-plus').addEventListener('click', () => setUpto(state.upto + 1));

  /* ---------- strona powitalna ---------- */
  const intro = $('#intro');
  let introPickCh = null;
  function renderIntroPick() {
    const cur = introPickCh || curScene().ch;
    $('#intro-pick').replaceChildren(...CH.map((c) => h('button', {
      type: 'button', class: 'pick-btn', 'aria-pressed': String(c.id === cur), title: c.num ? `Rozdział ${c.id}: ${c.title}` : 'Prolog',
      onclick: () => { introPickCh = c.id; renderIntroPick(); }
    }, c.num ? c.id : 'P')));
    const c = chByid[cur];
    $('#intro-chosen').textContent = !introPickCh ? `Teraz mapa pokazuje: ${readingLabel()}.`
      : c.num ? `Mapa pokaże wszystko do końca rozdziału ${c.id}, „${c.title}”.` : 'Mapa pokaże tylko prolog.';
  }
  function openIntro() {
    introPickCh = null; renderIntroPick();
    intro.hidden = false; document.body.classList.add('intro-open');
    $('.app').inert = true;
    const go = $('#intro-go'); if (go) go.focus({ preventScroll: true });
  }
  function closeIntro() {
    intro.hidden = true; document.body.classList.remove('intro-open');
    $('.app').inert = false;
    if (location.hash === '#wstep') setHash('');
    store.set('welcomed', true);
    if (introPickCh && lastOf(introPickCh) !== state.upto) setUpto(lastOf(introPickCh));
  }
  $('#intro-go').addEventListener('click', closeIntro);
  $('#intro-close').addEventListener('click', () => { introPickCh = null; closeIntro(); });
  $('#brand').addEventListener('click', openIntro);
  $('#intro-about').addEventListener('click', () => { closeIntro(); showAbout(); });
  intro.addEventListener('keydown', (e) => { if (e.key === 'Escape') { introPickCh = null; closeIntro(); } });
  intro.addEventListener('click', (e) => { if (e.target === intro) { introPickCh = null; closeIntro(); } });

  /* ---------- zdarzenia UI ---------- */
  $('#sheets').addEventListener('click', (e) => { const b = e.target.closest('button[data-sheet]'); if (b) flyToSheet(b.dataset.sheet); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { state.tab = b.dataset.tab; renderPanel(); } });
  $('#prev').addEventListener('click', () => stepScene(-1));
  $('#next').addEventListener('click', () => stepScene(1));
  document.addEventListener('keydown', (e) => {
    if (!intro.hidden) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight' && !e.altKey) { stepScene(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && !e.altKey) { stepScene(-1); e.preventDefault(); }
    if (e.key === 'Escape') { hideGloss(); }
  }, true);

  function renderAll() {
    renderMarkers();
    renderPanel();
    renderStrip();
    syncSheetButtons();
    peek();
  }

  /* ---------- start ---------- */
  syncProgressUI();
  map.fitBounds(bounds('slask'), { padding: [8, 8] });
  updateSheets(map.getZoom());
  map.getContainer().classList.toggle('z-low', map.getZoom() < 9.3);
  lastLevel = geoLevel();
  renderAll();
  // adres z dopiskiem: #IX.3 (scena), #katedra (miejsce), #do-IX (lektura do końca rozdziału IX), #wstep (strona powitalna)
  function applyHash() {
    let hash = '';
    try { hash = decodeURIComponent((location.hash || '').slice(1)); } catch (e) { return false; }
    const doCh = /^do-([IVXL]+|P)$/.exec(hash);
    if (doCh && Object.prototype.hasOwnProperty.call(chByid, doCh[1])) {
      if (!intro.hidden) { introPickCh = null; closeIntro(); }
      store.set('welcomed', true);
      setUpto(Math.max(state.upto, lastOf(doCh[1])));
      setHash('');
      return true;
    }
    if (hash === 'wstep') { openIntro(); return true; }
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    if (own(scById, hash)) selectScene(hash);
    else if (own(P, hash)) selectPlace(hash, { fly: true });
    return false;
  }
  window.addEventListener('hashchange', applyHash);
  if (!applyHash() && !store.get('welcomed', false)) openIntro();
})();
