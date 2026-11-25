import { expect, test, type Browser, type Page } from "@playwright/test";

/** 테스트마다 새 브라우저 컨텍스트(쿠키가 따로인 사용자)로 가입해 로그인된 페이지를 돌려준다. */
async function signUp(browser: Browser, nickname: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(`user-${crypto.randomUUID()}@example.com`);
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByLabel("비밀번호").fill("password1234");
  await page.locator("form").getByRole("button", { name: "회원가입" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  return page;
}

/** 글을 쓰고 그 글 화면에 머문다. 글 주소를 돌려준다. */
async function writePost(page: Page, title: string): Promise<string> {
  await page.getByRole("link", { name: "글쓰기" }).click();
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("본문").fill(`${title}의 본문이에요.`);
  await page.locator("form").getByRole("button", { name: "등록" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

test("AUTH-1 가입하면 바로 로그인된 채로 공개 게시판이 열린다", async ({ browser }) => {
  const page = await signUp(browser, "새사용자");

  await expect(page.getByRole("heading", { name: "공개 게시판" })).toBeVisible();
  await expect(page.getByText("새사용자")).toBeVisible();
});

test("COM-5 로그인한 사용자가 쓴 글이 공개 게시판 맨 위에 보인다", async ({ browser }) => {
  const page = await signUp(browser, "글쓴이");
  const title = `첫 글 ${crypto.randomUUID().slice(0, 8)}`;
  await writePost(page, title);

  await page.getByRole("link", { name: "커뮤니티" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("NOTI-6 다른 사용자가 내 글에 댓글을 달면 열어 둔 화면의 알림 종에 바로 뜨고, 모두 읽음으로 지울 수 있다", async ({
  browser,
}) => {
  const author = await signUp(browser, "작성자");
  const title = `알림 확인 ${crypto.randomUUID().slice(0, 8)}`;
  const postUrl = await writePost(author, title);
  // 작성자는 새로고침 없이 이 화면에 머문다. 알림은 SSE로만 와야 한다.

  const commenter = await signUp(browser, "댓글러");
  await commenter.goto(postUrl);
  await commenter.getByPlaceholder(/댓글/).fill("좋은 글이에요");
  await commenter.getByRole("button", { name: "댓글 달기" }).click();
  await expect(commenter.getByText("좋은 글이에요")).toBeVisible();

  const notificationLine = `댓글러님이 “${title}” 글에 댓글을 달았어요`;
  await expect(author.getByRole("status")).toHaveText(notificationLine);
  const bell = author.getByRole("button", { name: "알림, 읽지 않음 1개" });
  await expect(bell).toBeVisible();

  await bell.click();
  await expect(author.getByRole("button", { name: notificationLine })).toBeVisible();
  await author.getByRole("button", { name: "모두 읽음" }).click();
  await expect(author.getByRole("button", { name: "알림", exact: true })).toBeVisible();
});
