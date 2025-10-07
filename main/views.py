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
    ResiVectorLayer, NonglimVectorLayer, NongupJinheungVectorLayer, JayeonNogjiVectorLayer,
    GaebalJingheungVectorLayer, NongupSeisanGibanVectorLayer,   # ✅ 추가
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
# 공통 TileView 베이스
# ---------------------------------------------------------------------
class _BaseTile:
    layer_classes = []
    prefix_url = "tiles"

    def get_layers(self):
        layers = super().get_layers()
        try:
            z = int(getattr(self, "kwargs", {}).get("z"))
        except Exception:
            z = None

        for lyr in layers:
            setattr(lyr, "request", self.request)
            if z is not None:
                setattr(lyr, "zoom", z)
        return layers

# ---- Owner -----------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class OwnerTileView(_BaseTile, MVTView):
    layer_classes = [OwnerVectorLayer]

class OwnerTileJSON(_BaseTile, TileJSONView):
    layer_classes = [OwnerVectorLayer]

# ---- Yongdo ----------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class YongdoTileView(_BaseTile, MVTView):
    layer_classes = [YongdoVectorLayer]

class YongdoTileJSON(_BaseTile, TileJSONView):
    layer_classes = [YongdoVectorLayer]

# ---- Road ------------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class RoadTileView(_BaseTile, MVTView):
    layer_classes = [RoadVectorLayer]

class RoadTileJSON(_BaseTile, TileJSONView):
    layer_classes = [RoadVectorLayer]

# ---- Jimok -----------------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class JimokTileView(_BaseTile, MVTView):
    layer_classes = [JimokVectorLayer]

class JimokTileJSON(_BaseTile, TileJSONView):
    layer_classes = [JimokVectorLayer]

# ✅ ---- Resi(주거이격) ------------------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class ResiTileView(_BaseTile, MVTView):
    layer_classes = [ResiVectorLayer]

class ResiTileJSON(_BaseTile, TileJSONView):
    layer_classes = [ResiVectorLayer]

# ---- 신규 타일 뷰 (캐시 10분 동일) ------------------------------------
@method_decorator(cache_page(60 * 10), name='dispatch')
class NonglimTileView(_BaseTile, MVTView):
    layer_classes = [NonglimVectorLayer]
class NonglimTileJSON(_BaseTile, TileJSONView):
    layer_classes = [NonglimVectorLayer]

@method_decorator(cache_page(60 * 10), name='dispatch')
class NongupJinheungTileView(_BaseTile, MVTView):
    layer_classes = [NongupJinheungVectorLayer]
class NongupJinheungTileJSON(_BaseTile, TileJSONView):
    layer_classes = [NongupJinheungVectorLayer]

@method_decorator(cache_page(60 * 10), name='dispatch')
class JayeonNogjiTileView(_BaseTile, MVTView):
    layer_classes = [JayeonNogjiVectorLayer]
class JayeonNogjiTileJSON(_BaseTile, TileJSONView):
    layer_classes = [JayeonNogjiVectorLayer]

@method_decorator(cache_page(60 * 10), name='dispatch')
class GaebalJingheungTileView(_BaseTile, MVTView):
    layer_classes = [GaebalJingheungVectorLayer]
class GaebalJingheungTileJSON(_BaseTile, TileJSONView):
    layer_classes = [GaebalJingheungVectorLayer]

@method_decorator(cache_page(60 * 10), name='dispatch')
class NongupSeisanGibanTileView(_BaseTile, MVTView):
    layer_classes = [NongupSeisanGibanVectorLayer]
class NongupSeisanGibanTileJSON(_BaseTile, TileJSONView):
    layer_classes = [NongupSeisanGibanVectorLayer]


# ---------------------------------------------------------------------
# VWorld WMTS 프록시
# ---------------------------------------------------------------------
@cache_page(60 * 5)
def vworld_wmts_proxy(request, layer, z, y, x, ext):
    key = getattr(settings, "VWORLD_KEY", "")
    if not key:
        return HttpResponseServerError("VWORLD_KEY not set")

    LAYERS = {"Base", "Satellite", "Hybrid"}
    EXTS = {"png", "jpeg"}
    if layer not in LAYERS or ext not in EXTS:
        return HttpResponseBadRequest("invalid layer/ext")

    url = f"https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}"
    try:
        r = requests.get(url, timeout=6)
        resp = HttpResponse(r.content, status=r.status_code)
        ctype = r.headers.get("Content-Type", "image/png")
        resp["Content-Type"] = ctype
        resp["Cache-Control"] = "public, max-age=300"
        return resp
    except Exception as e:
        return HttpResponseServerError(str(e))

# ---------------------------------------------------------------------
# (유지) 도로이격(시각) GeoJSON
# ---------------------------------------------------------------------
@cache_page(60 * 5)
def road_setback_geojson(request):
    dist_raw = request.GET.get("dist", "50")
    bbox_str = request.GET.get("bbox")
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

    ROAD_TABLE = 'filter."3.4_road_lsmd_cont_ui101_44_202508"'
    sql = f"""
        WITH bbox AS (
          SELECT ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),5186) AS g
        ),
        cand AS (
          SELECT r.gid, r.geom
          FROM {ROAD_TABLE} AS r, bbox
          WHERE ST_Intersects(r.geom, bbox.g)
        ),
        buf AS (
          SELECT gid, ST_Buffer(geom, %s) AS g
          FROM cand
        )
        SELECT gid, ST_AsGeoJSON(ST_Transform(g,4326)) AS geojson
        FROM buf
    """
    features = []
    try:
        with connection.cursor() as cur:
            cur.execute(sql, [minx, miny, maxx, maxy, dist])
            for gid, gj in cur.fetchall():
                if not gj:
                    continue
                features.append({
                    "type": "Feature",
                    "properties": {"gid": gid, "dist": dist},
                    "geometry": json.loads(gj)
                })
    except Exception as e:
        return JsonResponse({"error": f"DB error: {e}"}, status=500)

    return JsonResponse({"type": "FeatureCollection", "features": features})

# ---------------------------------------------------------------------
# ✅ 주거이격(제척) GeoJSON — (usability 필터/프룬 제거 버전)
# ---------------------------------------------------------------------
@cache_page(60 * 5)
def resi_setback_geojson(request):
    dist_raw = request.GET.get("dist", "50")
    bbox_str = request.GET.get("bbox")
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

    RESI_TABLE = 'filter."3.4_f_fac_building_44_202509"'

    sql = f"""
        WITH bbox AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope(%s,%s,%s,%s,4326),
                   5186
                 ) AS g
        ),
        cand AS (
          SELECT r.gid, r.geom
          FROM {RESI_TABLE} AS r, bbox
          WHERE ST_Intersects(r.geom, bbox.g)
        ),
        buf AS (
          SELECT gid, ST_Buffer(geom, %s) AS g
          FROM cand
        )
        SELECT gid,
               ST_AsGeoJSON(ST_Transform(g,4326)) AS geojson
        FROM buf
    """

    features = []
    try:
        with connection.cursor() as cur:
            cur.execute(sql, [minx, miny, maxx, maxy, dist])
            for gid, gj in cur.fetchall():
                if not gj:
                    continue
                features.append({
                    "type": "Feature",
                    "properties": {"gid": gid, "dist": dist},
                    "geometry": json.loads(gj)
                })
    except Exception as e:
        return JsonResponse({"error": f"DB error: {e}"}, status=500)

    return JsonResponse({"type": "FeatureCollection", "features": features})

