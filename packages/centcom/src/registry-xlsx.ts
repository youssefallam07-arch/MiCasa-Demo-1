// Live account-registry workbook. Built fresh from the database on every call,
// so any copy is a current snapshot — nothing is cached or hand-maintained.
//
// NOTE ON PASSWORDS: regular-user passwords are stored only as one-way bcrypt hashes
// and are deliberately NOT in this workbook. The "Owners & Moderators" sheet shows
// admin/staff passwords the OWNER set — read from the gitignored staff-credentials
// file (never the DB, never git, admin accounts only). Regular users are never shown.
import ExcelJS from 'exceljs';
import { prisma, admin, getStaffCredentials, listAuditEvents } from './core';

const FONT = 'Arial';
const pst = (v: number | null | undefined) => (v == null ? null : v / 100); // piasters -> EGP number
const EGP_FMT = '#,##0.00 "EGP"';

function styleHeader(row: ExcelJS.Row) {
  row.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C1424' } };
  row.alignment = { vertical: 'middle' };
  row.height = 20;
}

function autofit(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value == null ? 0 : String(cell.value.valueOf()).length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 48);
  });
}

function addTable(ws: ExcelJS.Worksheet, columns: { header: string; key: string; fmt?: string }[], rows: any[]) {
  ws.columns = columns.map((c) => ({ key: c.key, header: c.header }));
  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.font = { name: FONT, size: 10 };
  });
  columns.forEach((c, i) => {
    if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt;
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  autofit(ws);
}

export async function buildRegistryWorkbook(): Promise<ExcelJS.Workbook> {
  const [accounts, ov] = await Promise.all([admin.allAccounts(), admin.platformOverview()]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MiCasa CENTCOM';
  wb.created = new Date();

  // ---- Overview ----
  const o = wb.addWorksheet('Overview', { properties: { tabColor: { argb: 'FF4D9FFF' } } });
  o.mergeCells('A1:B1');
  o.getCell('A1').value = 'MiCasa — Platform Registry';
  o.getCell('A1').font = { name: FONT, bold: true, size: 16 };
  o.getCell('A2').value = 'Generated';
  o.getCell('B2').value = new Date();
  o.getCell('B2').numFmt = 'yyyy-mm-dd hh:mm:ss';
  const stats: [string, number][] = [
    ['Total accounts', ov.totalAccounts], ['Customers', ov.customers], ['Workers', ov.workers],
    ['Admins', ov.admins], ['Jobs', ov.jobs], ['Completed jobs', ov.completed], ['Open jobs', ov.open],
    ['Awaiting vetting', ov.pendingVetting],
  ];
  let r = 4;
  for (const [label, val] of stats) {
    o.getCell(`A${r}`).value = label;
    o.getCell(`A${r}`).font = { name: FONT, bold: true, size: 11 };
    o.getCell(`B${r}`).value = val;
    o.getCell(`B${r}`).font = { name: FONT, size: 11 };
    r++;
  }
  o.getCell(`A${r}`).value = 'Commission captured';
  o.getCell(`A${r}`).font = { name: FONT, bold: true, size: 11 };
  o.getCell(`B${r}`).value = pst(ov.commissionCapturedPst);
  o.getCell(`B${r}`).numFmt = EGP_FMT;
  o.getColumn(1).width = 22; o.getColumn(2).width = 26;

  // ---- Customers ----
  addTable(
    wb.addWorksheet('Customers', { properties: { tabColor: { argb: 'FF4D9FFF' } } }),
    [
      { header: 'Name', key: 'name' }, { header: 'Username', key: 'username' },
      { header: 'Phone', key: 'phone' }, { header: 'Jobs posted', key: 'jobsPosted' },
      { header: 'Created', key: 'createdAt', fmt: 'yyyy-mm-dd hh:mm' }, { header: 'User ID', key: 'id' },
    ],
    accounts.filter((a) => a.role === 'customer').map((a) => ({
      name: a.name, username: a.username, phone: a.phone ?? '—', jobsPosted: a.jobsPosted,
      createdAt: new Date(a.createdAt), id: a.id,
    })),
  );

  // ---- Workers ----
  addTable(
    wb.addWorksheet('Workers', { properties: { tabColor: { argb: 'FF3DD68C' } } }),
    [
      { header: 'Name', key: 'name' }, { header: 'Username', key: 'username' }, { header: 'Phone', key: 'phone' },
      { header: 'Trade', key: 'trade' }, { header: 'Zone', key: 'zone' },
      { header: 'Verification', key: 'verificationStatus' }, { header: 'Wallet mode', key: 'walletMode' },
      { header: 'Suspended', key: 'suspended' }, { header: 'Jobs done', key: 'jobsCompleted' },
      { header: 'Bids made', key: 'bidsMade' },
      { header: 'Available', key: 'available', fmt: EGP_FMT }, { header: 'Held', key: 'held', fmt: EGP_FMT },
      { header: 'Debt', key: 'debt', fmt: EGP_FMT },
      { header: 'Created', key: 'createdAt', fmt: 'yyyy-mm-dd hh:mm' }, { header: 'User ID', key: 'id' },
    ],
    accounts.filter((a) => a.role === 'worker').map((a) => ({
      name: a.name, username: a.username, phone: a.phone ?? '—', trade: a.trade, zone: a.zone,
      verificationStatus: a.verificationStatus, walletMode: a.walletMode,
      suspended: a.suspended ? 'yes' : 'no', jobsCompleted: a.jobsCompleted ?? 0, bidsMade: a.bidsMade,
      available: pst(a.availablePst), held: pst(a.heldPst), debt: pst(a.debtPst),
      createdAt: new Date(a.createdAt), id: a.id,
    })),
  );

  // ---- Owners & Moderators (admin accounts, WITH passwords the owner set) ----
  const staff = getStaffCredentials();
  const om = wb.addWorksheet('Owners & Moderators', { properties: { tabColor: { argb: 'FFD9B36A' } } });
  addTable(
    om,
    [
      { header: 'Role', key: 'role' }, { header: 'Name', key: 'name' }, { header: 'Username', key: 'username' },
      { header: 'Password', key: 'password' }, { header: 'Phone', key: 'phone' },
      { header: 'Password set', key: 'setAt', fmt: 'yyyy-mm-dd hh:mm' },
      { header: 'Created', key: 'createdAt', fmt: 'yyyy-mm-dd hh:mm' }, { header: 'User ID', key: 'id' },
    ],
    accounts.filter((a) => a.role === 'admin').map((a) => {
      const cred = staff[a.id];
      const ownerName = process.env.ADMIN_USERNAME || 'youssef_hq';
      return {
        role: a.username === ownerName ? 'owner' : 'moderator', name: a.name, username: a.username,
        password: cred ? cred.password : '(not recorded — use Set-pw to capture it)',
        phone: a.phone ?? '—', setAt: cred ? new Date(cred.setAt) : null,
        createdAt: new Date(a.createdAt), id: a.id,
      };
    }),
  );
  const omNote = om.addRow({});
  om.mergeCells(`A${omNote.number}:H${omNote.number}`);
  om.getCell(`A${omNote.number}`).value =
    'Passwords here are staff credentials the OWNER set, read from a gitignored owner-only file (never the database, never git). Regular customer/worker passwords are one-way hashed and can never be shown. Keep this file private.';
  om.getCell(`A${omNote.number}`).font = { name: FONT, italic: true, size: 9, color: { argb: 'FFB98F3E' } };
  om.getCell(`A${omNote.number}`).alignment = { wrapText: true };
  om.getRow(omNote.number).height = 42;

  // ---- Demo logins (reference: only non-secret demo passwords) ----
  const d = wb.addWorksheet('Demo logins', { properties: { tabColor: { argb: 'FF7E92B4' } } });
  addTable(
    d,
    [{ header: 'Role', key: 'role' }, { header: 'Username', key: 'username' }, { header: 'Password', key: 'password' }, { header: 'Notes', key: 'notes' }],
    [
      { role: 'customer', username: 'mona', password: 'password123', notes: 'demo seed account' },
      { role: 'customer', username: 'khaled', password: 'password123', notes: 'demo seed account' },
      { role: 'worker', username: 'ahmed', password: 'password123', notes: 'approved · prepaid · funded' },
      { role: 'worker', username: 'mahmoud', password: 'password123', notes: 'approved · postpaid grace' },
      { role: 'worker', username: 'saeed', password: 'password123', notes: 'pending verification' },
      { role: 'admin', username: 'youssef_hq', password: '(see docs/FIRST_LOGIN.md)', notes: 'real secret — not exported' },
    ],
  );
  const note = d.addRow({});
  d.mergeCells(`A${note.number}:D${note.number}`);
  d.getCell(`A${note.number}`).value =
    'Real user passwords are stored as one-way bcrypt hashes and cannot be exported. Only these documented, non-secret demo passwords are listed. IP addresses are not tracked by the platform.';
  d.getCell(`A${note.number}`).font = { name: FONT, italic: true, size: 9, color: { argb: 'FF7E92B4' } };
  d.getCell(`A${note.number}`).alignment = { wrapText: true };
  d.getRow(note.number).height = 40;

  // ---- Audit Log (every recorded change while online) ----
  const events = await listAuditEvents(5000);
  addTable(
    wb.addWorksheet('Audit Log', { properties: { tabColor: { argb: 'FF3DD68C' } } }),
    [
      { header: 'When', key: 'at', fmt: 'yyyy-mm-dd hh:mm:ss' }, { header: 'Actor', key: 'actor' },
      { header: 'Action', key: 'action' }, { header: 'Target', key: 'target' }, { header: 'Detail', key: 'detail' },
    ],
    events.map((e) => ({ at: new Date(e.at), actor: e.actor, action: e.action, target: e.target, detail: e.detail })),
  );

  return wb;
}

// Standalone: write docs/registry.xlsx from the live DB.
export async function writeRegistryFile(outPath: string) {
  const wb = await buildRegistryWorkbook();
  await wb.xlsx.writeFile(outPath);
  await prisma.$disconnect();
  return outPath;
}
