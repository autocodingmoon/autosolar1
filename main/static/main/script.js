// static/main/script.js
(() => {
  'use strict';

  // ---------- 유틸 ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, wait=150) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

  // ---------- 지도 ----------
  const map = L.map('map', { center:[36.5,127.8], zoom:10, preferCanvas:true });

  // ====== 베이스맵 소스 & 선택 상태 ======
  const VWORLD_KEY = window.VWORLD_KEY || ""; // map.html에서 주입됨

  // OSM 일반 (EPSG:3857 XYZ)
  const makeOsmBase = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  });

  // VWorld 일반(Base) WMTS (EPSG:3857 XYZ)
  const makeVworldBase = () => L.tileLayer(
    `/vwtiles/Base/{z}/{y}/{x}.png`,
    { maxZoom: 19, attribution: '&copy; VWorld', crossOrigin: true }
  );

  // VWorld 위성(Satellite) WMTS (EPSG:3857 XYZ)
  const makeVworldSat = () => L.tileLayer(
    `/vwtiles/Satellite/{z}/{y}/{x}.jpeg`,
    { maxZoom: 19, attribution: '&copy; VWorld', crossOrigin: true }
  );

  // 모드: 'OSM_BASE' | 'VW_BASE' | 'VW_SAT'
  let basemapMode = 'OSM_BASE';
  let baseLayer = null;

  function applyBasemap() {
    let next;
    if (basemapMode === 'OSM_BASE') next = makeOsmBase();
    else if (basemapMode === 'VW_BASE') next = makeVworldBase();
    else next = makeVworldSat(); // 'VW_SAT'

    if (baseLayer && map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
    baseLayer = next.addTo(map);
  }

  // ---------- 좌상단 미니 컨트롤 ----------
  const BasemapControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function() {
      const div = L.DomUtil.create('div', 'bm-mini');
      Object.assign(div.style, {
        background:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px',
        padding:'6px', boxShadow:'0 2px 6px rgba(0,0,0,.08)', fontSize:'12px'
      });

      const lblStyle = 'display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;cursor:pointer;';

      div.innerHTML = `
        <div style="display:flex;gap:6px;">
          <label style="${lblStyle}">
            <input type="checkbox" id="bm-osm" checked> 일반(OSM)
          </label>
          <label style="${lblStyle}">
            <input type="checkbox" id="bm-vw-base"> 일반(VWorld)
          </label>
          <label style="${lblStyle}">
            <input type="checkbox" id="bm-vw-sat"> 위성(VWorld)
          </label>
        </div>
      `;

      L.DomEvent.disableClickPropagation(div);

      const $osm = $('#bm-osm', div);
      const $vwB = $('#bm-vw-base', div);
      const $vwS = $('#bm-vw-sat', div);

      if (!VWORLD_KEY) {
        $vwB.disabled = true; $vwS.disabled = true;
        $vwB.parentElement.style.opacity = '0.5';
        $vwS.parentElement.style.opacity = '0.5';
        $vwB.parentElement.title = 'VWorld 키가 필요합니다';
        $vwS.parentElement.title = 'VWorld 키가 필요합니다';
      }

      function setMode(mode) {
        basemapMode = mode;
        $osm.checked = (mode === 'OSM_BASE');
        $vwB.checked = (mode === 'VW_BASE');
        $vwS.checked = (mode === 'VW_SAT');
        applyBasemap();
      }

      $osm.addEventListener('change', e => {
        if (e.target.checked) setMode('OSM_BASE'); else $osm.checked = true;
      });
      $vwB.addEventListener('change', e => {
        if (e.target.checked) {
          if ($vwB.disabled) { $osm.checked = true; return; }
          setMode('VW_BASE');
        } else {
          if (!$vwS.checked) { $osm.checked = true; setMode('OSM_BASE'); }
        }
      });
      $vwS.addEventListener('change', e => {
        if (e.target.checked) {
          if ($vwS.disabled) { $osm.checked = true; return; }
          setMode('VW_SAT');
        } else {
          if (!$vwB.checked) { $osm.checked = true; setMode('OSM_BASE'); }
        }
      });

      return div;
    }
  });

  // 컨트롤 추가 + 오른쪽 배치
  const bmCtrl = new BasemapControl();
  map.addControl(bmCtrl);
  (function placeRightOfZoom() {
    const zoomNode = map.zoomControl && map.zoomControl.getContainer
      ? map.zoomControl.getContainer()
      : document.querySelector('.leaflet-control-zoom');
    const bmNode = bmCtrl.getContainer();
    if (zoomNode && zoomNode.parentNode && bmNode) {
      const corner = zoomNode.parentNode;
      corner.style.display = 'flex';
      corner.style.flexDirection = 'row';
      corner.style.alignItems = 'flex-start';
      corner.style.gap = '6px';
      if (zoomNode.nextSibling !== bmNode) {
        corner.insertBefore(bmNode, zoomNode.nextSibling);
      }
    }
  })();

  // 기본 베이스맵
  applyBasemap();

  // ---------- 사이드 패널 토글 ----------
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target;
      const panel = document.getElementById(id);
      if (!panel) return;
      const open = panel.classList.toggle('active');
      if (open) $$('.panel').forEach(p => p!==panel && p.classList.remove('active'));
    });
  });

  // ---------- 주소 검색 ----------
  const addrInput = $('#addr-input');
  const btnSearch = $('#btn-search');
  let searchMarker = null;

  async function geocodeAndMove(){
    const q = addrInput?.value?.trim();
    if (!q) return;
    try{
      const res = await fetch(`/api/geocode/?q=${encodeURIComponent(q)}&type=ROAD`);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const j = await res.json();
      const pt = j?.response?.result?.point;
      if(!pt) return alert('좌표를 찾지 못했습니다.');
      const lat = Number(pt.y), lon = Number(pt.x);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return alert('좌표 형식 오류');
      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([lat,lon]).addTo(map);
      map.setView([lat,lon], 15);
    }catch(e){ console.error('[geocode]', e); alert('주소 검색 실패'); }
  }
  btnSearch?.addEventListener('click', geocodeAndMove);
  addrInput?.addEventListener('keydown', e => { if(e.key==='Enter') geocodeAndMove(); });

  // ---------- 공통: hover 툴팁 ----------
  function bindHoverTooltip(vg) {
    if (!vg) return;
    let tip;
    vg.on('mouseover', e => {
      const p = e.layer && e.layer.properties ? e.layer.properties : {};
      const jibun = [p.a2, p.a5].filter(Boolean).join(' ');
      const html = `
        <div style="font-size:12px; line-height:1.4;">
          <div><b>지번</b>: ${jibun || '-'}</div>
          <div><b>소유자</b>: ${p.a8 || '-'}</div>
          <div><b>지목</b>: ${p.a20 || '-'}</div>
        </div>`;
      tip = L.tooltip({ permanent:false, direction:'top', offset:[0,-8], opacity:0.95 })
              .setLatLng(e.latlng).setContent(html).addTo(map);
      map._container.style.cursor = 'pointer';
    });
    vg.on('mousemove', e => { if (tip) tip.setLatLng(e.latlng); });
    vg.on('mouseout', () => {
      if (tip) { map.removeLayer(tip); tip = null; }
      map._container.style.cursor = '';
    });
  }

  // ---------- 체크값 수집 ----------
  const getCheckedVals = (sel) => $$(sel).filter(el=>el.checked).map(el=>el.value);

  // ---------- 레이어 핸들 ----------
  let vgJm = null;    // 지목(파랑)
  let vgOwn = null;   // 소유자(초록)
  let vgYongdo = null, vgRoad = null, vgJimok = null;

  // ---------- 쿼리스트링 ----------
  const qs = (pairs) => {
    const parts = [];
    Object.entries(pairs).forEach(([k, vals]) => (Array.isArray(vals)?vals:[vals]).filter(Boolean).forEach(v => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)));
    parts.push('_t=' + Date.now()); // 캐시 무효화
    return '?' + parts.join('&');
  };

  // ---------- 지목(파랑) ----------
  function refreshJm() {
    const jm = getCheckedVals('#grp-jimok input.jm');
    if (vgJm && map.hasLayer(vgJm)) { map.removeLayer(vgJm); vgJm = null; }
    if (!jm.length) return;

    vgJm = L.vectorGrid.protobuf(`/tiles/owner/{z}/{x}/{y}.pbf${qs({ jm })}`, {
      maxNativeZoom: 22,
      interactive: true,
      vectorTileLayerStyles: {
        owner: { fill:true, fillOpacity:0.2, weight:0.8, color:'#2563eb' }
      }
    }).addTo(map);

    bindHoverTooltip(vgJm);
  }

  // ---------- 소유자(초록) ----------
  function refreshOwn() {
    const own = getCheckedVals('#grp-owner input.own');
    if (vgOwn && map.hasLayer(vgOwn)) { map.removeLayer(vgOwn); vgOwn = null; }
    if (!own.length) return;

    vgOwn = L.vectorGrid.protobuf(`/tiles/owner/{z}/{x}/{y}.pbf${qs({ own })}`, {
      maxNativeZoom: 22,
      interactive: true,
      vectorTileLayerStyles: {
        owner: { fill:true, fillOpacity:0.25, weight:0.8, color:'#16a34a' }
      }
    }).addTo(map);

    bindHoverTooltip(vgOwn);
  }

  // ---------- 기타 토글 레이어 ----------
  function addYongdo(){
    vgYongdo = L.vectorGrid.protobuf(`/tiles/yongdo/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ yongdo:{ fill:true, fillOpacity:0.15, weight:0.6, color:'#a855f7' } }
    }).addTo(map);
  }
  function addRoad(){
    vgRoad = L.vectorGrid.protobuf(`/tiles/road/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ road:{ fill:false, weight:1.5, color:'#ef4444' } }
    }).addTo(map);
  }
  function addJimok(){
    vgJimok = L.vectorGrid.protobuf(`/tiles/jimok/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ jimok:{ fill:true, fillOpacity:0.15, weight:0.6, color:'#111111' } }
    }).addTo(map);
  }

  function removeIf(layerRefName){
    const ref = { vgJm, vgOwn, vgYongdo, vgRoad, vgJimok }[layerRefName];
    if (ref && map.hasLayer(ref)) map.removeLayer(ref);
    if (layerRefName==='vgJm') vgJm=null;
    if (layerRefName==='vgOwn') vgOwn=null;
    if (layerRefName==='vgYongdo') vgYongdo=null;
    if (layerRefName==='vgRoad') vgRoad=null;
    if (layerRefName==='vgJimok') vgJimok=null;
  }

  $('#chk-road')?.addEventListener('change', e => {
    if (e.target.checked) {
      addRoad();
      // 도로 레이어 켜질 때, 시각화 셰이드 UI 상태도 재동기화
      syncRoadSetbackUI();
      // 체크돼 있고, 이미 셰이드가 활성화 중이라면 표시
      if (roadSetbackEnabled && roadSetbackLayer) roadSetbackLayer.addTo(map);
    } else {
      removeIf('vgRoad');
      // 도로 끄면 셰이드도 숨김
      if (roadSetbackLayer && map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
    }
  });
  $('#chk-yongdo')?.addEventListener('change', e => e.target.checked ? addYongdo(): removeIf('vgYongdo'));
  $('#chk-jimok')?.addEventListener('change', e => e.target.checked ? addJimok() : removeIf('vgJimok'));

  const debJm  = debounce(refreshJm, 150);
  const debOwn = debounce(refreshOwn, 150);
  $$('#grp-jimok input.jm').forEach(el => el.addEventListener('change', debJm));
  $$('#grp-owner input.own').forEach(el => el.addEventListener('change', debOwn));

  // =====================================================================
  // [ROAD SETBACK GEOJSON] — 도로이격(시각) : GeoJSON을 "한 번만" 받아 캐시 후 토글
  // =====================================================================

  // 상태
  let roadSetbackLayer = null;       // 회색 셰이딩 레이어(GeoJSON)
  let roadSetbackLoaded = false;     // 한번이라도 로드했는지
  let roadSetbackEnabled = false;    // 체크박스 상태
  let roadSetbackLastDist = 50;      // 최초 로드 시 사용한 m값(표시용)

  // API 호출: 현재 지도 bbox + dist(m)로 GeoJSON 1회 로드
  async function loadRoadSetbackOnce(dist) {
    if (roadSetbackLoaded && roadSetbackLayer) return; // 이미 로드됨
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
    const url = `/geojson/road_setback${qs({ dist, bbox })}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const gj = await res.json();

    // 기존 레이어 제거
    if (roadSetbackLayer && map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);

    // 회색 셰이딩 스타일
    roadSetbackLayer = L.geoJSON(gj, {
      style: {
        color: '#666',       // 외곽선
        weight: 1,
        fillColor: '#999',   // 채움
        fillOpacity: 0.35
      }
    });

    roadSetbackLoaded = true;
    roadSetbackLastDist = dist;
  }

  // UI 삽입: "도로이격(시각)" 체크박스 + 거리 입력 + (옵션) 갱신 버튼
  function insertRoadSetbackUI() {
    const roadChk = document.getElementById('chk-road');
    if (!roadChk) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;';
    wrap.innerHTML = `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="chk-road-setback">
        <span>도로이격(시각)</span>
      </label>
      <input type="number" id="road-setback-m" min="1" step="1" value="50"
             style="width:90px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
      <span>m</span>
      <button id="btn-road-setback-reload"
              style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer;">
        갱신
      </button>
      <small id="road-setback-hint" style="color:#64748b;"></small>
    `;

    const labelEl = roadChk.closest('label');
    if (labelEl) labelEl.insertAdjacentElement('afterend', wrap);
    else (roadChk.parentElement || document.getElementById('sidebar'))?.appendChild(wrap);

    const cb = $('#chk-road-setback', wrap);
    const inp = $('#road-setback-m', wrap);
    const btn = $('#btn-road-setback-reload', wrap);
    const hint = $('#road-setback-hint', wrap);

    function setHint(text) { hint.textContent = text || ''; }

    // 토글 동작: 처음 켤 때 한 번 로드 → 이후엔 보이기/숨기기만
    cb.addEventListener('change', async () => {
      roadSetbackEnabled = cb.checked;

      if (!document.getElementById('chk-road')?.checked) {
        // 도로 레이어가 꺼져 있으면 켜달라고 안내
        cb.checked = false;
        roadSetbackEnabled = false;
        return alert('먼저 "도로" 레이어를 켜주세요.');
      }

      try {
        if (roadSetbackEnabled) {
          // 최초 ON에서만 서버 호출 (로드 안됐으면)
          if (!roadSetbackLoaded) {
            const dist = Math.max(1, parseInt(inp.value || '50', 10));
            setHint('불러오는 중…');
            await loadRoadSetbackOnce(dist);
            setHint(`로드 완료 (${roadSetbackLastDist}m 기준, 이후 토글은 재요청 없음)`);
          }
          if (roadSetbackLayer && !map.hasLayer(roadSetbackLayer)) {
            roadSetbackLayer.addTo(map);
          }
        } else {
          if (roadSetbackLayer && map.hasLayer(roadSetbackLayer)) {
            map.removeLayer(roadSetbackLayer);
          }
        }
      } catch (e) {
        console.error('[road setback]', e);
        alert('도로이격(시각) 로드에 실패했습니다.');
        setHint('');
        cb.checked = false;
        roadSetbackEnabled = false;
      }
    });

    // (옵션) 수동 갱신: 거리 값을 바꾸고 누르면 "한 번 더" 서버에서 새로 받아 업데이트
    btn.addEventListener('click', async () => {
      try {
        if (!document.getElementById('chk-road')?.checked) {
          return alert('먼저 "도로" 레이어를 켜주세요.');
        }
        const dist = Math.max(1, parseInt(inp.value || '50', 10));
        setHint('갱신 중…');
        // 새 거리로 재로딩(이때만 다시 요청)
        roadSetbackLoaded = false;
        await loadRoadSetbackOnce(dist);
        setHint(`로드 완료 (${roadSetbackLastDist}m 기준)`);
        // 켜져 있으면 즉시 갱신 반영
        if (roadSetbackEnabled && roadSetbackLayer) {
          // 기존 레이어 제거 후 새 레이어 추가
          if (map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
          roadSetbackLayer.addTo(map);
        }
      } catch (e) {
        console.error('[road setback reload]', e);
        alert('도로이격(시각) 갱신에 실패했습니다.');
        setHint('');
      }
    });

    // 도로 체크박스와 동기화(도로 꺼지면 비활성)
    function syncEnable() {
      const roadOn = document.getElementById('chk-road')?.checked;
      cb.disabled = !roadOn;
      inp.disabled = !roadOn;
      btn.disabled = !roadOn;
      if (!roadOn) {
        cb.checked = false;
        roadSetbackEnabled = false;
        if (roadSetbackLayer && map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
      }
    }
    document.getElementById('chk-road')?.addEventListener('change', syncEnable);
    window.syncRoadSetbackUI = syncEnable; // 위에서 호출하기 위해 노출
    syncEnable();
  }

  // DOM 준비 후 UI 삽입
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertRoadSetbackUI);
  } else {
    insertRoadSetbackUI();
  }

})();
