import { expect, test, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAAJElEQVR4nGNICNhBU8QwasGoBaMWjFowasGoBaMWjFowNCwAAMDKOD0arfTFAAAAAElFTkSuQmCC",
  "base64",
);
function tone() {
  const frames = 4000;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    buffer.writeInt16LE(
      Math.round(5000 * Math.sin((i * Math.PI * 2 * 440) / 8000)),
      44 + i * 2,
    );
  return buffer;
}

async function seed(request: APIRequestContext) {
  const project = await (
    await request.post("/api/v1/projects", {
      data: {
        name: `样片工作台-${Date.now()}`,
        production_type: "MANGA",
        profile_id: "manga-standard@1.0",
      },
    })
  ).json();
  const episode = await (
    await request.post(`/api/v1/projects/${project.id}/episodes`, {
      data: { number: 1, title: "天台试播" },
    })
  ).json();
  const scene = await (
    await request.post(`/api/v1/episodes/${episode.id}/scenes`, {
      data: { number: 1, title: "城市天台" },
    })
  ).json();
  for (const n of [1, 2])
    await request.post(`/api/v1/scenes/${scene.id}/shots`, {
      data: {
        number: n,
        title: `样片镜头${n}`,
        dialogue: `第${n}个镜头的对白`,
        duration_seconds: 1,
      },
    });
  return project;
}

test("本地素材绑定、真实视频和字幕、人工确认、下载及创作副本保留素材", async ({
  page,
  request,
}, info) => {
  test.setTimeout(90_000);
  const project = await seed(request);
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("link", { name: "素材与样片", exact: true }).click();
  await page
    .getByLabel("素材来源与用途")
    .fill("程序生成的测试图和提示音，非 AI 输出");
  await page.getByLabel("上传素材文件").setInputFiles({
    name: "测试天台.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.getByText("素材库：1 张图片 · 0 段配音")).toBeVisible();
  await page.getByLabel("素材类型").selectOption("audio");
  await expect(page.getByLabel("上传素材文件")).toBeEnabled();
  await page.getByLabel("上传素材文件").setInputFiles({
    name: "测试提示音.wav",
    mimeType: "audio/wav",
    buffer: tone(),
  });
  await expect(page.getByText("素材库：1 张图片 · 1 段配音")).toBeVisible();
  for (const n of [1, 2]) {
    const row = page.getByRole("article", {
      name: `镜头 ${n} 样片镜头${n}`,
      exact: true,
    });
    await row
      .getByLabel(`镜头 ${n} 图片`)
      .selectOption({ label: "测试天台.png" });
    if (n === 1)
      await row
        .getByLabel(`镜头 ${n} 配音`)
        .selectOption({ label: "测试提示音.wav · 0.50s" });
    const binding = page.waitForResponse(
      (r) =>
        r.url().includes("/media/projects/") && r.request().method() === "PUT",
    );
    await row.getByRole("button", { name: "保存素材绑定" }).click();
    expect((await binding).ok()).toBe(true);
  }
  await expect(page.getByText(/图片已绑定 2 \/ 2/)).toBeVisible();
  await page.getByLabel("样片画幅").selectOption("portrait");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/renders") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "生成本地样片", exact: true }).click();
  const job = await (await response).json();
  const card = page.getByRole("article", {
    name: `样片任务 ${job.id}`,
    exact: true,
  });
  await expect(card.getByText("样片已完成", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const video = card.getByLabel("分镜样片预览");
  await video.evaluate((el: HTMLVideoElement) => el.play());
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.05);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth))
    .toBe(720);
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.videoHeight))
    .toBe(1280);
  await expect
    .poll(() =>
      video.evaluate(
        (el: HTMLVideoElement) =>
          el.querySelector("track")?.track.cues?.length ?? 0,
      ),
    )
    .toBe(2);
  await card
    .getByLabel(`样片 ${job.id} 确认备注`)
    .fill("已检查画面、音轨和字幕");
  await card.getByRole("button", { name: "确认这份样片", exact: true }).click();
  await expect(card.getByText("已人工确认", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/图片已绑定 2 \/ 2/)).toBeVisible();
  await expect(card.getByText("已人工确认", { exact: true })).toBeVisible();
  const videoDownload = page.waitForEvent("download");
  await card.getByRole("link", { name: "下载 MP4 样片" }).click();
  const downloaded = await videoDownload;
  const output = info.outputPath("actual-storyboard.mp4");
  await downloaded.saveAs(output);
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  expect(
    metadata.streams.map((s: { codec_name: string }) => s.codec_name).sort(),
  ).toEqual(["aac", "h264"]);
  expect(Math.abs(Number(metadata.format.duration) - 2)).toBeLessThan(0.15);
  const srtDownload = page.waitForEvent("download");
  await card.getByRole("link", { name: "下载 SRT 字幕" }).click();
  const subtitle = await srtDownload;
  const subtitlePath = info.outputPath("actual-storyboard.srt");
  await subtitle.saveAs(subtitlePath);
  expect(readFileSync(subtitlePath, "utf8")).toContain(
    "00:00:01,000 --> 00:00:02,000",
  );
  await video.evaluate((el: HTMLVideoElement) => el.play());
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.05);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("media-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("media-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByRole("link", { name: "返回剧集工作台" }).click();
  await page.getByRole("link", { name: "进入魔因创作" }).click();
  await expect(
    page.getByRole("button", { name: "另存回主平台" }),
  ).toBeEnabled();
  await page
    .frameLocator('iframe[title="魔因创作模块"]')
    .getByLabel("分镜标题", { exact: true })
    .fill("编辑后保留素材");
  const copyResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/creation/imports") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "另存回主平台" }).click();
  const copy = await (await copyResponse).json();
  await page.goto(`/projects/${copy.id}/media`);
  await expect(page.getByText(/图片已绑定 2 \/ 2/)).toBeVisible();
  await expect(page.getByText("素材库：1 张图片 · 1 段配音")).toBeVisible();
  expect(
    await (
      await request.get(`/api/v1/media/projects/${copy.id}/renders`)
    ).json(),
  ).toEqual([]);
  expect(
    (
      await (
        await request.get(`/api/v1/media/projects/${project.id}/renders`)
      ).json()
    )[0].review_status,
  ).toBe("approved");
});

test("缺少图片和无效素材有明确错误，未创建假样片任务", async ({
  page,
  request,
}) => {
  const project = await seed(request);
  await page.goto(`/projects/${project.id}/media`);
  await page.getByRole("button", { name: "生成本地样片", exact: true }).click();
  await expect(page.locator(".error-panel")).toContainText("缺少图片");
  expect(
    await (
      await request.get(`/api/v1/media/projects/${project.id}/renders`)
    ).json(),
  ).toEqual([]);
  await page.getByLabel("上传素材文件").setInputFiles({
    name: "损坏图片.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator(".error-panel")).toContainText(
    "文件内容须与类型匹配",
  );
  await expect(page.getByText("素材库：0 张图片 · 0 段配音")).toBeVisible();
});
