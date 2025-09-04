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
