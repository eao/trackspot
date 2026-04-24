const path = require('path');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(__dirname, '..', process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'albums.db');

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function timestampForFile(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

function buildOutputPath(rawArg) {
  if (!rawArg) {
    return path.join(DATA_DIR, `albums-db-dump-${timestampForFile()}.json`);
  }

  return path.isAbsolute(rawArg)
    ? rawArg
    : path.resolve(process.cwd(), rawArg);
}

function exportDatabase(outputPath) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  try {
    const tables = db.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all();

    const dump = {
      exportedAt: new Date().toISOString(),
      databasePath: DB_PATH,
      tables: {},
    };

    for (const table of tables) {
      const tableName = table.name;
      const quotedTableName = quoteIdentifier(tableName);
      const columns = db.prepare(`PRAGMA table_info(${quotedTableName})`).all();
      const rows = db.prepare(`SELECT * FROM ${quotedTableName}`).all();

      dump.tables[tableName] = {
        createSql: table.sql,
        columns,
        rowCount: rows.length,
        rows,
      };
    }

    require('fs').mkdirSync(path.dirname(outputPath), { recursive: true });
    require('fs').writeFileSync(outputPath, JSON.stringify(dump, null, 2));
    return dump;
  } finally {
    db.close();
  }
}

function main() {
  const outputPath = buildOutputPath(process.argv[2]);
  const dump = exportDatabase(outputPath);
  const tableSummary = Object.entries(dump.tables)
    .map(([name, table]) => `${name}=${table.rowCount}`)
    .join(', ');

  console.log(`Exported JSON dump to ${outputPath}`);
  console.log(`Tables: ${tableSummary}`);
}

main();
