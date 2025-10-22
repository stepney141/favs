export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const randomWait = (base: number, minMultiplier: number, maxMultiplier: number): number =>
  base * (Math.random() * (maxMultiplier - minMultiplier) + minMultiplier);
