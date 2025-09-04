// script.js
(() => {
  // 1) 지도 초기화
  const mapCenter = { lat: 37.5665, lng: 126.9780 }; // 서울 시청 근처
  const map = L.map('map', { zoomControl: false }).setView([mapCenter.lat, mapCenter.lng], 13);
  L.control.zoom({ position: 'topright' }).addTo(map);

  // 2) Vworld 타일 레이어
  const vBase = L.tileLayer(
    "https://api.vworld.kr/req/wmts/1.0.0/3EF5EC0C-5706-3665-ADBA-BEAFFD4B74CC/Base/{z}/{y}/{x}.png",
    { maxZoom: 19, attribution: "&copy; Vworld" }
  ).addTo(map);

  const vSatellite = L.tileLayer(
    "https://api.vworld.kr/req/wmts/1.0.0/3EF5EC0C-5706-3665-ADBA-BEAFFD4B74CC/Satellite/{z}/{y}/{x}.jpeg",
    { maxZoom: 19, attribution: "&copy; Vworld" }
  );
  const vHybrid = L.tileLayer(
    "https://api.vworld.kr/req/wmts/1.0.0/3EF5EC0C-5706-3665-ADBA-BEAFFD4B74CC/Hybrid/{z}/{y}/{x}.png",
    { maxZoom: 19, attribution: "&copy; Vworld" }
  );

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

  // 4) 사이드바 버튼 토글
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.target);
      panel.classList.toggle('active');
    });
  });

  // 5) 필지 로드 함수 (임시)
  async function loadParcels({ lat, lng, radius = 1000 }) {
    console.log(`[loadParcels] lat=${lat}, lng=${lng}, radius=${radius}`);
    // 실제 API 호출 로직은 추후 구현
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

      // 응답 구조 로그
      console.log("[geocode] raw response:", data);

      if (!data.response || data.response.status !== "OK" || !data.response.result) {
        alert("검색 결과가 없습니다. 주소를 다시 확인해 주세요.");
        return;
      }

      // result가 배열인지 객체인지 판별
      let result = data.response.result;
      if (Array.isArray(result)) {
        if (result.length === 0) {
          alert("검색 결과가 없습니다. 주소를 다시 확인해 주세요.");
          return;
        }
        result = result[0];
      }

      // 좌표 꺼내기
      const latNum = parseFloat(result.point.y);
      const lonNum = parseFloat(result.point.x);

      map.flyTo([latNum, lonNum], 17, { duration: 0.8 });
      markerLayer.clearLayers();
      L.marker([latNum, lonNum]).addTo(markerLayer)
        .bindPopup(`<b>검색 결과</b><br>${data.response.refined?.text || ''}`).openPopup();

      // 필지 갱신
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

  // 8) 초기 호출
  // loadParcels({ lat: mapCenter.lat, lng: mapCenter.lng, radius: 1000 });
})();
