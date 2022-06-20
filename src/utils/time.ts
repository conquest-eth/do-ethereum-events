export function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function days(num: number): number {
  return num * 24 * 3600;
}

export const SECONDS = 1000;
