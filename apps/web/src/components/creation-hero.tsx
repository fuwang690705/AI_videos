"use client";

import {
  ArrowUpRight,
  BookOpen,
  Clapperboard,
  Laugh,
  Sparkles,
  Video,
} from "lucide-react";
import { directionLabels, type ProductionType } from "@/lib/api";

const directions = [
  { type: "MANGA", icon: BookOpen, label: "让想象跃然成画" },
  { type: "MEME_ANIMATION", icon: Laugh, label: "有趣，自有引力" },
  { type: "REALISTIC", icon: Video, label: "把故事带入现实" },
] as const;

export function CreationHero({
  onCreate,
}: {
  onCreate: (direction: ProductionType) => void;
}) {
  return (
    <section className="creation-hero" aria-labelledby="creation-heading">
      <div className="hero-copy">
        <span className="hero-kicker">
          <Sparkles size={14} /> 灵感就位，故事开场
        </span>
        <h2 id="creation-heading">
          好故事，
          <br />
          从一个<span className="hero-emphasis">小小的灵感</span>
          <span className="hero-ending">开始。</span>
        </h2>
        <p>整理故事、规划剧集、打磨分镜。给你的下一部作品，一个起点。</p>
        <div className="hero-directions" aria-label="选择方向创建项目">
          {directions.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              className="hero-direction"
              onClick={() => onCreate(type)}
              aria-label={`创建${directionLabels[type]}项目`}
            >
              <Icon size={18} />
              <span>
                <strong>{directionLabels[type]}</strong>
                <small>{label}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <span className="art-orbit" />
        <span className="art-spark art-spark-one">✳</span>
        <span className="art-spark art-spark-two">✦</span>
        <div className="art-story-card">
          <div className="art-card-top">
            <span className="art-card-dot" /> A STORY IN THE MAKING{" "}
            <span>01</span>
          </div>
          <div className="art-landscape">
            <span className="art-sun" />
            <span className="art-hill art-hill-back" />
            <span className="art-hill art-hill-front" />
            <span className="art-person" />
          </div>
          <div className="art-card-bottom">
            <span>每个镜头，都有故事</span>
            <ArrowUpRight size={16} />
          </div>
        </div>
        <span className="art-sticker">
          <Clapperboard size={23} /> AND… ACTION!
        </span>
        <span className="art-caption">YOUR NEXT CHAPTER STARTS HERE ↗</span>
      </div>
    </section>
  );
}
