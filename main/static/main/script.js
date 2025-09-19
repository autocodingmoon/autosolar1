// static/main/script.js
// Auto Solar – Leaflet + 필터 + GeoJSON 로딩
(() => {
  'use strict';

  // ---------- 공통 유틸 ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, wait = 250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };
  const getCheckedValues = (selector) => $$(selector).filter(el => el.checked).map(el => el.value);
  const getBboxString = (map) => {
    const b = map.getBounds();
    return [b.getWest().toFixed(6), b.getSouth().toFixed(6), b.getEast().toFixed(6), b.getNorth().toFixed(6)].join(',');
  };

  // ---------- 지도 초기화 ----------
  const map = L.map('map', { center: [36.5, 127.8], zoom: 10, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
  }).addTo(map);

  // ---------- 패널 토글 ----------
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-target');
      const panel = document.getElementById(id);
      if (!panel) return;
      const open = panel.classList.toggle('active');
      if (open) $$('.panel').forEach(p => p !== panel && p.classList.remove('active'));
    });
  });

  // ---------- 검색(Vworld 프록시) ----------
  const addrInput = $('#addr-input');
  const btnSearch = $('#btn-search');
  let searchMarker = null;

  async function geocodeAndMove() {
    const q = addrInput?.value?.trim();
    if (!q) return;
    try {
      const res = await fetch(`/api/geocode/?q=${encodeURIComponent(q)}&type=ROAD`);
      if (!res.ok) {
        console.error('[geocode] http', res.status, await res.text().catch(() => ''));
        alert('주소 검색 실패(HTTP ' + res.status + ')');
        return;
      }
      const j = await res.json();
      const pt = j?.response?.result?.point;
      if (j?.status !== 'OK' || !pt) { alert('좌표를 찾지 못했습니다.'); return; }
      const lat = Number(pt.y), lon = Number(pt.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return alert('좌표 형식 오류');
      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 15);
    } catch (err) {
      console.error('[geocode] error', err);
      alert('주소 검색 중 오류');
    }
  }
  if (btnSearch) btnSearch.addEventListener('click', geocodeAndMove);
  if (addrInput) addrInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') geocodeAndMove(); });

  // ---------- 레이어들 ----------
  const styleLine = { weight: 1, opacity: 0.8 };
  const stylePoly = { weight: 0.8, opacity: 0.7, fillOpacity: 0.15 };

  let roadLayer  = L.geoJSON(null, { style: styleLine });
  let yongdoLayer = L.geoJSON(null, { style: stylePoly });

  // 소유정보(지목/소유자)
  const jimokColor = (jm) => {
    switch (jm) {
      case '전': return '#1f77b4';
      case '답': return '#2ca02c';
      case '과수원': return '#ff7f0e';
      case '잡종지': return '#9467bd';
      case '목장용지': return '#8c564b';
      case '염전': return '#e377c2';
      case '양어장': return '#7f7f7f';
      default: return '#3182bd';
    }
  };
  let ownerLayer = L.geoJSON(null, {
    style: (f) => ({ ...stylePoly, color: jimokColor(f?.properties?.a20) }),
    onEachFeature: (f, layer) => {
      const p = f?.properties || {};
      layer.bindPopup(
        `
        <div style="font-size:12px;line-height:1.4">
          <div><b>지목</b>: ${p.a20 ?? ''}</div>
          <div><b>소유자</b>: ${p.a8 ?? ''}</div>
          <div><b>gid</b>: ${p.gid ?? ''}</div>
        </div>
        `.trim()
      );
    }
  });

  // ✅ 새로 추가: jimok(기타) 레이어 (붉은색 폴리곤)
  const styleJimok = { color: '#ff0000', weight: 1.2, opacity: 0.95, fillOpacity: 0.15 };
  let jimokLayer = L.geoJSON(null, { style: styleJimok });

  // AbortControllers
  let ctlRoad = null, ctlYongdo = null, ctlOwner = null, ctlJimok = null;

  // ---------- 로더들 ----------
  async function loadRoad() {
    if (!$('#chk-road')?.checked) { if (map.hasLayer(roadLayer)) map.removeLayer(roadLayer); return; }
    if (ctlRoad) ctlRoad.abort(); ctlRoad = new AbortController();
    const q = new URLSearchParams({ bbox: getBboxString(map) });
    try {
      const res = await fetch(`/geojson/road?${q.toString()}`, { signal: ctlRoad.signal });
      if (!res.ok) return console.error('[road] http', res.status);
      const gj = await res.json();
      if (map.hasLayer(roadLayer)) map.removeLayer(roadLayer);
      roadLayer = L.geoJSON(gj, { style: styleLine }).addTo(map);
    } catch (e) { if (e.name !== 'AbortError') console.error('[road]', e); }
  }

  async function loadYongdo() {
    if (!$('#chk-yongdo')?.checked) { if (map.hasLayer(yongdoLayer)) map.removeLayer(yongdoLayer); return; }
    if (ctlYongdo) ctlYongdo.abort(); ctlYongdo = new AbortController();
    const q = new URLSearchParams({ bbox: getBboxString(map) });
    try {
      const res = await fetch(`/geojson/yongdo?${q.toString()}`, { signal: ctlYongdo.signal });
      if (!res.ok) return console.error('[yongdo] http', res.status);
      const gj = await res.json();
      if (map.hasLayer(yongdoLayer)) map.removeLayer(yongdoLayer);
      yongdoLayer = L.geoJSON(gj, { style: stylePoly }).addTo(map);
    } catch (e) { if (e.name !== 'AbortError') console.error('[yongdo]', e); }
  }

  async function loadOwner() {
    if (ctlOwner) ctlOwner.abort(); ctlOwner = new AbortController();
    const jmArray = getCheckedValues('#grp-jimok input.jm');
    const ownArray = getCheckedValues('#grp-owner input.own');
    const q = new URLSearchParams({ bbox: getBboxString(map) });
    jmArray.forEach(v => q.append('jm', v));
    ownArray.forEach(v => q.append('own', v));
    try {
      const res = await fetch(`/geojson/owner?${q.toString()}`, { signal: ctlOwner.signal });
      const payload = await res.json().catch(() => null);
      if (!res.ok) return console.error('[owner] http', res.status, payload?.error);
      if (map.hasLayer(ownerLayer)) map.removeLayer(ownerLayer);
      ownerLayer = L.geoJSON(payload, {
        style: (f) => ({ ...stylePoly, color: jimokColor(f?.properties?.a20) }),
        onEachFeature: (f, layer) => {
          const p = f?.properties || {};
          layer.bindPopup(
            `
            <div style="font-size:12px;line-height:1.4">
              <div><b>지목</b>: ${p.a20 ?? ''}</div>
              <div><b>소유자</b>: ${p.a8 ?? ''}</div>
              <div><b>gid</b>: ${p.gid ?? ''}</div>
            </div>
            `.trim()
          );
        }
      }).addTo(map);
    } catch (e) { if (e.name !== 'AbortError') console.error('[owner]', e); }
  }

  // ✅ 새로 추가: jimok(기타) 로더
  async function loadJimok() {
    const chk = $('#chk-jimok');
    if (!chk || !chk.checked) {
      if (map.hasLayer(jimokLayer)) map.removeLayer(jimokLayer);
      return;
    }
    if (ctlJimok) ctlJimok.abort(); ctlJimok = new AbortController();
    const q = new URLSearchParams({ bbox: getBboxString(map) });
    try {
      const res = await fetch(`/geojson/jimok?${q.toString()}`, { signal: ctlJimok.signal });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('[jimok] http', res.status, t);
        return;
      }
      const gj = await res.json();
      if (map.hasLayer(jimokLayer)) map.removeLayer(jimokLayer);
      jimokLayer = L.geoJSON(gj, { style: styleJimok }).addTo(map);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('[jimok] fetch error', e);
    }
  }

  // ---------- 이벤트 바인딩 ----------
  $('#chk-road')?.addEventListener('change', loadRoad);
  $('#chk-yongdo')?.addEventListener('change', loadYongdo);
  $('#chk-jimok')?.addEventListener('change', loadJimok); // ✅ 추가

  $$('#grp-jimok input.jm').forEach(el => el.addEventListener('change', debounce(loadOwner, 150)));
  $$('#grp-owner input.own').forEach(el => el.addEventListener('change', debounce(loadOwner, 150)));

  map.on('moveend', debounce(() => {
    if ($('#chk-road')?.checked)  loadRoad();
    if ($('#chk-yongdo')?.checked) loadYongdo();
    if ($('#chk-jimok')?.checked)  loadJimok();  // ✅ 추가
    loadOwner();
  }, 250));

  // 최초 1회 기본 로드
  loadOwner();
})();
