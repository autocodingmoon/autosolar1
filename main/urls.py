from django.urls import path, re_path
from . import views

urlpatterns = [
    # 페이지
    path("", views.map_view, name="map"),
    path("index/", views.index, name="index"),
    path("api/geocode/", views.vworld_geocode, name="vworld_geocode"),

    # VWorld WMTS 프록시
    path("vwtiles/<str:layer>/<int:z>/<int:y>/<int:x>.<str:ext>", views.vworld_wmts_proxy, name="vworld_wmts_proxy"),

    # MVT 타일
    path("tiles/owner/<int:z>/<int:x>/<int:y>.pbf", views.OwnerTileView.as_view(),  name="tiles_owner"),
    path("tiles/yongdo/<int:z>/<int:x>/<int:y>.pbf", views.YongdoTileView.as_view(), name="tiles_yongdo"),
    path("tiles/road/<int:z>/<int:x>/<int:y>.pbf",   views.RoadTileView.as_view(),   name="tiles_road"),
    path("tiles/jimok/<int:z>/<int:x>/<int:y>.pbf",  views.JimokTileView.as_view(),  name="tiles_jimok"),
    # ✅ 추가: Resi(주거이격)
    path("tiles/resi/<int:z>/<int:x>/<int:y>.pbf",   views.ResiTileView.as_view(),   name="tiles_resi"),
    path("tiles/nonglim/<int:z>/<int:x>/<int:y>.pbf",           views.NonglimTileView.as_view(),           name="tiles_nonglim"),
    path("tiles/nongupjinheung/<int:z>/<int:x>/<int:y>.pbf",    views.NongupJinheungTileView.as_view(),    name="tiles_nongupjinheung"),
    path("tiles/jayeonnogji/<int:z>/<int:x>/<int:y>.pbf",       views.JayeonNogjiTileView.as_view(),       name="tiles_jayeonnogji"),
    path("tiles/gaebaljingheung/<int:z>/<int:x>/<int:y>.pbf",   views.GaebalJingheungTileView.as_view(),   name="tiles_gaebaljingheung"),
    path("tiles/nongupseisangiban/<int:z>/<int:x>/<int:y>.pbf", views.NongupSeisanGibanTileView.as_view(), name="tiles_nongupseisangiban"),


    # (선택) TileJSON
    path("tiles/owner.json",  views.OwnerTileJSON.as_view(),  name="tiles_owner_json"),
    path("tiles/yongdo.json", views.YongdoTileJSON.as_view(), name="tiles_yongdo_json"),
    path("tiles/road.json",   views.RoadTileJSON.as_view(),   name="tiles_road_json"),
    path("tiles/jimok.json",  views.JimokTileJSON.as_view(),  name="tiles_jimok_json"),
    # ✅ 추가: Resi TileJSON
    path("tiles/resi.json",   views.ResiTileJSON.as_view(),   name="tiles_resi_json"),
    # (선택) TileJSON 경로도 원하시면 아래 추가
    path("tiles/nonglim.json",           views.NonglimTileJSON.as_view(),           name="tiles_nonglim_json"),
    path("tiles/nongupjinheung.json",    views.NongupJinheungTileJSON.as_view(),    name="tiles_nongupjinheung_json"),
    path("tiles/jayeonnogji.json",       views.JayeonNogjiTileJSON.as_view(),       name="tiles_jayeonnogji_json"),
    path("tiles/gaebaljingheung.json",   views.GaebalJingheungTileJSON.as_view(),   name="tiles_gaebaljingheung_json"),
    path("tiles/nongupseisangiban.json", views.NongupSeisanGibanTileJSON.as_view(), name="tiles_nongupseisangiban_json"),

    # ✅ 도로이격(시각) GeoJSON
    re_path(r'^geojson/road_setback/?$', views.road_setback_geojson, name='road_setback_geojson'),

    # ✅ 주거이격(제척) GeoJSON
    re_path(r'^geojson/resi_setback/?$', views.resi_setback_geojson, name='resi_setback_geojson'),

]
