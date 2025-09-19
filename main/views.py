from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.db import connection
import requests

def index(request):
    context = {
        'name': '지환',
        'users': [{'name': '필준'}, {'name': '지민'}, {'name': '혁태'}]
    }
    return render(request, 'main/index.html', context)

def map_view(request):
    return render(request, "main/map.html", {"VWORLD_KEY": settings.VWORLD_KEY})

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
        "service": "address", "request": "getCoord", "version": "2.0",
        "crs": "EPSG:4326", "format": "json", "type": addr_type,
        "address": query, "key": key,
    }
    try:
        r = requests.get(url, params=params, timeout=5)
        r.raise_for_status()
        return JsonResponse(r.json())
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=502)

# --- MVT ---
from vectortiles.views import MVTView, TileJSONView
from .vector_layers import LandCategoryVectorLayer

class _LandBaseLayer:
    layer_classes = [LandCategoryVectorLayer]
    prefix_url = "land"

class LandTileView(_LandBaseLayer, MVTView): pass
class LandTileJSON(_LandBaseLayer, TileJSONView): pass

# --- GeoJSON 공통 ---
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
def geojson_road(request):
    bbox = _parse_bbox(request)
    if bbox:
        sql = """
        WITH b AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope(%s,%s,%s,%s,4326),
                   Find_SRID('filter','3.4_road_lsmd_cont_ui101_44_202508','geom')
                 ) AS g
        ),
        f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(t.geom,4326), 6)::jsonb,
            'properties', to_jsonb(t) - 'geom'
          ) AS feature
          FROM filter."3.4_road_lsmd_cont_ui101_44_202508" t
          JOIN b ON t.geom && b.g
          WHERE ST_Intersects(t.geom, b.g)
        )
        SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(f.feature),'[]'::jsonb))::text
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
          FROM filter."3.4_road_lsmd_cont_ui101_44_202508" t
        )
        SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(f.feature),'[]'::jsonb))::text
        FROM f;
        """
        data = _run_geojson(sql)
    return HttpResponse(data, content_type="application/json")

# --- 용도구역 ---
def geojson_yongdo(request):
    bbox = _parse_bbox(request)
    if bbox:
        sql = """
        WITH b AS (
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
        SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(f.feature),'[]'::jsonb))::text
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
        SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(f.feature),'[]'::jsonb))::text
        FROM f;
        """
        data = _run_geojson(sql)
    return HttpResponse(data, content_type="application/json")

# --- 소유정보(결합) ---
def geojson_owner(request):
    bbox = _parse_bbox(request)
    jm = request.GET.getlist("jm")   # 지목 필터
    own = request.GET.getlist("own") # 소유자 필터

    sql = """
    WITH sr AS (
      SELECT CASE
              WHEN COALESCE(NULLIF(ST_SRID(geom),0),0) <> 0
                THEN ST_SRID(geom)
              WHEN (SELECT MAX(ST_X(ST_PointOnSurface(geom))) FROM filter."1.2_ownerinfo_chungnam_al_d160_44_20250907_combined") > 10000
                THEN 5186   -- m 단위로 보이면 5186(중부) 가정
              ELSE 4326
            END AS srid
      FROM filter."1.2_ownerinfo_chungnam_al_d160_44_20250907_combined"
      WHERE geom IS NOT NULL LIMIT 1
    )
 
    {bbox_cte}
    , src AS (
      SELECT
        ST_CollectionExtract(ST_MakeValid(t.geom), 3) AS g_poly,
        t.gid,
        t.a20::text AS a20,
        t.a8::text AS a8
      FROM filter."1.2_ownerinfo_chungnam_al_d160_44_20250907_combined" t
      {bbox_join}
      WHERE 1=1
      {bbox_where}
      {jm_clause}
      {own_clause}
    )
    , feat AS (  -- ← 결과 피처를 확실한 CTE로 만듭니다.
      SELECT jsonb_build_object(
        'type','Feature',
        'geometry',   ST_AsGeoJSON(ST_Transform(g_poly, 4326), 6)::jsonb,
        'properties', jsonb_build_object(
          'gid', gid,
          'a20', COALESCE(a20,''),
          'a8',  COALESCE(a8,'')
        )
      ) AS feature
      FROM src
      WHERE g_poly IS NOT NULL
    )
    SELECT jsonb_build_object(
      'type','FeatureCollection',
      'features', COALESCE(jsonb_agg(feat.feature), '[]'::jsonb)
    )::text
    FROM feat;  -- ← 반드시 FROM feat 로 집계
    """

    clauses = {"bbox_cte": "", "bbox_join": "", "bbox_where": "", "jm_clause": "", "own_clause": ""}
    params = []

    if bbox:
        clauses["bbox_cte"] = """
        , b AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope(%s,%s,%s,%s,4326),
                   (SELECT srid FROM sr)
                 ) AS g
        )
        """
        clauses["bbox_join"]  = " JOIN b ON t.geom && b.g "
        clauses["bbox_where"] = " AND ST_Intersects(t.geom, b.g) "
        params.extend(bbox)

    if jm:
        clauses["jm_clause"] = " AND t.a20 = ANY(%s) "
        params.append(jm)

    if own:
        clauses["own_clause"] = " AND t.a8 = ANY(%s) "
        params.append(own)

    sql = sql.format(**clauses)

    try:
        data = _run_geojson(sql, params)
        return HttpResponse(data, content_type="application/json")
    except Exception as e:
        import traceback; traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)



# ✅ 새로 추가: jimok(= 기타) 폴리곤 표시
def geojson_jimok(request):
    """
    schema.table: filter."jimok"
    geom(Polygon/MultiPolygon)을 BBOX로 잘라서 4326 GeoJSON 반환.
    붉은색 스타일은 프런트에서 지정합니다.
    """
    bbox = _parse_bbox(request)
    if bbox:
        sql = """
        WITH sr AS (
          SELECT COALESCE(NULLIF(ST_SRID(geom),0), Find_SRID('filter','jimok','geom')) AS srid
          FROM filter."jimok"
          WHERE geom IS NOT NULL
          LIMIT 1
        ),
        b AS (
          SELECT ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326), (SELECT srid FROM sr)) AS g
        ),
        src AS (
          SELECT
            ST_CollectionExtract(ST_MakeValid(t.geom), 3) AS g_poly,
            t.gid,
            t.pnu,
            t.jibun,
            t.col_adm_se,
            t.region
          FROM filter."jimok" t, b
          WHERE t.geom && b.g
            AND ST_Intersects(t.geom, b.g)
        ),
        f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(g_poly, 4326), 6)::jsonb,
            'properties', jsonb_build_object(
              'gid', gid,
              'pnu', pnu,
              'jibun', COALESCE(jibun,''),
              'col_adm_se', COALESCE(col_adm_se,''),
              'region', COALESCE(region,'')
            )
          ) AS feature
          FROM src
          WHERE g_poly IS NOT NULL
        )
        SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb))::text
        FROM f;
        """
        data = _run_geojson(sql, bbox)
    else:
        # (주의) 전체 반환은 매우 클 수 있습니다. 운영에서는 bbox 사용 권장.
        sql = """
        WITH src AS (
          SELECT
            ST_CollectionExtract(ST_MakeValid(t.geom), 3) AS g_poly,
            t.gid, t.pnu, t.jibun, t.col_adm_se, t.region
          FROM filter."jimok" t
        ),
        f AS (
          SELECT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(g_poly, 4326), 6)::jsonb,
            'properties', jsonb_build_object(
              'gid', gid,
              'pnu', pnu,
              'jibun', COALESCE(jibun,''),
              'col_adm_se', COALESCE(col_adm_se,''),
              'region', COALESCE(region,'')
            )
          ) AS feature
          FROM src
          WHERE g_poly IS NOT NULL
        )
        SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb))::text
        FROM f;
        """
        data = _run_geojson(sql)
    return HttpResponse(data, content_type="application/json")
