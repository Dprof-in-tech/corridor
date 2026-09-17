// Shared Stellar helpers (client + server safe).
export const isGAddress = (a: string) => /^G[A-Z2-7]{55}$/.test(a);
export const shortG = (g: string) => `${g.slice(0, 6)}…${g.slice(-6)}`;
