import { expect, test } from "@playwright/test";

test("从创建项目到编辑分镜，刷新后数据保留", async ({ page }, testInfo) => {
  const name = `雾城来信-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByLabel("项目名称").fill(name);
  await page
    .getByLabel("故事简介")
    .fill("一封来自未来的信，改变了一座城的命运。");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name }) })
    .click();
  await expect(page.getByRole("heading", { name: `${name}.` })).toBeVisible();

  await page.getByRole("button", { name: "新建第一集" }).click();
  await page.getByLabel("剧集标题").fill("第一封信");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建剧集" })
    .click();
  await expect(page.getByRole("heading", { name: "第一封信" })).toBeVisible();

  await page
    .getByRole("button", { name: "新建场景", exact: true })
    .first()
    .click();
  await page.getByLabel("场景标题").fill("城市天台");
  await page.getByLabel("地点").fill("城市天台 · 夜");
  await page.getByRole("button", { name: "创建场景" }).click();
  await page.getByRole("button", { name: "新建分镜", exact: true }).click();
  await page.getByLabel("镜头标题").fill("信封特写");
  await page.getByLabel("画面描述").fill("雨落在旧信封上，镜头缓慢推近。");
  await page.getByLabel("对白", { exact: true }).fill("你终于来了。");
  await page.getByRole("button", { name: "创建分镜", exact: true }).click();
  await expect(page.getByRole("heading", { name: "信封特写" })).toBeVisible();

  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("镜头标题").fill("雨夜信封");
  await page.getByLabel("目标时长（秒）").fill("8");
  await page.getByRole("button", { name: "保存分镜" }).click();
  await expect(page.getByText("草稿 · r2")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "雨夜信封" })).toBeVisible();
  await expect(page.getByText("8s", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("workspace-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "雨夜信封" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workspace-mobile.png"),
    fullPage: true,
  });
});

test("生产配置明确显示生成尚未接入", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("生成引擎尚未接入", { exact: true })).toHaveCount(
    3,
  );
});
