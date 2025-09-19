from django.urls import path
from . import views

urlpatterns = [
    path("", views.map_view, name="map"),
    path("index/", views.index, name="index"),
    path("api/geocode/", views.vworld_geocode, name="vworld_geocode"),

    # GeoJSON 엔드포인트
    path("geojson/road",  views.geojson_road,  name="geojson_road"),
    path("geojson/yongdo", views.geojson_yongdo, name="geojson_yongdo"),
    path("geojson/owner", views.geojson_owner,  name="geojson_owner"),
    # ✅ 새로 추가: jimok(기타)
    path("geojson/jimok", views.geojson_jimok,  name="geojson_jimok"),

    # MVT
    path("land/<int:z>/<int:x>/<int:y>.pbf", views.LandTileView.as_view(), name="land_tiles"),
    path("land/tiles.json", views.LandTileJSON.as_view(), name="land_tilejson"),
]
