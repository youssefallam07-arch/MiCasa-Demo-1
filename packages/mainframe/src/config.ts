import { prisma } from './db';

// Every business rule reads from here — nothing is hardcoded in the apps or logic.
// Percentages are whole numbers (12 = 12%). Money values are integer piasters.
export const CONFIG_DEFAULTS: Record<string, string> = {
  commission_standard: '12',   // % of accepted bid on standard jobs
  commission_priority: '17',   // % on priority (emergency) jobs
  min_topup: '10000',          // minimum service-credit top-up (piasters = EGP 100)
  postpaid_job_limit: '3',     // completed jobs a new worker gets on debt before prepaid
  cancel_threshold: '3',       // worker cancels / 30d before a strike is applied
  max_strikes: '3',            // strikes before auto-suspension
};

export async function getConfig(): Promise<Record<string, string>> {
  const rows = await prisma.adminConfig.findMany();
  const map: Record<string, string> = { ...CONFIG_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.adminConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function seedConfigDefaults(): Promise<void> {
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    await prisma.adminConfig.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}
