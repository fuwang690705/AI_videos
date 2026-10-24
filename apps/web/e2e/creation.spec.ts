import { expect, test, type APIRequestContext } from "@playwright/test";

async function seed(request: APIRequestContext, productionType = "MANGA") {
  const profiles = await (
    await request.get("/api/v1/production-profiles")
  ).json();
  const profile = profiles.find(
    (p: { production_type: string }) => p.production_type === productionType,
  );
  const project = await (
    await request.post("/api/v1/projects", {
      data: {
        name: `创作桥接-${productionType}-${Date.now()}`,
        production_type: productionType,
        profile_id: profile.id,
        synopsis: "跨模块测试故事",
      },
    })
  ).json();
  for (const epNumber of [2, 4]) {
    const episode = await (
      await request.post(`/api/v1/projects/${project.id}/episodes`, {
        data: { number: epNumber, title: `剧集${epNumber}` },
      })
    ).json();
    for (const scNumber of [3, 6]) {
      const scene = await (
        await request.post(`/api/v1/episodes/${episode.id}/scenes`, {
          data: {
            number: scNumber,
            title: `场景${epNumber}-${scNumber}`,
            location: "天台",
          },
        })
      ).json();
      await request.post(`/api/v1/scenes/${scene.id}/shots`, {
        data: {
          number: 1,
          title: `镜头${epNumber}-${scNumber}`,
          dialogue: "原稿对白",
          duration_seconds: 7,
        },
      });
    }
  }
  return project;
}

test("三个方向均可传入魔因、编辑、恢复草稿并另存，原项目保留", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const direction of ["MANGA", "MEME_ANIMATION", "REALISTIC"]) {
    const original = await seed(request, direction);
    await page.goto(`/projects/${original.id}`);
    await page.getByRole("link", { name: "进入魔因创作" }).click();
    const save = page.getByRole("button", { name: "另存回主平台" });
    await expect(save).toBeEnabled();
    const frame = page.frameLocator('iframe[title="魔因创作模块"]');
    await expect(
      frame.getByRole("heading", { name: original.name }),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", { name: "1. 镜头4-6 7s" }),
    ).toBeVisible();
    await frame.getByLabel("分镜标题", { exact: true }).fill("回存镜头");
    await frame
      .getByLabel("画面描述", { exact: true })
      .fill("雨落信封，镜头推近");
    await frame.getByLabel("时长", { exact: true }).fill("9");
    const panel = frame.getByRole("region", { name: "魔因镜头属性" });
    await panel.getByRole("button", { name: "编辑镜头属性" }).click();
    await panel.locator("textarea").nth(0).fill("角色拿起信封");
    await panel.locator("textarea").nth(1).fill(`魔因修改对白-${direction}`);
    // Never silently discard an uncommitted upstream editor form.
    await save.click();
    await expect(page.locator(".error-panel")).toContainText("请先保存或取消");
    await panel.getByRole("button", { name: "保存镜头属性" }).click();
    await expect(panel.getByText(`"魔因修改对白-${direction}"`)).toBeVisible();
    await page.reload();
    await expect(save).toBeEnabled();
    await expect(frame.getByLabel("分镜标题", { exact: true })).toHaveValue(
      "回存镜头",
    );
    await expect(panel.getByText(`"魔因修改对白-${direction}"`)).toBeVisible();
    await page.getByLabel("副本名称").fill(`魔因副本-${direction}`);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/creation/imports") &&
        response.request().method() === "POST",
    );
    await save.click();
    const copy = await (await responsePromise).json();
    await expect(
      page.getByRole("link", { name: "打开已保存副本 →" }),
    ).toBeVisible();
    expect(copy.production_type).toBe(direction);
    expect(copy.profile_id).toBe(original.profile_id);
    const snapshot = await (
      await request.get(`/api/v1/creation/projects/${copy.id}/snapshot`)
    ).json();
    expect(
      snapshot.episodes.map((ep: { number: number }) => ep.number),
    ).toEqual([2, 4]);
    const shot = snapshot.episodes[0].scenes[0].shots[0];
    expect(shot).toMatchObject({
      title: "回存镜头",
      visual_description: "雨落信封，镜头推近",
      duration_seconds: 9,
      dialogue: `魔因修改对白-${direction}`,
      details: { action_summary: "角色拿起信封" },
    });
    expect(snapshot.episodes[1].scenes[1].shots[0].dialogue).toBe("原稿对白");
    const source = await (
      await request.get(`/api/v1/creation/projects/${original.id}/snapshot`)
    ).json();
    expect(source.episodes[0].scenes[0].shots[0].title).toBe("镜头2-3");
    if (direction === "MANGA") {
      await page.screenshot({
        path: info.outputPath("creator-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await frame
          .locator("html")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("creator-mobile.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.getByRole("link", { name: "打开已保存副本 →" }).click();
    await expect(page).toHaveURL(`/projects/${copy.id}`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "回存镜头", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "进入魔因创作" }).click();
    await expect(save).toBeEnabled();
    await expect(
      panel.getByText("角色拿起信封", { exact: true }),
    ).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
});

test("校验失败不写入；响应丢失后重试不重复创建；伪造桥接消息无效", async ({
  page,
  request,
}) => {
  const original = await seed(request);
  await page.goto(`/projects/${original.id}/create`);
  const save = page.getByRole("button", { name: "另存回主平台" });
  await expect(save).toBeEnabled();
  const frame = page.frameLocator('iframe[title="魔因创作模块"]');
  const before = await (await request.get("/api/v1/overview")).json();
  await page.evaluate(() =>
    window.postMessage(
      {
        channel: "studio-moyin",
        version: 1,
        type: "EXPORTED",
        requestId: "forged",
        payload: {},
      },
      location.origin,
    ),
  );
  await frame.getByLabel("时长", { exact: true }).fill("2.5");
  await save.click();
  await expect(page.locator(".error-panel")).toContainText("整数秒时长");
  expect(await (await request.get("/api/v1/overview")).json()).toEqual(before);
  await frame.getByLabel("时长", { exact: true }).fill("8");
  await frame.getByRole("button", { name: "＋ 添加分镜" }).first().click();
  await frame.getByLabel("分镜标题", { exact: true }).fill("将删除的镜头");
  await frame.getByRole("button", { name: "删除分镜", exact: true }).click();
  await frame
    .getByRole("alertdialog")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(frame.getByRole("button", { name: /将删除的镜头/ })).toHaveCount(
    0,
  );
  await frame.getByRole("button", { name: "＋ 添加分镜" }).first().click();
  await frame.getByLabel("分镜标题", { exact: true }).fill("新增的镜头");
  await page.getByLabel("副本名称").fill("响应丢失后恢复的副本");
  await page.route("**/api/v1/creation/imports", async (route) => {
    await route.fetch();
    await route.abort("connectionfailed");
  });
  await save.click();
  await expect(page.locator(".error-panel")).toBeVisible();
  expect((await (await request.get("/api/v1/overview")).json()).projects).toBe(
    before.projects + 1,
  );
  await page.unroute("**/api/v1/creation/imports");
  await page.reload();
  await expect(save).toBeEnabled();
  await expect(page.getByLabel("副本名称")).toHaveValue("响应丢失后恢复的副本");
  await save.click();
  await expect(
    page.getByRole("link", { name: "打开已保存副本 →" }),
  ).toBeVisible();
  expect((await (await request.get("/api/v1/overview")).json()).projects).toBe(
    before.projects + 1,
  );
  await page.getByRole("link", { name: "打开已保存副本 →" }).click();
  await expect(
    page.getByRole("heading", { name: "新增的镜头", exact: true }),
  ).toBeVisible();
});

test("创作服务不可用时提示启动命令，恢复后可重新连接", async ({
  page,
  request,
}) => {
  test.setTimeout(45_000);
  const original = await seed(request);
  await page.route("http://127.0.0.1:5174/**", (route) => route.abort());
  await page.goto(`/projects/${original.id}/create`);
  await expect(page.locator(".error-panel")).toContainText(
    "npm run dev:local",
    { timeout: 25_000 },
  );
  await expect(
    page.getByRole("button", { name: "另存回主平台" }),
  ).toBeDisabled();
  await page.unroute("http://127.0.0.1:5174/**");
  await page.getByRole("button", { name: "重新连接" }).click();
  await expect(
    page.getByRole("button", { name: "另存回主平台" }),
  ).toBeEnabled();
});
