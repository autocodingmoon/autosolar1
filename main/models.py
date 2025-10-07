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


class Layer(gis.Model):
    name = gis.CharField(max_length=250)
    class Meta:
        managed = False
        db_table = '"public"."layer"'


class Feature(gis.Model):
    geom = gis.GeometryField(srid=4326)
    name = gis.CharField(max_length=250)
    layer = gis.ForeignKey(Layer, on_delete=gis.CASCADE, related_name='features')
    class Meta:
        managed = False
        db_table = '"public"."feature"'

# =============================================================================
# MVT용 읽기전용 모델들
# =============================================================================

class OwnerSubdiv(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    a20  = gis.TextField(blank=True, null=True)
    a8   = gis.TextField(blank=True, null=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."owner_subdiv"'

class OwnerRaw(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    a2   = gis.TextField(blank=True, null=True)
    a5   = gis.TextField(blank=True, null=True)
    a20  = gis.TextField(blank=True, null=True)
    a8   = gis.TextField(blank=True, null=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.2_ownerinfo_chungnam_al_d160_44_20250907_combined"'

class Yongdo(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.7_yongdo_lsmd_cont_uq112_44_202508"'

class Road(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiLineStringField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."3.4_road_lsmd_cont_ui101_44_202508"'

class Jimok(gis.Model):
    gid     = gis.IntegerField(primary_key=True)
    pnu     = gis.TextField(blank=True, null=True)
    jibun   = gis.TextField(blank=True, null=True)
    a20     = gis.TextField(blank=True, null=True)
    geom    = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter."jimok"'

class OwnerS30(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    a20  = gis.TextField(blank=True, null=True)
    a8   = gis.TextField(blank=True, null=True)
    geom = gis.MultiPolygonField(srid=5186)
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

# ✅ 추가: 주거이격(폴리곤) — filter."3.4_f_fac_building_44_202509"
class ResiSetback(gis.Model):
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."3.4_f_fac_building_44_202509"'

# 파일 하단 적절한 위치(예: ResiSetback 아래)에 추가
class Nonglim(gis.Model):  # 농림지역
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.7.2_nonglim_al_d126_00_20250904"'

class NongupJinheung(gis.Model):  # 농업진흥구역
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.7.2.1_nongupjinheung_al_d036_00_20250904"'

class JayeonNogji(gis.Model):  # 자연녹지지역
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.7.4_jayeon_al_d127_00_20250904"'

class GaebalJingheung(gis.Model):  # 개발진흥구역
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.7.5_gaebaljingeuing_al_d137_00_20250904"'

class NongupSeisanGiban(gis.Model):  # 농업생산기반정비사업지역
    gid  = gis.IntegerField(primary_key=True)
    geom = gis.MultiPolygonField(srid=5186)
    class Meta:
        managed = False
        db_table = '"filter"."1.7.6_nongup_etc_al_d035_00_20250904"'

