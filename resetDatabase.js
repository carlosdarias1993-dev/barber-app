const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "barber.db");

if (!fs.existsSync(dbPath)) {
  console.log(`No existe base de datos en: ${dbPath}`);
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('appointments', 'clients')")
  .all()
  .map((table) => table.name);

if (!tables.includes("appointments") || !tables.includes("clients")) {
  console.log("La base de datos existe, pero aun no tiene las tablas de la app.");
  db.close();
  process.exit(0);
}

const before = {
  appointments: db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count,
  clients: db.prepare("SELECT COUNT(*) AS count FROM clients").get().count
};

db.exec(`
  BEGIN;
  DELETE FROM appointments;
  DELETE FROM clients;
  DELETE FROM sqlite_sequence WHERE name IN ('appointments', 'clients');
  COMMIT;
`);

const after = {
  appointments: db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count,
  clients: db.prepare("SELECT COUNT(*) AS count FROM clients").get().count
};

db.close();

console.log(`Base de datos: ${dbPath}`);
console.log(`Citas eliminadas: ${before.appointments}`);
console.log(`Clientes eliminados: ${before.clients}`);
console.log(`Citas restantes: ${after.appointments}`);
console.log(`Clientes restantes: ${after.clients}`);
