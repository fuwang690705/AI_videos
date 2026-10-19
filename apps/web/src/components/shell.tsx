"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  FolderKanban,
  SlidersHorizontal,
  Sparkles,
  Layers3,
  ArrowUpRight,
} from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="剧集工场首页">
          <span className="brand-mark">
            <Clapperboard size={23} />
          </span>
          <span>
            剧集工场<small>CONTENT STUDIO</small>
          </span>
        </Link>
        <div className="workspace-tag">
          <span className="workspace-icon">S</span>
          <div>
            我的制作空间<small>内部工作台</small>
          </div>
          <Layers3 size={15} />
        </div>
        <p className="nav-label">工作空间</p>
        <nav aria-label="主导航">
          <Link
            href="/"
            className={`nav-item ${pathname === "/" || pathname.startsWith("/projects/") ? "active" : ""}`}
          >
            <FolderKanban size={19} />
            项目中心
          </Link>
          <Link
            href="/settings"
            className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
          >
            <SlidersHorizontal size={19} />
            生产配置
          </Link>
        </nav>
        <div className="sidebar-note">
          <Sparkles size={19} />
          <strong>让故事，成为剧集。</strong>
          <p>从一个灵感开始，把创作连接到每一个镜头。</p>
          <Link href="/settings">
            了解生产方向 <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          本地工作空间 <span>v0.1</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="muted">工作空间</span>
            <span className="breadcrumb-slash">/</span>
            {pathname === "/settings"
              ? "生产配置"
              : pathname.startsWith("/projects/")
                ? "剧集工作台"
                : "项目中心"}
          </div>
          <div className="user-area">
            <span className="local-pill">开发版</span>
            <span className="avatar">创</span>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
