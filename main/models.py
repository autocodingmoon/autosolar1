# Create your models here.
from django.contrib.gis.db import models

class LandCategory(models.Model):
    gid = models.IntegerField(primary_key=True)
    sgg_oid = models.IntegerField()
    jibun = models.CharField(max_length=255, blank=True, null=True)
    bchk = models.CharField(max_length=255, blank=True, null=True)
    pnu = models.CharField(max_length=255, blank=True, null=True)
    col_adm_se = models.CharField(max_length=255, blank=True, null=True)
    geom = models.MultiPolygonField(srid=4326)
    region = models.TextField(blank=True, null=True)

    # 새로 추가할 컬럼 (update: 8/31)
    # 가상 필드 (DB에 없는 컬럼)
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