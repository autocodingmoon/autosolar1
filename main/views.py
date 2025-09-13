from django.shortcuts import render
from django.http import JsonResponse
import requests

def index(request):
    context = {
        'name': '지환',
        'users': [
            {'name': '필준'},
            {'name': '지민'},
            {'name': '혁태'},
        ]
    }
    return render(request, 'main/index.html', context)

def map_view(request):
    return render(request, 'main/map.html')

# 👉 Vworld 주소 검색 프록시 API (params 버전)
def vworld_geocode(request):
    query = request.GET.get("q")
    addr_type = request.GET.get("type", "ROAD")  # 기본값 ROAD
    key = "3EF5EC0C-5706-3665-ADBA-BEAFFD4B74CC"  # ← 발급받은 실제 API Key 입력

    url = "https://api.vworld.kr/req/address"
    params = {
        "service": "address",
        "request": "getCoord",
        "version": "2.0",
        "crs": "EPSG:4326",
        "format": "json",
        "type": addr_type,
        "address": query,
        "key": key,
    }

    try:
        r = requests.get(url, params=params)
        data = r.json()
        return JsonResponse(data)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


# --- ✅ 여기부터 MVT 추가 ---
from vectortiles.views import MVTView, TileJSONView
from .vector_layers import LandCategoryVectorLayer

class _LandBaseLayer:
    # 여러 레이어를 한 타일에 넣을 수도 있으나 지금은 1개
    layer_classes = [LandCategoryVectorLayer]
    # TileJSON이 타일 URL을 알 수 있게 접두어 지정
    # 결과 경로: /land/<z>/<x>/<y>
    prefix_url = "land"

class LandTileView(_LandBaseLayer, MVTView):
    pass

class LandTileJSON(_LandBaseLayer, TileJSONView):
    pass