export default async ({ sleep, shot }) => {
  await sleep(4500);
  await shot('menu-4s');
  await sleep(12000);
  await shot('menu-16s');
};
