# main/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # 기본 페이지 및 기존 API
    path("", views.map_view, name="map"),
    path("index/", views.index, name="index"),
    path("api/geocode/", views.vworld_geocode, name="vworld_geocode"),

    # GeoJSON 엔드포인트 (도로이격, 용도구역)
    path("geojson/road", views.geojson_road, name="geojson_road"),
    path("geojson/yongdo", views.geojson_yongdo, name="geojson_yongdo"),

    # ✅ MVT 타일/TileJSON을 as_view()로 직접 등록
    path("land/<int:z>/<int:x>/<int:y>.pbf", views.LandTileView.as_view(), name="land_tiles"),
    path("land/tiles.json", views.LandTileJSON.as_view(), name="land_tilejson"),
]
