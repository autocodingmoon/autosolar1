# main/vector_layers.py
from django.db.models import Value, TextField
from vectortiles import VectorLayer
from .models import (
    OwnerSubdiv, OwnerS30, OwnerRaw,
    Yongdo, YongdoS30,
    Road, RoadS10,
    Jimok, JimokS30,
    ResiSetback,          # ✅ 추가: 주거이격 원본 테이블 매핑 모델
)

def _norm_list(values):
    return [v.strip() for v in values if v and str(v).strip()]

# ===== Owner (지목/소유자 필터 적용) ============================================
class OwnerVectorLayer(VectorLayer):
    id = "owner"
    geom_field = "geom"
    min_zoom = 10
    tile_fields = ("gid", "a2", "a5", "a20", "a8")  # 지목/소유자 확인용 속성만 싣기

    # ★ 호출 패턴을 모두 수용 (request,bbox,zoom) 또는 인자 없음
    def get_queryset(self, request=None, bbox=None, zoom=None):
        # 1) 줌에 따라 테이블 선택(있으면 단순화본 우선)
        if zoom is None:
            zoom = getattr(self, "zoom", None)

        if zoom is not None and zoom <= 11 and OwnerS30:
            qs = OwnerS30.objects.all()
        elif OwnerSubdiv:
            qs = OwnerSubdiv.objects.all()
        else:
            qs = OwnerRaw.objects.all()

        # 2) request 확보
        if request is None:
            request = getattr(self, "request", None)

        # 3) 필터 적용 (jm: 지목, own: 소유자)
        if request is not None:
            jm  = _norm_list(request.GET.getlist("jm"))
            own = _norm_list(request.GET.getlist("own"))

            if jm:
                qs = qs.filter(a20__in=jm)
            if own:
                qs = qs.filter(a8__in=own)
        
        # 4) a2/a5가 없는 단순화/분할 테이블에 대해 빈 필드 annotate
        model_fields = {f.name for f in qs.model._meta.get_fields()}
        if "a2" not in model_fields:
            qs = qs.annotate(a2=Value("", output_field=TextField()))
        if "a5" not in model_fields:
            qs = qs.annotate(a5=Value("", output_field=TextField()))

        return qs

# ===== Yongdo ================================================================
class YongdoVectorLayer(VectorLayer):
    id = "yongdo"
    geom_field = "geom"
    min_zoom = 10
    tile_fields = ("gid",)

    def get_queryset(self, request=None, bbox=None, zoom=None):
        if zoom is None:
            zoom = getattr(self, "zoom", None)
        if zoom is not None and zoom <= 11 and YongdoS30:
            return YongdoS30.objects.all()
        return Yongdo.objects.all()

# ===== Road ==================================================================
class RoadVectorLayer(VectorLayer):
    id = "road"
    geom_field = "geom"
    min_zoom = 10
    tile_fields = ("gid",)

    def get_queryset(self, request=None, bbox=None, zoom=None):
        if zoom is None:
            zoom = getattr(self, "zoom", None)
        if zoom is not None and zoom <= 11 and RoadS10:
            return RoadS10.objects.all()
        return Road.objects.all()

# ===== Jimok (기타) — 필터 무관, 항상 전체 ====================================
class JimokVectorLayer(VectorLayer):
    id = "jimok"
    geom_field = "geom"
    min_zoom = 10
    tile_fields = ("gid", "pnu", "jibun", "a20")

    def get_queryset(self, request=None, bbox=None, zoom=None):
        if zoom is None:
            zoom = getattr(self, "zoom", None)
        if zoom is not None and zoom <= 11 and JimokS30:
            return JimokS30.objects.all()
        return Jimok.objects.all()

# ===== Resi (주거이격) — 도로이격과 동일한 MVT 경로 ============================
class ResiVectorLayer(VectorLayer):
    id = "resi"
    geom_field = "geom"
    min_zoom = 10
    tile_fields = ("gid",)

    def get_queryset(self, request=None, bbox=None, zoom=None):
        # 별도 필터 없음: 전체를 그대로 제공
        return ResiSetback.objects.all()
