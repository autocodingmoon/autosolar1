from django.urls import path
from . import views

urlpatterns = [
    # 페이지
    path("", views.map_view, name="map"),
    path("index/", views.index, name="index"),
    path("api/geocode/", views.vworld_geocode, name="vworld_geocode"),

    # MVT 타일
    path("tiles/owner/<int:z>/<int:x>/<int:y>.pbf", views.OwnerTileView.as_view(),  name="tiles_owner"),
    path("tiles/yongdo/<int:z>/<int:x>/<int:y>.pbf", views.YongdoTileView.as_view(), name="tiles_yongdo"),
    path("tiles/road/<int:z>/<int:x>/<int:y>.pbf",   views.RoadTileView.as_view(),   name="tiles_road"),
    path("tiles/jimok/<int:z>/<int:x>/<int:y>.pbf",  views.JimokTileView.as_view(),  name="tiles_jimok"),

    # (선택) TileJSON
    path("tiles/owner.json",  views.OwnerTileJSON.as_view(),  name="tiles_owner_json"),
    path("tiles/yongdo.json", views.YongdoTileJSON.as_view(), name="tiles_yongdo_json"),
    path("tiles/road.json",   views.RoadTileJSON.as_view(),   name="tiles_road_json"),
    path("tiles/jimok.json",  views.JimokTileJSON.as_view(),  name="tiles_jimok_json"),
]
