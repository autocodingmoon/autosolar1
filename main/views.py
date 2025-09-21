# main/views.py
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse, HttpResponseBadRequest, HttpResponseServerError
import requests

# 캐시 데코레이터
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page

# MVT
from vectortiles.views import MVTView, TileJSONView
from .vector_layers import (
    OwnerVectorLayer,
    YongdoVectorLayer,
    RoadVectorLayer,
    JimokVectorLayer,
)


# ---------------------------------------------------------------------
# 기본 페이지
# ---------------------------------------------------------------------
def index(request):
    context = {
        'name': '지환',
        'users': [{'name': '필준'}, {'name': '지민'}, {'name': '혁태'}]
    }
    return render(request, 'main/index.html', context)


def map_view(request):
    return render(request, "main/map.html", {"VWORLD_KEY": settings.VWORLD_KEY})


# ---------------------------------------------------------------------
# Vworld 주소 검색 프록시
# ---------------------------------------------------------------------
def vworld_geocode(request):
    query = request.GET.get("q")
    addr_type = request.GET.get("type", "ROAD")
    key = settings.VWORLD_KEY

    if not key:
        return JsonResponse({"error": "VWORLD_KEY is not set"}, status=500)
    if not query:
        return JsonResponse({"error": "missing query"}, status=400)

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
        r = requests.get(url, params=params, timeout=5)
        r.raise_for_status()
        return JsonResponse(r.json())
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=502)


# main/views.py (발췌) — MVT 뷰들 정의 부분 위/근처에 추가

# ---------------------------------------------------------------------
# MVT 타일 뷰 (+ 서버 캐시)
# ---------------------------------------------------------------------
# main/views.py  (_BaseTile 교체)

class _BaseTile:
    """
    공통 설정:
    - layer_classes: 하위 클래스에서 지정
    - prefix_url: TileJSON 생성 시 타일 URL 접두어
    - get_layers(): 각 레이어 인스턴스에 request와 zoom 주입
    """
    layer_classes = []
    prefix_url = "tiles"

    def get_layers(self):
        layers = super().get_layers()
        # URL kwargs에서 z(zoom) 가져오기
        try:
            z = int(getattr(self, "kwargs", {}).get("z"))
        except Exception:
            z = None

        for lyr in layers:
            setattr(lyr, "request", self.request)  # ★ 필터용
            if z is not None:
                setattr(lyr, "zoom", z)            # ★ 단순화본 선택용
        return layers

# ---- Owner (필터 전달: jm, own) -------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')  # 10분 캐시
class OwnerTileView(_BaseTile, MVTView):
    layer_classes = [OwnerVectorLayer]


class OwnerTileJSON(_BaseTile, TileJSONView):
    layer_classes = [OwnerVectorLayer]


# ---- Yongdo -----------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class YongdoTileView(_BaseTile, MVTView):
    layer_classes = [YongdoVectorLayer]


class YongdoTileJSON(_BaseTile, TileJSONView):
    layer_classes = [YongdoVectorLayer]


# ---- Road -------------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class RoadTileView(_BaseTile, MVTView):
    layer_classes = [RoadVectorLayer]


class RoadTileJSON(_BaseTile, TileJSONView):
    layer_classes = [RoadVectorLayer]


# ---- Jimok ------------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class JimokTileView(_BaseTile, MVTView):
    layer_classes = [JimokVectorLayer]


class JimokTileJSON(_BaseTile, TileJSONView):
    layer_classes = [JimokVectorLayer]

@cache_page(60 * 5)  # 5분 캐시(원하면 조정)
def vworld_wmts_proxy(request, layer, z, y, x, ext):
    """
    예: /vwtiles/Base/14/6755/14603.png
        /vwtiles/Satellite/14/6755/14603.jpeg
        /vwtiles/Hybrid/14/6755/14603.png
    """
    key = getattr(settings, "VWORLD_KEY", "")
    if not key:
        return HttpResponseServerError("VWORLD_KEY not set")

    # layer/확장자 화이트리스트
    LAYERS = {"Base", "Satellite", "Hybrid"}
    EXTS = {"png", "jpeg"}
    if layer not in LAYERS or ext not in EXTS:
        return HttpResponseBadRequest("invalid layer/ext")

    url = f"https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}"
    try:
        r = requests.get(url, timeout=6)  # 필요시 proxies/headers 추가
        # VWorld는 실패시에도 이미지(에러 텍스트 포함) 줄 때가 있어 상태코드만으로 판단 어려움
        # 그대로 중계. content-type도 전달
        resp = HttpResponse(r.content, status=r.status_code)
        ctype = r.headers.get("Content-Type", "image/png")
        resp["Content-Type"] = ctype
        # 간단한 캐시 헤더
        resp["Cache-Control"] = "public, max-age=300"
        return resp
    except Exception as e:
        return HttpResponseServerError(str(e))