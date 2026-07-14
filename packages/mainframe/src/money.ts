// All money is stored and computed as integer piasters (1 EGP = 100 piasters)
// to avoid floating-point money bugs. Convert only at the UI edge.
export const egpToPst = (egp: number): number => Math.round(egp * 100);
export const pstToEgp = (pst: number): number => pst / 100;
export const fmtEgp = (pst: number): string =>
  (pst / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
