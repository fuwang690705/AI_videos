from pydantic import BaseModel, ConfigDict

from studio.modules.catalog.schemas import ProductionType


class ProductionProfile(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    name: str
    version: str
    production_type: ProductionType
    video_mode: str
    audio_mode: str
    renderer: str
    description: str
    generation_enabled: bool = False


PROFILES = (
    ProductionProfile(
        id="manga-standard@1.0",
        name="标准漫剧",
        version="1.0",
        production_type=ProductionType.MANGA,
        video_mode="generative",
        audio_mode="external_voice",
        renderer="ffmpeg",
        description="参考资产 → 图片 → 视频 → 配音与合成",
    ),
    ProductionProfile(
        id="meme-simple@1.0",
        name="程序动画",
        version="1.0",
        production_type=ProductionType.MEME_ANIMATION,
        video_mode="procedural",
        audio_mode="voice_first",
        renderer="remotion",
        description="对白与配音 → 素材编排 → 程序动画与合成",
    ),
    ProductionProfile(
        id="realistic-standard@1.0",
        name="标准真人剧",
        version="1.0",
        production_type=ProductionType.REALISTIC,
        video_mode="generative",
        audio_mode="external_voice",
        renderer="ffmpeg",
        description="身份参考 → 配音与镜头 → 口型与连续性检查",
    ),
)


def get_profile(profile_id: str) -> ProductionProfile | None:
    return next((profile for profile in PROFILES if profile.id == profile_id), None)
