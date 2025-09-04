from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map'),   # 기본 URL → map.html
    path('index/', views.index, name='index'),  # index.html은 /index/ 로 접근
    path('api/geocode/', views.vworld_geocode, name='vworld_geocode'),
]