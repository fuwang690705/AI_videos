import { expect, test, type APIRequestContext } from "@playwright/test";

const script = `第1集：雨夜来信
简介：一封来自未来的信。
场景1：城市天台
地点：天台 · 夜
分镜1：信封特写
画面：镜头缓慢推近。
  雨水沿信封滑落。
动作：主人公拿起信封。
对白：你终于来了。
时长：6
景别：CU
镜头运动：dolly-in
分镜2：抬头
画面：主人公望向远处。
时长：5`;

async function seed(request: APIRequestContext) {
  const response = await request.post("/api/v1/projects", {
    data: {
      name: `故事工作台-${Date.now()}`,
      production_type: "MANGA",
      profile_id: "manga-standard@1.0",
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

test("故事文本导入、设定持久化、目录预览与魔因编辑回存串联", async ({
  page,
  request,
}, info) => {
  test.setTimeout(60_000);
  const project = await seed(request);
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("link", { name: "故事与设定", exact: true }).click();
  await page
    .getByLabel("导入故事文本")
    .setInputFiles({
      name: "试播剧本.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(script, "utf8"),
    });
  await expect(
    page.getByRole("textbox", { name: "故事原文", exact: true }),
  ).toHaveValue(script);
  await page.getByLabel("故事大纲", { exact: true }).fill("一封信改变计划");
  await page
    .getByLabel("世界观与风格", { exact: true })
    .fill("现代悬疑，轻快节奏");
  await page.getByLabel("人物设定", { exact: true }).fill("主角穿浅色风衣");
  await page
    .getByLabel("连续性约束", { exact: true })
    .fill("第一集不公开信件来源");
  await page.getByRole("button", { name: "保存故事草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("r1 已保存");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "故事原文", exact: true }),
  ).toHaveValue(script);
  await expect(page.getByLabel("人物设定", { exact: true })).toHaveValue(
    "主角穿浅色风衣",
  );
  await page
    .getByRole("button", { name: "保存并预览目录", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "剧本目录预览" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 集 · 1 场景 · 2 分镜", { exact: true }),
  ).toBeVisible();
  expect(
    await (await request.get(`/api/v1/projects/${project.id}/episodes`)).json(),
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("story-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("story-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  const importResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/creation/imports") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "确认并另存为项目", exact: true })
    .click();
  const copy = await (await importResponse).json();
  await expect(
    page.getByRole("link", { name: "继续编辑分镜 →" }),
  ).toBeVisible();
  expect(copy.id).not.toBe(project.id);
  await page.getByRole("link", { name: "继续编辑分镜 →" }).click();
  await expect(
    page.getByRole("button", { name: "另存回主平台" }),
  ).toBeEnabled();
  const panel = page
    .frameLocator('iframe[title="魔因创作模块"]')
    .getByRole("region", { name: "魔因镜头属性" });
  await panel.getByRole("button", { name: "编辑镜头属性" }).click();
  await panel.locator("textarea").nth(1).fill("完成故事导入后的再次编辑");
  await panel.getByRole("button", { name: "保存镜头属性" }).click();
  const secondResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/creation/imports") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "另存回主平台" }).click();
  const final = await (await secondResponse).json();
  const story = await (
    await request.get(`/api/v1/story/projects/${final.id}`)
  ).json();
  expect(story.source_text).toBe(script);
  expect(story.continuity_notes).toBe("第一集不公开信件来源");
  const snapshot = await (
    await request.get(`/api/v1/creation/projects/${final.id}/snapshot`)
  ).json();
  expect(snapshot.episodes[0].scenes[0].shots[0].dialogue).toBe(
    "完成故事导入后的再次编辑",
  );
  await page.screenshot({
    path: info.outputPath("creator-unified.png"),
    fullPage: true,
  });
});

test("普通小说保存不伪装自动拆解；并发保存不覆盖新草稿", async ({
  page,
  context,
  request,
}) => {
  const project = await seed(request);
  const url = `/projects/${project.id}/story`;
  const prose = "她在雨夜收到一封信，信封上写着明天的日期。";
  await page.goto(url);
  await page
    .getByRole("textbox", { name: "故事原文", exact: true })
    .fill(prose);
  await page.getByRole("button", { name: "保存并预览目录" }).click();
  await expect(page.locator(".error-panel")).toBeVisible();
  await expect(page.getByRole("region", { name: "剧本目录预览" })).toHaveCount(
    0,
  );
  expect(
    await (await request.get(`/api/v1/projects/${project.id}/episodes`)).json(),
  ).toEqual([]);
  const other = await context.newPage();
  await other.goto(url);
  await expect(
    other.getByRole("textbox", { name: "故事原文", exact: true }),
  ).toHaveValue(prose);
  await page.getByLabel("故事大纲", { exact: true }).fill("新设定");
  await page.getByRole("button", { name: "保存故事草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("r2 已保存");
  await other.getByLabel("故事大纲", { exact: true }).fill("过期的本地设定");
  await other
    .getByRole("button", { name: "保存故事草稿", exact: true })
    .click();
  await expect(other.locator(".error-panel")).toContainText("已被修改");
  await expect(other.getByLabel("故事大纲", { exact: true })).toHaveValue(
    "过期的本地设定",
  );
  expect(
    (await (await request.get(`/api/v1/story/projects/${project.id}`)).json())
      .outline,
  ).toBe("新设定");
  await other.close();
});
