export function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function days(num: number): number {
  return num * 24 * 3600;
}

export const SECONDS = 1000;

export interface CancelablePromise<T> extends Promise<T> {
  reject?: () => void;
}

export function sleep(ms: number): CancelablePromise<void> {
  let timeout: number | null = null;
  let promiseReject: () => void | undefined;
  const promise: CancelablePromise<void> = new Promise<void>(
    (resolve, reject) => {
      promiseReject = reject;
      timeout = setTimeout(() => {
        promise.reject = undefined;
        resolve();
      }, ms);
    },
  );
  promise.reject = () => {
    if (promise.reject) {
      clearTimeout(timeout);
      promiseReject();
    }
  };
  return promise;
}

export function sleep_then_execute<T>(
  seconds: number,
  func: () => Promise<T>,
  log = false,
): CancelablePromise<T> {
  const miliseconds = seconds * SECONDS;
  if (seconds === 0) {
    return func();
  } else {
    if (log) {
      console.log(`executing in ${miliseconds / 1000}s...`);
    }
    return sleep(miliseconds).then(func);
  }
}

export async function spaceOutGetRequestAtExactInterval(
  fetcher: Fetcher,
  url: string,
  { interval, duration }: { interval: number; duration: number },
): Promise<void> {
  for (let delay = 0; delay <= duration - interval; delay += interval) {
    fetcher.fetch(url);
    await sleep(interval * SECONDS);
  }
}

export async function spaceOutGetRequestOptimisitcaly(
  fetcher: Fetcher,
  url: string,
  { interval, duration }: { interval: number; duration: number },
): Promise<void> {
  const timestamp = Date.now();
  const durationMS = duration * SECONDS;
  const intervalMS = interval * SECONDS;

  // let debug_counter = 0;
  let newTimestamp = timestamp;
  while (newTimestamp < timestamp + durationMS - intervalMS) {
    await fetcher.fetch(url);
    // debug_counter++;
    const now = Date.now();
    const timePassed = now - newTimestamp;
    newTimestamp = now;
    const sleepTime = intervalMS - timePassed;
    if (sleepTime > 0) {
      console.log(
        `was faster than ${interval}s, sleep for ${sleepTime / 1000}s`,
      );
      if (newTimestamp + sleepTime >= timestamp + durationMS - intervalMS) {
        console.log(`time over if sleep ${sleepTime / 1000}s`);
        break;
      }
      await sleep(sleepTime);
      newTimestamp = Date.now();
    } else {
      console.log(
        `was slower than ${interval}s, ${
          (timestamp + durationMS - newTimestamp) / 1000
        }s left`,
      );
    }
    console.log(`time spent: ${(newTimestamp - timestamp) / 1000}s`);
  }
  // console.log({ debug_counter });
}

export async function spaceOutCallOptimisitcaly(
  func: () => Promise<void>,
  { interval, duration }: { interval: number; duration: number },
): Promise<void> {
  const timestamp = Date.now();
  const durationMS = duration * SECONDS;
  const intervalMS = interval * SECONDS;

  // let debug_counter = 0;
  let newTimestamp = timestamp;
  while (newTimestamp < timestamp + durationMS - intervalMS) {
    await func();
    // debug_counter++;
    const now = Date.now();
    const timePassed = now - newTimestamp;
    newTimestamp = now;
    const sleepTime = intervalMS - timePassed;
    if (sleepTime > 0) {
      // console.log(
      //   `was faster than ${interval}s, sleep for ${sleepTime / 1000}s`,
      // );
      await sleep(sleepTime);
      newTimestamp = Date.now();
    } else {
      // console.log(
      //   `was slower than ${interval}s, ${
      //     (timestamp + durationMS - newTimestamp) / 1000
      //   }s left`,
      // );
    }
  }
  // console.log({ debug_counter });
}
