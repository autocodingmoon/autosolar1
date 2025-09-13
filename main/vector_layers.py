# main/vector_layers.py
from vectortiles import VectorLayer
from django.db.models import F
from django.db.models.functions import Length, Substr
from .models import LandCategory

class LandCategoryVectorLayer(VectorLayer):
    """
    MVT 타일에 실릴 레이어 정의
    """
    model = LandCategory
    id = "landcategory"           # 타일 내부의 레이어 이름
    geom_field = "geom"           # 기본값이 geom이면 생략 가능
    min_zoom = 12                 # 너무 낮은 줌에서 과도한 데이터 방지 (상황 맞게 조정)

    # @property 대신 쿼리셋 annotate로 타일 속성 제공(성능/호환성 Good)
    queryset = LandCategory.objects.annotate(
        jibun_len=Length("jibun"),
        jimok=Substr("jibun", F("jibun_len"), 1),           # 마지막 글자
        jibun_no=Substr("jibun", 1, F("jibun_len") - 1),    # 마지막 글자 제외
    )

    # 타일에 포함할 속성들 (필요에 맞게 가감)
    tile_fields = ("pnu", "jibun", "jibun_no", "jimok", "bchk", "col_adm_se", "region")
