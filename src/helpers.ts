import { SECONDS, sleep } from './utils/time';

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
