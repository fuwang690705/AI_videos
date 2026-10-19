import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>页面不存在</h1>
      <p>可以回到项目中心继续创作。</p>
      <Link href="/" className="button primary">
        返回项目中心
      </Link>
    </div>
  );
}
