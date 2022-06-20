export function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function days(num: number): number {
  return num * 24 * 3600;
}

export const SECONDS = 1000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

export async function sleep_then_execute(
  seconds: number,
  func: () => Promise<any>,
) {
  const miliseconds = seconds * SECONDS;
  if (seconds === 0) {
    await func();
  } else {
    console.log(`sleeping for ${miliseconds}ms`);
    return sleep(miliseconds).then(() => func());
  }
}
