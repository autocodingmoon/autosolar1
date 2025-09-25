# main/views.py
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse, HttpResponseBadRequest, HttpResponseServerError
import requests
# ★ 추가
import json
from django.db import connection

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


# ---------------------------------------------------------------------
# MVT 타일 뷰 (+ 서버 캐시)
# ---------------------------------------------------------------------
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


# ---------------------------------------------------------------------
# VWorld WMTS 프록시
# ---------------------------------------------------------------------
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
        resp = HttpResponse(r.content, status=r.status_code)
        ctype = r.headers.get("Content-Type", "image/png")
        resp["Content-Type"] = ctype
        resp["Cache-Control"] = "public, max-age=300"
        return resp
    except Exception as e:
        return HttpResponseServerError(str(e))


# ---------------------------------------------------------------------
# ★ 추가: 도로이격(시각) GeoJSON 엔드포인트
#     - 최초 1회만 호출하여 클라이언트에 캐시
#     - bbox는 EPSG:4326(지금 지도 뷰포트), 내부 계산은 5186(미터)
#     - dist: 버퍼 거리(m)
# ---------------------------------------------------------------------
@cache_page(60 * 5)  # 필요시 조정 (5분 서버캐시)
def road_setback_geojson(request):
    """
    GET params:
      - dist: buffer 거리 (미터), 정수/실수 가능. 기본 50
      - bbox: 'minx,miny,maxx,maxy' (EPSG:4326, 지도 뷰포트)

    반환:
      - GeoJSON FeatureCollection (Polygon/MultiPolygon)
    """
    dist_raw = request.GET.get("dist", "50")
    bbox_str = request.GET.get("bbox")

    # 파라미터 검증
    try:
        dist = float(dist_raw)
        if dist <= 0:
            raise ValueError
    except Exception:
        return JsonResponse({"error": "invalid dist"}, status=400)

    if not bbox_str:
        return JsonResponse({"type": "FeatureCollection", "features": []})

    try:
        minx, miny, maxx, maxy = map(float, bbox_str.split(","))
    except Exception:
        return JsonResponse({"error": "invalid bbox"}, status=400)

    # 실제 도로 테이블명 (사용자 환경에 맞춘 실제 테이블)
    # 예시: filter."3.4_road_lsmd_cont_ui101_44_202508"
    ROAD_TABLE = 'filter."3.4_road_lsmd_cont_ui101_44_202508"'

    # 성능 고려:
    #  - bbox와 교차하는 선형만 선별
    #  - 5186(SRID: meter)에서 ST_Buffer
    #  - 필요시 ST_UnaryUnion으로 폴리곤 합치기(옵션)
    sql = f"""
        WITH bbox AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope(%s, %s, %s, %s, 4326),
                   5186
                 ) AS g
        ),
        cand AS (
          SELECT r.gid, r.geom
          FROM {ROAD_TABLE} AS r, bbox
          WHERE ST_Intersects(r.geom, bbox.g)
        ),
        buf AS (
          SELECT
            gid,
            ST_Buffer(geom, %s) AS g   -- 5186에서 m 단위 버퍼
          FROM cand
        )
        SELECT gid,
               ST_AsGeoJSON(
                 ST_Transform(g, 4326)
               ) AS geojson
        FROM buf
    """

    features = []
    try:
        with connection.cursor() as cur:
            cur.execute(sql, [minx, miny, maxx, maxy, dist])
            rows = cur.fetchall()
            for gid, gj in rows:
                if not gj:
                    continue
                geom = json.loads(gj)
                features.append({
                    "type": "Feature",
                    "properties": {"gid": gid, "dist": dist},
                    "geometry": geom
                })
    except Exception as e:
        return JsonResponse({"error": f"DB error: {e}"}, status=500)

    return JsonResponse({"type": "FeatureCollection", "features": features})
