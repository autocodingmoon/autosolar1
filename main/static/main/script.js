(() => {
  'use strict';

  // ---------- 유틸 ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, wait=150) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

  // ---------- 지도 ----------
  const map = L.map('map', { center:[36.5,127.8], zoom:10, preferCanvas:true });

  // ====== 베이스맵 소스 ======
  const VWORLD_KEY = window.VWORLD_KEY || "";

  const makeOsmBase = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  });
  const makeVworldBase = () => L.tileLayer(`/vwtiles/Base/{z}/{y}/{x}.png`, {
    maxZoom: 19, attribution: '&copy; VWorld', crossOrigin:true
  });
  const makeVworldSat  = () => L.tileLayer(`/vwtiles/Satellite/{z}/{y}/{x}.jpeg`, {
    maxZoom: 19, attribution: '&copy; VWorld', crossOrigin:true
  });

  let basemapMode = 'OSM_BASE';
  let baseLayer = null;
  function applyBasemap() {
    let next;
    if (basemapMode === 'OSM_BASE') next = makeOsmBase();
    else if (basemapMode === 'VW_BASE') next = makeVworldBase();
    else next = makeVworldSat();

    if (baseLayer && map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
    baseLayer = next.addTo(map);
  }
  applyBasemap();

  // 상단 라디오 토글과 연동
  const bmRadios = $$('#basemap-mini input[name="bm"]');
  bmRadios.forEach(r => {
    if (!VWORLD_KEY && (r.value==='VW_BASE' || r.value==='VW_SAT')) {
      r.disabled = true;
      r.parentElement.style.opacity = 0.5;
      r.parentElement.title = 'VWorld 키가 필요합니다';
    }
    r.addEventListener('change', () => {
      if (!r.checked) return;
      basemapMode = r.value;
      applyBasemap();
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
      btnSearch.disabled = true; btnSearch.textContent = '검색중…';
      const res = await fetch(`/api/geocode/?q=${encodeURIComponent(q)}&type=ROAD`);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const j = await res.json();
      const pt = j?.response?.result?.point;
      if(!pt){ alert('좌표를 찾지 못했습니다.'); return; }
      const lat = Number(pt.y), lon = Number(pt.x);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) { alert('좌표 형식 오류'); return; }
      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([lat,lon]).addTo(map);
      map.setView([lat,lon], 15);
    }catch(e){
      console.error('[geocode]', e);
      alert('주소 검색 실패');
    }finally{
      btnSearch.disabled = false; btnSearch.textContent = '검색';
    }
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
  let vgJm = null, vgOwn = null, vgYongdo = null, vgRoad = null, vgJimok = null;
  let vgResi = null;
  let vgNonglim=null, vgNongupJin=null, vgJayeon=null, vgGaebal=null, vgNongupGiban=null;

  // GeoJSON 이격 레이어
  let roadSetbackLayer = null, roadSetbackLoaded = false, roadSetbackEnabled = false;
  let resiSetbackLayer = null, resiSetbackLoaded = false, resiSetbackEnabled = false;

  // ---------- 쿼리스트링 ----------
  const qs = (pairs) => {
    const parts = [];
    Object.entries(pairs).forEach(([k, vals]) => (Array.isArray(vals)?vals:[vals]).filter(Boolean).forEach(v => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)));
    parts.push('_t=' + Date.now());
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
      vectorTileLayerStyles:{ road:{ fill:false, weight:1.5, color:'#ef4444', opacity:1 } }
    }).addTo(map);
  }
  function addJimok(){
    vgJimok = L.vectorGrid.protobuf(`/tiles/jimok/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ jimok:{ fill:true, fillOpacity:0.15, weight:0.6, color:'#111111' } }
    }).addTo(map);
  }

  // 주거이격(MVT)
  function addResi(){
    vgResi = L.vectorGrid.protobuf(`/tiles/resi/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ resi:{ fill:true, fillOpacity:0.25, weight:0.8, color:'#1e3a8a' } }
    }).addTo(map);
  }

  // 정책 5종
  function addNonglim(){
    vgNonglim = L.vectorGrid.protobuf(`/tiles/nonglim/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ nonglim:{ fill:true, fillOpacity:0.20, weight:0.8, color:'#a3e635' } }
    }).addTo(map);
  }
  function addNongupJin(){
    vgNongupJin = L.vectorGrid.protobuf(`/tiles/nongupjinheung/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ nongupjinheung:{ fill:true, fillOpacity:0.20, weight:0.8, color:'#262627' } }
    }).addTo(map);
  }
  function addJayeon(){
    vgJayeon = L.vectorGrid.protobuf(`/tiles/jayeonnogji/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ jayeonnogji:{ fill:true, fillOpacity:0.20, weight:0.8, color:'#22c55e' } }
    }).addTo(map);
  }
  function addGaebal(){
    vgGaebal = L.vectorGrid.protobuf(`/tiles/gaebaljingheung/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ gaebaljingheung:{ fill:true, fillOpacity:0.20, weight:0.8, color:'#f97316' } }
    }).addTo(map);
  }
  function addNongupGiban(){
    vgNongupGiban = L.vectorGrid.protobuf(`/tiles/nongupseisangiban/{z}/{x}/{y}.pbf`, {
      maxNativeZoom:22, interactive:false,
      vectorTileLayerStyles:{ nongupseisangiban:{ fill:true, fillOpacity:0.20, weight:0.8, color:'#eab308' } }
    }).addTo(map);
  }

  function removeIf(layerRefName){
    const ref = { vgJm, vgOwn, vgYongdo, vgRoad, vgJimok, vgResi, vgNonglim, vgNongupJin, vgJayeon, vgGaebal, vgNongupGiban}[layerRefName];
    if (ref && map.hasLayer(ref)) map.removeLayer(ref);
    if (layerRefName==='vgJm') vgJm=null;
    if (layerRefName==='vgOwn') vgOwn=null;
    if (layerRefName==='vgYongdo') vgYongdo=null;
    if (layerRefName==='vgRoad') vgRoad=null;
    if (layerRefName==='vgJimok') vgJimok=null;
    if (layerRefName==='vgResi') vgResi=null;
    if (layerRefName==='vgNonglim') vgNonglim=null;
    if (layerRefName==='vgNongupJin') vgNongupJin=null;
    if (layerRefName==='vgJayeon') vgJayeon=null;
    if (layerRefName==='vgGaebal') vgGaebal=null;
    if (layerRefName==='vgNongupGiban') vgNongupGiban=null;
  }

  // 토글(스위치) 바인딩
  $('#chk-road')?.addEventListener('change', e => {
    if (e.target.checked) {
      addRoad();
      syncRoadSetbackUI?.();
      if (roadSetbackEnabled && roadSetbackLayer) roadSetbackLayer.addTo(map);
      // 투명도 초기 적용
      applyVectorOpacity(vgRoad, 'road', Number($('#opacity-road')?.value || 1));
    } else {
      removeIf('vgRoad');
      if (roadSetbackLayer && map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
    }
  });
  $('#chk-resi')?.addEventListener('change', e => {
    if (e.target.checked) {
      addResi();
      applyVectorOpacity(vgResi, 'resi', Number($('#opacity-resi')?.value || 0.25));
    } else {
      removeIf('vgResi');
      if (resiSetbackLayer && map.hasLayer(resiSetbackLayer)) map.removeLayer(resiSetbackLayer);
    }
  });
  $('#chk-nonglim')?.addEventListener('change', e => e.target.checked ? (addNonglim(), applyVectorOpacity(vgNonglim,'nonglim', Number($('#opacity-nonglim').value))) : removeIf('vgNonglim'));
  $('#chk-nongupjin')?.addEventListener('change', e => e.target.checked ? (addNongupJin(), applyVectorOpacity(vgNongupJin,'nongupjinheung', Number($('#opacity-nongupjin').value))) : removeIf('vgNongupJin'));
  $('#chk-jayeon')?.addEventListener('change', e => e.target.checked ? (addJayeon(), applyVectorOpacity(vgJayeon,'jayeonnogji', Number($('#opacity-jayeon').value))) : removeIf('vgJayeon'));
  $('#chk-gaebal')?.addEventListener('change', e => e.target.checked ? (addGaebal(), applyVectorOpacity(vgGaebal,'gaebaljingheung', Number($('#opacity-gaebal').value))) : removeIf('vgGaebal'));
  $('#chk-nongupgiban')?.addEventListener('change', e => e.target.checked ? (addNongupGiban(), applyVectorOpacity(vgNongupGiban,'nongupseisangiban', Number($('#opacity-nongupgiban').value))) : removeIf('vgNongupGiban'));

  // 지목/소유자 필터
  const debJm  = debounce(refreshJm, 150);
  const debOwn = debounce(refreshOwn, 150);
  $$('#grp-jimok input.jm').forEach(el => el.addEventListener('change', debJm));
  $$('#grp-owner input.own').forEach(el => el.addEventListener('change', debOwn));

  // =====================================================================
  // [ROAD SETBACK GEOJSON] — 기존 로직 유지 (UI만 상단 카드로 이동)
  // =====================================================================
  let roadSetbackLastDist = 50;

  async function loadRoadSetbackOnce(dist) {
    if (roadSetbackLoaded && roadSetbackLayer) return;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
    const url = `/geojson/road_setback${qs({ dist, bbox })}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const gj = await res.json();
    if (roadSetbackLayer && map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
    roadSetbackLayer = L.geoJSON(gj, { style:{ color:'#666', weight:1, fillColor:'#999', fillOpacity:Number($('#opacity-road').value||0.35) } });
    roadSetbackLoaded = true;
    roadSetbackLastDist = dist;
  }

  function syncRoadSetbackUI(){
    const roadOn = $('#chk-road')?.checked;
    $('#road-setback-m').disabled = !roadOn;
    $('#btn-road-setback-reload').disabled = !roadOn;
    if (!roadOn && roadSetbackLayer && map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
  }

  $('#btn-road-setback-reload')?.addEventListener('click', async () => {
    try{
      if (!$('#chk-road')?.checked) return alert('먼저 "도로이격"을 켜주세요.');
      const dist = Math.max(1, parseInt($('#road-setback-m').value||'50',10));
      $('#road-setback-hint').textContent = '갱신 중…';
      roadSetbackLoaded = false;
      await loadRoadSetbackOnce(dist);
      $('#road-setback-hint').textContent = `로드 완료 (${roadSetbackLastDist}m)`;
      if (roadSetbackEnabled && roadSetbackLayer) {
        if (map.hasLayer(roadSetbackLayer)) map.removeLayer(roadSetbackLayer);
        roadSetbackLayer.addTo(map);
      }
    }catch(e){ console.error(e); alert('도로이격(시각) 갱신 실패'); $('#road-setback-hint').textContent=''; }
  });

  // 체크박스 연동
  $('#chk-road')?.addEventListener('change', e => {
    roadSetbackEnabled = e.target.checked && $('#chk-road')?.checked;
    syncRoadSetbackUI();
  });

  // =====================================================================
  // [RESI SETBACK GEOJSON] — 기존 로직 유지
  // =====================================================================
  let resiSetbackLastDist = 50;

  async function loadResiSetbackOnce(dist) {
    if (resiSetbackLoaded && resiSetbackLayer) return;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
    const url = `/geojson/resi_setback${qs({ dist, bbox })}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const gj = await res.json();
    if (resiSetbackLayer && map.hasLayer(resiSetbackLayer)) map.removeLayer(resiSetbackLayer);
    resiSetbackLayer = L.geoJSON(gj, { style:{ color:'#666', weight:1, fillColor:'#999', fillOpacity:Number($('#opacity-resi').value||0.25) } });
    resiSetbackLoaded = true;
    resiSetbackLastDist = dist;
  }

  $('#btn-resi-setback-reload')?.addEventListener('click', async () => {
    try{
      if (!$('#chk-resi')?.checked) return alert('먼저 "주거이격"을 켜주세요.');
      const dist = Math.max(1, parseInt($('#resi-setback-m').value||'50',10));
      $('#resi-setback-hint').textContent = '갱신 중…';
      resiSetbackLoaded = false;
      await loadResiSetbackOnce(dist);
      $('#resi-setback-hint').textContent = `로드 완료 (${resiSetbackLastDist}m)`;
      if (resiSetbackEnabled && resiSetbackLayer) {
        if (map.hasLayer(resiSetbackLayer)) map.removeLayer(resiSetbackLayer);
        resiSetbackLayer.addTo(map);
      }
    }catch(e){ console.error(e); alert('주거이격(제척) 갱신 실패'); $('#resi-setback-hint').textContent=''; }
  });

  $('#chk-resi')?.addEventListener('change', e => {
    resiSetbackEnabled = e.target.checked && $('#chk-resi')?.checked;
  });

  // ---------- 투명도 슬라이더 바인딩 ----------
  function pct(v){ return Math.round(Number(v)*100) + '%'; }

  function applyVectorOpacity(vg, layerId, v){
    // VectorGrid 레이어 스타일 갱신
    try { vg?.setFeatureStyle?.(layerId, { fillOpacity:v, opacity:v }); } catch {}
  }
  function applyGeoJsonOpacity(layer, v){
    try { layer?.setStyle?.({ fillOpacity:v, opacity:v }); } catch {}
  }

  const bindOpacity = (sliderId, valueLabelId, getTargets) => {
    const s = $(sliderId), label = $(valueLabelId);
    if (!s) return;
    const apply = () => {
      const v = Number(s.value);
      if (label) label.textContent = pct(v);
      const targets = getTargets?.() || [];
      targets.forEach(t => {
        if (t.type === 'vector' ) applyVectorOpacity(t.ref, t.layerId, v);
        if (t.type === 'geojson') applyGeoJsonOpacity(t.ref, v);
      });
    };
    s.addEventListener('input', apply);
    apply(); // 초기 표시값
  };

  // 레이어별 슬라이더-타겟 매핑
  bindOpacity('#opacity-road', '#opacity-road-val', () => [
    { type:'vector', ref:vgRoad, layerId:'road' },
    { type:'geojson', ref:roadSetbackLayer }
  ]);
  bindOpacity('#opacity-resi', '#opacity-resi-val', () => [
    { type:'vector', ref:vgResi, layerId:'resi' },
    { type:'geojson', ref:resiSetbackLayer }
  ]);
  bindOpacity('#opacity-nonglim', '#opacity-nonglim-val', () => [{ type:'vector', ref:vgNonglim, layerId:'nonglim' }]);
  bindOpacity('#opacity-nongupjin', '#opacity-nongupjin-val', () => [{ type:'vector', ref:vgNongupJin, layerId:'nongupjinheung' }]);
  bindOpacity('#opacity-jayeon', '#opacity-jayeon-val', () => [{ type:'vector', ref:vgJayeon, layerId:'jayeonnogji' }]);
  bindOpacity('#opacity-gaebal', '#opacity-gaebal-val', () => [{ type:'vector', ref:vgGaebal, layerId:'gaebaljingheung' }]);
  bindOpacity('#opacity-nongupgiban', '#opacity-nongupgiban-val', () => [{ type:'vector', ref:vgNongupGiban, layerId:'nongupseisangiban' }]);

  // ---------- 아코디언 ----------
  $$('.acc-header').forEach(btn => {
    const body = $(btn.dataset.acc);
    if (!body) return;
    btn.addEventListener('click', () => {
      body.classList.toggle('hidden');
    });
  });

})();
