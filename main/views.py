from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.db import connection
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
    return render(request, "main/map.html", {"VWORLD_KEY": settings.VWORLD_KEY})

# 👉 Vworld 주소 검색 프록시 API (params 버전)
def vworld_geocode(request):
    query = request.GET.get("q")
    addr_type = request.GET.get("type", "ROAD")  # 기본값 ROAD
    key = settings.VWORLD_KEY
    if not key:
        return JsonResponse({"error": "VWORLD_KEY is not set"}, status=500)

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


# --- GeoJSON 공통 헬퍼 ---
def _run_geojson(sql, params=None):
    with connection.cursor() as cur:
        cur.execute(sql, params or [])
        row = cur.fetchone()
        return row[0] if row and row[0] else '{"type":"FeatureCollection","features":[]}'

def _parse_bbox(request):
    bbox = request.GET.get("bbox")
    if not bbox:
        return None
    try:
        w, s, e, n = [float(x) for x in bbox.split(",")]
        return (w, s, e, n)
    except Exception:
        return None


# --- 도로이격 ---
# --- 도로이격 ---
def geojson_road(request):
    """filter.\"3.4_road_lsmd_cont_ui101_44_202508\" → GeoJSON (인덱스 활용)"""
    bbox = _parse_bbox(request)
    if bbox:
        # 1) bbox를 테이블 SRID로 변환(상수) → 인덱스 전처리(&&) + 정밀 교차 검사
        sql = """
        WITH
        b AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope(%s,%s,%s,%s,4326),
                   Find_SRID('filter','3.4_road_lsmd_cont_ui101_44_202508','geom')
                 ) AS g
        ),
        f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            -- 소수 6자리로 GeoJSON 생성(전송량 절감)
            'geometry', ST_AsGeoJSON(ST_Transform(t.geom,4326), 6)::jsonb,
            -- 필요한 속성만 남기면 더 빠릅니다. (지금은 기존 유지)
            'properties', to_jsonb(t) - 'geom'
          ) AS feature
          FROM filter."3.4_road_lsmd_cont_ui101_44_202508" t
          JOIN b ON t.geom && b.g                -- 인덱스 후보군 (빠름)
          WHERE ST_Intersects(t.geom, b.g)       -- 정밀 교차
        )
        SELECT jsonb_build_object(
                 'type','FeatureCollection',
                 'features', COALESCE(jsonb_agg(f.feature), '[]'::jsonb)
               )::text
        FROM f;
        """
        data = _run_geojson(sql, bbox)
    else:
        # 전체 요청은 대용량일 경우 무겁습니다. 가능하면 항상 bbox를 사용하세요.
        sql = """
        WITH f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(t.geom,4326), 6)::jsonb,
            'properties', to_jsonb(t) - 'geom'
          ) AS feature
          FROM filter."3.4_road_lsmd_cont_ui101_44_202508" t
        )
        SELECT jsonb_build_object(
                 'type','FeatureCollection',
                 'features', COALESCE(jsonb_agg(f.feature), '[]'::jsonb)
               )::text
        FROM f;
        """
        data = _run_geojson(sql)
    return HttpResponse(data, content_type="application/json")


# --- 용도구역 ---
def geojson_yongdo(request):
    """filter.\"1.7_yongdo_lsmd_cont_uq112_44_202508\" → GeoJSON (인덱스 활용)"""
    bbox = _parse_bbox(request)
    if bbox:
        sql = """
        WITH
        b AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope(%s,%s,%s,%s,4326),
                   Find_SRID('filter','1.7_yongdo_lsmd_cont_uq112_44_202508','geom')
                 ) AS g
        ),
        f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(t.geom,4326), 6)::jsonb,
            'properties', to_jsonb(t) - 'geom'
          ) AS feature
          FROM filter."1.7_yongdo_lsmd_cont_uq112_44_202508" t
          JOIN b ON t.geom && b.g
          WHERE ST_Intersects(t.geom, b.g)
        )
        SELECT jsonb_build_object(
                 'type','FeatureCollection',
                 'features', COALESCE(jsonb_agg(f.feature), '[]'::jsonb)
               )::text
        FROM f;
        """
        data = _run_geojson(sql, bbox)
    else:
        sql = """
        WITH f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(t.geom,4326), 6)::jsonb,
            'properties', to_jsonb(t) - 'geom'
          ) AS feature
          FROM filter."1.7_yongdo_lsmd_cont_uq112_44_202508" t
        )
        SELECT jsonb_build_object(
                 'type','FeatureCollection',
                 'features', COALESCE(jsonb_agg(f.feature), '[]'::jsonb)
               )::text
        FROM f;
        """
        data = _run_geojson(sql)
    return HttpResponse(data, content_type="application/json")