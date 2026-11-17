export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
