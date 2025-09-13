from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map'),   # 기본 URL → map.html
    path('index/', views.index, name='index'),  # index.html은 /index/ 로 접근
    path('api/geocode/', views.vworld_geocode, name='vworld_geocode'),
]
    # --- ✅ MVT 엔드포인트 ---
    # /land/<z>/<x>/<y>    → 타일(.pbf)
    views.LandTileView.get_url(),

    # /land/tiles.json     → TileJSON (클라이언트에서 이 URL만 주면 편함)
    views.LandTileJSON.get_urls(tiles_urls=views.LandTileView.get_url()),
]