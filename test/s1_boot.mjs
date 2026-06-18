/* scenario: boot → menu → sandbox → space center */
export default async ({ page, sleep, shot, state, click, log }) => {
  await sleep(4500);
  await shot('01-menu');
  await state();
  /* start sandbox */
  await page.click('#btn-sandbox');
  await sleep(1200);
  /* possible confirm dialog */
  const confirmBtn = await page.$$('.dlg-foot .btn.acc');
  if (confirmBtn.length) { await confirmBtn[0].click(); await sleep(800); }
  await sleep(5500);
  await shot('02-spacecenter');
  await state();
};
