# main/models.py
from django.contrib.gis.db import models as gis

# =============================================================================
# 기존 모델 (유지)
# =============================================================================

class LandCategory(gis.Model):
    gid = gis.IntegerField(primary_key=True)
    sgg_oid = gis.IntegerField()
    jibun = gis.CharField(max_length=255, blank=True, null=True)
    bchk = gis.CharField(max_length=255, blank=True, null=True)
    pnu = gis.CharField(max_length=255, blank=True, null=True)
    col_adm_se = gis.CharField(max_length=255, blank=True, null=True)
    geom = gis.MultiPolygonField(srid=4326)
    region = gis.TextField(blank=True, null=True)

    @property
    def jibun_no(self):
        if self.jibun:
            return self.jibun.strip()[:-1].strip()
        return None

    @property
    def jimok(self):
        if self.jibun:
            return self.jibun.strip()[-1]
        return None

    class Meta:
        db_table = '"filter"."jimok"'
        managed = False


# (참고로 예전에 있던 벡터타일 샘플)
class Layer(gis.Model):
    name = gis.CharField(max_length=250)
    class Meta:
        managed = False
        db_table = '"public"."layer"'  # 실제 쓰지 않으면 삭제해도 됩니다.


class Feature(gis.Model):
    geom = gis.GeometryField(srid=4326)
    name = gis.CharField(max_length=250)
    layer = gis.ForeignKey(Layer, on_delete=gis.CASCADE, related_name='features')
    class Meta:
        managed = False
        db_table = '"public"."feature"'  # 실제 쓰지 않으면 삭제해도 됩니다.


# =============================================================================
# MVT용 읽기전용 모델들 (managed=False)
#  - 전처리 테이블(owner_valid, owner_subdiv 등)을 쓰면 성능이 크게 향상됩니다.
#  - SRID는 실제 좌표계로 교체하세요. (예: 5186 / 5179 / 4737 / 4326 등)
# =============================================================================

# ---- Owner: 전처리/분할본(권장) ----
class OwnerSubdiv(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    a20  = gis.TextField(blank=True, null=True)   # 지목(원본 코드셋)
    a8   = gis.TextField(blank=True, null=True)   # 소유자(군유지/국유지/법인/개인 등)
    geom = gis.MultiPolygonField(srid=5186)       # ← 실제 SRID로 교체

    class Meta:
        managed = False
        db_table = '"filter"."owner_subdiv"'          # 전처리 테이블명을 사용하세요


# ---- Owner: 원본(폴백용) ----
class OwnerRaw(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    a2   = gis.TextField(blank=True, null=True)   # ★ 추가
    a5   = gis.TextField(blank=True, null=True)   # ★ 추가
    a20  = gis.TextField(blank=True, null=True)
    a8   = gis.TextField(blank=True, null=True)
    geom = gis.MultiPolygonField(srid=5186)       # ← 실제 SRID로 교체

    class Meta:
        managed = False
        # 따옴표/점이 포함된 테이블명은 정확히 적어야 합니다.
        db_table = '"filter"."1.2_ownerinfo_chungnam_al_d160_44_20250907_combined"'


# ---- Yongdo (용도구역) ----
class Yongdo(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)       # ← 실제 SRID로 교체
    class Meta:
        managed = False
        db_table = '"filter"."1.7_yongdo_lsmd_cont_uq112_44_202508"'


# ---- Road (도로이격 등 선형) ----
class Road(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiLineStringField(srid=5186)    # ← 실제 SRID로 교체
    class Meta:
        managed = False
        db_table = '"filter"."3.4_road_lsmd_cont_ui101_44_202508"'


# ---- Jimok (기타 폴리곤) ----
class Jimok(gis.Model):
    gid     = gis.IntegerField(primary_key=True)
    pnu     = gis.TextField(blank=True, null=True)
    jibun   = gis.TextField(blank=True, null=True)
    a20     = gis.TextField(blank=True, null=True)    # 있으면 사용
    geom    = gis.MultiPolygonField(srid=5186)        # ← 실제 SRID로 교체

    class Meta:
        managed = False
        db_table = '"filter."jimok"'

# main/models.py (추가)
class OwnerS30(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    a20  = gis.TextField(blank=True, null=True)
    a8   = gis.TextField(blank=True, null=True)
    geom = gis.MultiPolygonField(srid=5186)         # 실제 SRID로
    class Meta:
        managed = False
        db_table = '"filter"."owner_s30"'

class YongdoS30(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."yongdo_s30"'

class RoadS10(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiLineStringField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."road_s10"'

class JimokS30(gis.Model):
    gid     = gis.IntegerField(primary_key=True)
    pnu     = gis.TextField(blank=True, null=True)
    jibun   = gis.TextField(blank=True, null=True)
    a20     = gis.TextField(blank=True, null=True)
    geom    = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."jimok_s30"'

