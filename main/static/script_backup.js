// static/main/script.js
(() => {
  'use strict';

  // ---------- 유틸 ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, wait=150) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

  // ---------- 지도 ----------
  const map = L.map('map', { center:[36.5,127.8], zoom:10, preferCanvas:true });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

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

  // ---------- 체크박스 값 수집 ----------
  const getCheckedVals = (sel) => $$(sel).filter(el=>el.checked).map(el=>el.value);

  // ---------- 레이어 핸들 ----------
  let vgJm = null;    // 지목(파랑)
  let vgOwn = null;   // 소유자(초록)
  let vgYongdo = null, vgRoad = null, vgJimok = null;

  // ---------- 쿼리스트링 생성 ----------
  const qs = (pairs) => {
    const parts = [];
    Object.entries(pairs).forEach(([k, vals]) => (vals||[]).forEach(v => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)));
    parts.push('_t=' + Date.now()); // 캐시 무효화
    return '?' + parts.join('&');
  };

  // ---------- 지목(파랑) 레이어 로딩 ----------
  function refreshJm() {
    const jm = getCheckedVals('#grp-jimok input.jm');
    if (vgJm && map.hasLayer(vgJm)) { map.removeLayer(vgJm); vgJm = null; }
    if (!jm.length) return;

    vgJm = L.vectorGrid.protobuf(`/tiles/owner/{z}/{x}/{y}.pbf${qs({ jm })}`, {
      maxNativeZoom: 22,
      interactive: true,
      vectorTileLayerStyles: {
        owner: { fill:true, fillOpacity:0.2, weight:0.8, color:'#2563eb' } // 파랑
      }
    }).addTo(map);

    bindHoverTooltip(vgJm);
  }

  // ---------- 소유자(초록) 레이어 로딩 ----------
  function refreshOwn() {
    const own = getCheckedVals('#grp-owner input.own');
    if (vgOwn && map.hasLayer(vgOwn)) { map.removeLayer(vgOwn); vgOwn = null; }
    if (!own.length) return;

    vgOwn = L.vectorGrid.protobuf(`/tiles/owner/{z}/{x}/{y}.pbf${qs({ own })}`, {
      maxNativeZoom: 22,
      interactive: true,
      vectorTileLayerStyles: {
        owner: { fill:true, fillOpacity:0.25, weight:0.8, color:'#16a34a' } // 초록
      }
    }).addTo(map);

    bindHoverTooltip(vgOwn);
  }

  // ---------- 기타 토글 레이어(그대로 유지) ----------
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

  // 체크박스: 켜면 추가 / 끄면 제거
  $('#chk-road')?.addEventListener('change', e => e.target.checked ? addRoad()  : removeIf('vgRoad'));
  $('#chk-yongdo')?.addEventListener('change', e => e.target.checked ? addYongdo(): removeIf('vgYongdo'));
  $('#chk-jimok')?.addEventListener('change', e => e.target.checked ? addJimok() : removeIf('vgJimok'));

  // ---------- 필터 이벤트(디바운스) ----------
  const debJm  = debounce(refreshJm, 150);
  const debOwn = debounce(refreshOwn, 150);
  $$('#grp-jimok input.jm').forEach(el => el.addEventListener('change', debJm));
  $$('#grp-owner input.own').forEach(el => el.addEventListener('change', debOwn));

  // (참고) moveend에 대한 재로딩은 불필요. VectorGrid가 자동 요청.
})();
