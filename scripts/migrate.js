#!/usr/bin/env node
// One-time data migration: Google Sheets export -> Cloudflare D1.
// Generates SQL from the Apps Script export JSON, then shells out to
// `wrangler d1 execute --remote --file=<generated.sql>` — no DB driver,
// no connection string, no password to copy/paste (that's the whole
// point of moving off Supabase: wrangler already authenticates with
// $env:CLOUDFLARE_API_TOKEN / $env:CLOUDFLARE_ACCOUNT_ID, the same env
// vars deploy-cloudflare.ps1 already uses).
//
// Usage:
//   node scripts/migrate.js --db dispatch-center-db \
//     --export-url "https://script.google.com/.../exec?action=exportAllForMigration&secret=XXXX"
// or, if you already downloaded the export to a file:
//   node scripts/migrate.js --db dispatch-center-db --file export.json
//
// Safe to re-run for every table that has a real ID column (uses INSERT OR
// REPLACE keyed on the primary key, so a fresher export just re-syncs
// rows). Log-style tables with no natural ID (RouteStops keys on
// route_id+stop_order so it's also safe; GPSLogs/ActivityLogs/
// CartrackVehicles/CartrackLogs use autoincrement ids and will duplicate on
// a second run — for those, only run this once per target database.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { toDb } = require('../lib/serialize');

const TABLE_MAP = {
  Customers: 'customers',
  Employees: 'employees',
  Vehicles: 'vehicles',
  ExternalProviders: 'external_providers',
  ExternalVehicles: 'external_vehicles',
  Deliveries: 'deliveries',
  Routes: 'routes',
  RouteStops: 'route_stops',
  Expenses: 'expenses',
  ExpenseClaims: 'expense_claims',
  Settings: 'settings',
  ActivityLogs: 'activity_logs',
  GPSLogs: 'gps_logs',
  CartrackVehicles: 'cartrack_vehicles',
  CartrackLogs: 'cartrack_logs',
};

const ID_FIELD = {
  Customers: 'CustomerID', Employees: 'EmployeeID', Vehicles: 'VehicleID',
  ExternalProviders: 'ProviderID', ExternalVehicles: 'ExternalVehicleID',
  Deliveries: 'DeliveryID', Routes: 'RouteID', Expenses: 'ExpenseID',
  ExpenseClaims: 'ClaimID', Settings: 'Key',
};

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1];
  }
  return args;
}

async function loadExport(args) {
  if (args.file) return JSON.parse(fs.readFileSync(args.file, 'utf8'));
  if (args['export-url']) {
    const res = await fetch(args['export-url']);
    const json = await res.json();
    if (!json.ok) throw new Error('export endpoint returned an error: ' + json.error);
    return json.data;
  }
  throw new Error('Pass --file <path> or --export-url <url>');
}

// Flags rows that are probably accidental duplicates (same name+phone created
// close together) instead of silently importing both — this is exactly how
// the known EMP-1013/EMP-1014 ("M0") duplicate gets caught and surfaced
// rather than carried into the new database.
function findNearDuplicates(rows, nameField, phoneField) {
  const groups = {};
  for (const r of rows) {
    const key = `${(r[nameField] || '').trim().toLowerCase()}|${(r[phoneField] || '').trim()}`;
    if (!key.trim().replace('|', '')) continue;
    (groups[key] = groups[key] || []).push(r);
  }
  return Object.values(groups).filter((g) => g.length > 1);
}

function sqlVal(v) {
  if (v === undefined || v === null || v === '') return 'null';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertStatements(table, rows) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `(${cols.map((c) => sqlVal(r[c])).join(',')})`).join(',\n  ');
  return [`insert or replace into ${table} (${cols.join(',')}) values\n  ${values};`];
}

function seedIdCountersSql(exportData) {
  const maxByPrefix = {};
  for (const [sheetName, idField] of Object.entries(ID_FIELD)) {
    if (idField === 'Key') continue; // Settings has no numeric-suffix ID scheme
    for (const row of exportData[sheetName] || []) {
      const m = String(row[idField] || '').match(/^([A-Za-z]+)-(\d+)$/);
      if (!m) continue;
      const [, prefix, numStr] = m;
      maxByPrefix[prefix] = Math.max(maxByPrefix[prefix] || 0, parseInt(numStr, 10));
    }
  }
  const stmts = [];
  for (const [prefix, max] of Object.entries(maxByPrefix)) {
    stmts.push(`insert into id_counters (prefix, next_value) values ('${prefix}', ${max + 1}) on conflict(prefix) do update set next_value = excluded.next_value;`);
    console.log(`  id_counters['${prefix}'] -> next_value = ${max + 1}`);
  }
  return stmts;
}

function buildTableInserts(sheetName, table, rows) {
  if (!rows || !rows.length) { console.log(`  ${sheetName}: 0 rows, skipped`); return []; }
  const mapped = rows.map((r) => toDb(table, r));
  console.log(`  ${sheetName}: ${rows.length} rows -> ${table}`);
  // chunk to keep individual statements a sane size
  const CHUNK = 200;
  const stmts = [];
  for (let i = 0; i < mapped.length; i += CHUNK) {
    stmts.push(...insertStatements(table, mapped.slice(i, i + CHUNK)));
  }
  return stmts;
}

function buildEmployeeCredentialsInserts(employees) {
  const rows = (employees || []).filter((e) => e.PINHash);
  if (!rows.length) { console.log('  employee_credentials: 0 rows, skipped'); return []; }
  const now = new Date().toISOString();
  console.log(`  employee_credentials: ${rows.length} rows`);
  return insertStatements('employee_credentials', rows.map((e) => ({ employee_id: e.EmployeeID, pin_hash: e.PINHash, updated_at: now })));
}

function runWranglerFile(dbName, sqlPath) {
  console.log(`\nRunning wrangler d1 execute ${dbName} --file=${sqlPath} ...`);
  execFileSync('npx', ['--yes', 'wrangler@latest', 'd1', 'execute', dbName, '--remote', `--file=${sqlPath}`], { stdio: 'inherit' });
}

async function main() {
  const args = parseArgs();
  const dbName = args.db;
  if (!dbName) throw new Error('Pass --db <d1-database-name> (matches database_name in wrangler.toml)');

  console.log('Loading export...');
  const exportData = await loadExport(args);

  console.log('\nChecking for near-duplicate rows (same name+phone) before importing...');
  const dupEmployees = findNearDuplicates(exportData.Employees || [], 'EmployeeName', 'Phone');
  const dupCustomers = findNearDuplicates(exportData.Customers || [], 'CustomerName', 'Phone');
  if (dupEmployees.length || dupCustomers.length) {
    console.log('\n⚠️  Possible duplicates found — review before continuing:');
    for (const g of dupEmployees) console.log('  Employees:', g.map((r) => `${r.EmployeeID} (${r.EmployeeName}, ${r.Phone})`).join(' vs '));
    for (const g of dupCustomers) console.log('  Customers:', g.map((r) => `${r.CustomerID} (${r.CustomerName}, ${r.Phone})`).join(' vs '));
    if (!args.force) {
      console.log('\nRe-run with --force to import anyway (both rows will be migrated as-is),');
      console.log('or fix/remove the duplicate in the source Google Sheet first, re-export, and re-run.');
      process.exit(1);
    }
    console.log('\n--force set, importing duplicates as-is.');
  } else {
    console.log('  none found.');
  }

  console.log('\nBuilding SQL...');
  const stmts = [];
  stmts.push('pragma defer_foreign_keys = true;');
  console.log('Seeding id_counters from existing max IDs...');
  stmts.push(...seedIdCountersSql(exportData));
  for (const [sheetName, table] of Object.entries(TABLE_MAP)) {
    stmts.push(...buildTableInserts(sheetName, table, exportData[sheetName]));
  }
  stmts.push(...buildEmployeeCredentialsInserts(exportData.Employees));

  const sqlPath = path.join(os.tmpdir(), `dispatch-center-migrate-${Date.now()}.sql`);
  fs.writeFileSync(sqlPath, stmts.join('\n\n'), 'utf8');
  console.log(`\nWrote ${stmts.length} statements to ${sqlPath} (${(fs.statSync(sqlPath).size / 1024).toFixed(1)} KB)`);

  runWranglerFile(dbName, sqlPath);

  console.log('\nDone. Spot-check row counts against the Sheets export before cutting over:');
  console.log(`  npx wrangler d1 execute ${dbName} --remote --command "select (select count(*) from customers) customers, (select count(*) from employees) employees, (select count(*) from deliveries) deliveries, (select count(*) from routes) routes"`);
}

main().catch((err) => { console.error('\nMigration failed:', err.message); process.exit(1); });
