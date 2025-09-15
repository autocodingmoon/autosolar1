// script.js
(() => {
  // 이미 초기화된 Leaflet 인스턴스가 있으면 안전하게 제거 (중복 실행 대비)
  if (window.__leaflet_map__) {
    try { window.__leaflet_map__.remove(); } catch (_) {}
  }
  const mapEl = document.getElementById('map');
  if (!mapEl) { console.error('#map element not found'); return; }
  if (mapEl._leaflet_id) {
    try { mapEl._leaflet_id = null; mapEl.innerHTML = ''; } catch (_) {}
  }

  // 1) 지도 초기화
  const mapCenter = { lat: 37.5665, lng: 126.9780 }; // 서울 시청 근처
  const map = L.map('map', { zoomControl: false }).setView([mapCenter.lat, mapCenter.lng], 13);
  window.__leaflet_map__ = map; // 전역 보관(다음 실행 때 remove용)
  L.control.zoom({ position: 'topright' }).addTo(map);

  // 오버레이 전용 pane(타일 위로 확실히 올림)
  map.createPane('vec');
  map.getPane('vec').style.zIndex = 650; // tile(200) < overlay(400) < vec(650)

  // 2) Vworld 타일 레이어 (settings.py → map.html → window.VWORLD_KEY 사용)
  const vkey = (typeof window !== 'undefined' && window.VWORLD_KEY) ? window.VWORLD_KEY : "";

  let vBase, vSatellite, vHybrid;
  if (vkey) {
    vBase = L.tileLayer(
      `https://api.vworld.kr/req/wmts/1.0.0/${vkey}/Base/{z}/{y}/{x}.png`,
      { maxZoom: 19, attribution: "&copy; Vworld" }
    ).addTo(map);
    vSatellite = L.tileLayer(
      `https://api.vworld.kr/req/wmts/1.0.0/${vkey}/Satellite/{z}/{y}/{x}.jpeg`,
      { maxZoom: 19, attribution: "&copy; Vworld" }
    );
    vHybrid = L.tileLayer(
      `https://api.vworld.kr/req/wmts/1.0.0/${vkey}/Hybrid/{z}/{y}/{x}.png`,
      { maxZoom: 19, attribution: "&copy; Vworld" }
    );
  } else {
    // 키가 없으면 공개 소스 맵으로 대체
    vBase = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: "© OpenStreetMap" }
    ).addTo(map);
    vSatellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: "Tiles © Esri" }
    );
    vHybrid = vSatellite;
  }

  // 베이스맵 레이어 컨트롤
  L.control.layers(
    {
      "기본지도 (Base)": vBase,
      "항공사진 (Satellite)": vSatellite,
      "하이브리드 (Hybrid)": vHybrid,
    },
    null,
    { position: 'topleft', collapsed: false }
  ).addTo(map);

  // 3) 표시용 레이어
  const markerLayer = L.layerGroup().addTo(map);
  const parcelsLayer = L.geoJSON(null, {
    style: { color: '#2e7d32', weight: 1, fillOpacity: 0.2 }
  }).addTo(map);

  // DB 오버레이 레이어 (체크되면 지도에 올림)
  const roadLayer = L.geoJSON(null, {
    pane: 'vec',
    style: { color: '#ff3b30', weight: 4, opacity: 1 } // 굵게/선명
  });
  const yongdoLayer = L.geoJSON(null, {
    pane: 'vec',
    style: { color: '#006400', weight: 2, fillColor: '#3CB371', fillOpacity: 0.4, opacity: 1 }
  });

  // 4) 사이드바 버튼 토글
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.target);
      panel.classList.toggle('active');
    });
  });

  // 현재 화면 BBOX → ?bbox=서,남,동,북
  function bboxQS() {
    const b = map.getBounds();
    return `?bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
  }

  // 먼저 BBOX로 요청, 0건이면 전체로 재시도 후 표시/줌
  async function fetchAndAdd(url, layer, tryBbox = true) {
    const fullUrl = url + (tryBbox ? bboxQS() : '');
    let res;
    try {
      res = await fetch(fullUrl, { cache: 'no-store' });
    } catch (e) {
      console.error('[fetch] network error', e);
      alert('데이터 요청 중 네트워크 오류가 발생했습니다.');
      return;
    }
    if (!res.ok) {
      console.error('[fetch] http error', res.status, fullUrl);
      alert('데이터 요청에 실패했습니다.');
      return;
    }
    const j = await res.json();
    const n = (j && j.features) ? j.features.length : 0;
    console.log('[fetch]', fullUrl, 'features:', n);

    layer.clearLayers();

    if (n > 0) {
      layer.addData(j);
      try { layer.bringToFront && layer.bringToFront(); } catch (_) {}
      const lb = layer.getBounds();
      if (lb && lb.isValid()) map.fitBounds(lb, { maxZoom: 13 });
      return;
    }
    if (tryBbox) return fetchAndAdd(url, layer, false);
    alert('표시할 데이터가 없습니다.');
  }

  // 5) (임시) 필지 로드
  async function loadParcels({ lat, lng, radius = 1000 }) {
    console.log(`[loadParcels] lat=${lat}, lng=${lng}, radius=${radius}`);
  }

  // 6) 주소 지오코딩 + 이동/표기
  async function geocodeAndMove(query) {
    if (!query) return;
    let type = "ROAD";
    if (/\d+-\d+/.test(query) || /동|리/.test(query)) type = "PARCEL";

    try {
      const url = `/api/geocode/?q=${encodeURIComponent(query)}&type=${type}`;
      const res = await fetch(url);
      const data = await res.json();

      console.log("[geocode] raw response:", data);

      if (!data.response || data.response.status !== "OK" || !data.response.result) {
        alert("검색 결과가 없습니다. 주소를 다시 확인해 주세요.");
        return;
      }

      let result = data.response.result;
      if (Array.isArray(result)) {
        if (result.length === 0) { alert("검색 결과가 없습니다."); return; }
        result = result[0];
      }

      const latNum = parseFloat(result.point.y);
      const lonNum = parseFloat(result.point.x);

      map.flyTo([latNum, lonNum], 17, { duration: 0.8 });
      markerLayer.clearLayers();
      L.marker([latNum, lonNum]).addTo(markerLayer)
        .bindPopup(`<b>검색 결과</b><br>${data.response.refined?.text || ''}`).openPopup();

      loadParcels({ lat: latNum, lng: lonNum, radius: 1000 });
    } catch (e) {
      console.error('[geocode] error:', e);
      alert('Vworld 지오코딩 중 오류가 발생했습니다.');
    }
  }

  // 7) 검색 버튼 & 엔터 처리
  const addrInput = document.getElementById('addr-input');
  document.getElementById('btn-search').addEventListener('click', () => {
    geocodeAndMove(addrInput.value.trim());
  });
  addrInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      geocodeAndMove(addrInput.value.trim());
    }
  });

  // 필터 박스 체크박스 연동
  const chkRoad = document.getElementById('chk-road');
  const chkYong = document.getElementById('chk-yongdo');

  chkRoad?.addEventListener('change', () => {
    if (chkRoad.checked) {
      roadLayer.addTo(map);
      fetchAndAdd('/geojson/road', roadLayer, true);
    } else {
      map.removeLayer(roadLayer);
      roadLayer.clearLayers();
    }
  });

  chkYong?.addEventListener('change', () => {
    if (chkYong.checked) {
      yongdoLayer.addTo(map);
      fetchAndAdd('/geojson/yongdo', yongdoLayer, true);
    } else {
      map.removeLayer(yongdoLayer);
      yongdoLayer.clearLayers();
    }
  });

  // (선택) 지도를 옮길 때 켜져 있는 레이어만 BBOX로 갱신
  map.on('moveend', () => {
    if (map.hasLayer(roadLayer))   fetchAndAdd('/geojson/road', roadLayer, true);
    if (map.hasLayer(yongdoLayer)) fetchAndAdd('/geojson/yongdo', yongdoLayer, true);
  });

  // 8) 초기 호출 (필요 시 사용)
  // loadParcels({ lat: mapCenter.lat, lng: mapCenter.lng, radius: 1000 });
})();
