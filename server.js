const path = require("path");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const port = process.env.PORT || 3000;
const db = new DatabaseSync(path.join(__dirname, "barber.db"));
const BUSINESS_START_MINUTES = 9 * 60;
const BUSINESS_END_MINUTES = 20 * 60;
const SLOT_INTERVAL_MINUTES = 30;
const SERVICE_DURATIONS = {
  Corte: 30,
  "Corte + barba": 45,
  "Corte y barba": 45,
  Barba: 30,
  Afeitado: 30,
  Arreglo: 30
};
const SERVICE_PRICES = {
  Corte: 13,
  "Corte + barba": 15,
  "Corte y barba": 15,
  Barba: 0,
  Afeitado: 0,
  Arreglo: 0
};
const APPOINTMENT_STATUSES = ["pending", "confirmed", "cancelled", "completed"];
const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed"];

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    phone TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    appointment_at TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'Corte',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  UPDATE appointments SET status = 'pending' WHERE status = 'scheduled';
  DROP INDEX IF EXISTS idx_active_appointment_time;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_active_appointment_time
  ON appointments(appointment_at)
  WHERE status IN ('pending', 'confirmed');
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const appointmentColumns = db.prepare("PRAGMA table_info(appointments)").all();
const hasServiceColumn = appointmentColumns.some((column) => column.name === "service");
if (!hasServiceColumn) {
  db.exec("ALTER TABLE appointments ADD COLUMN service TEXT NOT NULL DEFAULT 'Corte'");
}

const getAppointment = db.prepare(`
  SELECT
    appointments.id,
    appointments.appointment_at AS appointmentAt,
    appointments.service,
    appointments.status,
    clients.id AS clientId,
    clients.name AS clientName,
    clients.phone AS clientPhone
  FROM appointments
  JOIN clients ON clients.id = appointments.client_id
  WHERE appointments.id = ?
`);

function normalizePhone(phone) {
  const value = String(phone || "").trim();
  return value.replace(/\D/g, "");
}

function validatePhone(phone) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) {
    return { ok: false, phone: cleanPhone, message: "El telefono es obligatorio." };
  }
  if (!/^\d+$/.test(cleanPhone)) {
    return { ok: false, phone: cleanPhone, message: "El telefono solo puede contener numeros." };
  }
  if (cleanPhone.length < 9) {
    return { ok: false, phone: cleanPhone, message: "El telefono debe tener al menos 9 digitos." };
  }
  return { ok: true, phone: cleanPhone };
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizeNameKey(name) {
  return normalizeName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getSimilarPhoneKey(phone) {
  const cleanPhone = normalizePhone(phone);
  if (cleanPhone.length > 9) return cleanPhone.slice(-9);
  return cleanPhone;
}

function normalizeService(service) {
  const cleanService = String(service || "").trim().replace(/\s+/g, " ");
  if (cleanService === "Corte y barba") return "Corte + barba";
  return cleanService;
}

function normalizeStatus(status) {
  const cleanStatus = String(status || "").trim().toLowerCase();
  if (cleanStatus === "pendiente") return "pending";
  if (cleanStatus === "confirmada" || cleanStatus === "confirmado") return "confirmed";
  if (cleanStatus === "cancelada" || cleanStatus === "cancelado") return "cancelled";
  if (cleanStatus === "completada" || cleanStatus === "completado") return "completed";
  return cleanStatus;
}

function isValidAppointmentDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeInputValue(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${toDateInputValue(date)}T${hours}:${minutes}`;
}

function nextDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getServiceDuration(service) {
  return SERVICE_DURATIONS[normalizeService(service)] || 30;
}

function getServicePrice(service) {
  return SERVICE_PRICES[normalizeService(service)] || 0;
}

function withAppointmentPrice(appointment) {
  if (!appointment) return appointment;
  return {
    ...appointment,
    price: getServicePrice(appointment.service)
  };
}

function getDateTimeMinutes(appointmentAt) {
  return timeToMinutes(appointmentAt.slice(11, 16));
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getOverlappingAppointment(date, startMinutes, endMinutes, excludeAppointmentId = null) {
  const scheduled = db
    .prepare(
      `
        SELECT id, appointment_at AS appointmentAt, service
        FROM appointments
        WHERE appointment_at >= ?
          AND appointment_at < ?
          AND status IN ('pending', 'confirmed')
          AND (? IS NULL OR id != ?)
      `
    )
    .all(`${date}T00:00`, `${nextDate(date)}T00:00`, excludeAppointmentId, excludeAppointmentId);

  return scheduled.find((appointment) => {
    const bookedStart = getDateTimeMinutes(appointment.appointmentAt);
    const bookedEnd = bookedStart + getServiceDuration(appointment.service);
    return overlaps(startMinutes, endMinutes, bookedStart, bookedEnd);
  });
}

function isBookableSlot(appointmentAt, service, excludeAppointmentId = null) {
  if (!isValidAppointmentDate(appointmentAt)) {
    return { ok: false, message: "Fecha y hora no validas." };
  }

  const [date, time] = appointmentAt.split("T");
  if (appointmentAt <= toDateTimeInputValue(new Date())) {
    return { ok: false, message: "No se pueden seleccionar horas pasadas." };
  }

  const minutes = timeToMinutes(time);
  const duration = getServiceDuration(service);
  if (
    minutes < BUSINESS_START_MINUTES ||
    minutes + duration > BUSINESS_END_MINUTES ||
    minutes % SLOT_INTERVAL_MINUTES !== 0
  ) {
    return { ok: false, message: "Elige un horario disponible de la lista." };
  }

  const booked = getOverlappingAppointment(date, minutes, minutes + duration, excludeAppointmentId);
  if (booked) {
    return { ok: false, status: 409, message: "Ese horario ya esta ocupado. Elige otro hueco." };
  }

  return { ok: true, date, time };
}

function getAvailableSlots(date, service) {
  const duration = getServiceDuration(service);
  const nowValue = toDateTimeInputValue(new Date());
  const slots = [];
  for (
    let minutes = BUSINESS_START_MINUTES;
    minutes < BUSINESS_END_MINUTES;
    minutes += SLOT_INTERVAL_MINUTES
  ) {
    const time = minutesToTime(minutes);
    const appointmentAt = `${date}T${time}`;
    const available =
      appointmentAt > nowValue &&
      minutes + duration <= BUSINESS_END_MINUTES &&
      !getOverlappingAppointment(date, minutes, minutes + duration);
    slots.push({ time, appointmentAt, available });
  }
  return slots;
}

function getOrCreateClient(name, phone) {
  const cleanName = normalizeName(name);
  const phoneValidation = validatePhone(phone);
  const cleanPhone = phoneValidation.phone;

  if (!cleanName) {
    const error = new Error("Nombre y telefono son obligatorios.");
    error.status = 400;
    throw error;
  }
  if (!phoneValidation.ok) {
    const error = new Error(phoneValidation.message);
    error.status = 400;
    throw error;
  }

  const existing = db.prepare("SELECT id FROM clients WHERE phone = ?").get(cleanPhone);
  if (existing) {
    db.prepare("UPDATE clients SET name = ? WHERE id = ?").run(cleanName, existing.id);
    return existing.id;
  }

  const clients = db.prepare("SELECT id, phone FROM clients").all();
  const cleanPhoneKey = getSimilarPhoneKey(cleanPhone);
  const matchingClient = clients.find((client) => {
    return (
      normalizePhone(client.phone) === cleanPhone ||
      (cleanPhoneKey.length >= 9 && getSimilarPhoneKey(client.phone) === cleanPhoneKey)
    );
  });
  if (matchingClient) {
    db.prepare("UPDATE clients SET name = ?, phone = ? WHERE id = ?").run(
      cleanName,
      cleanPhone,
      matchingClient.id
    );
    return matchingClient.id;
  }

  const result = db
    .prepare("INSERT INTO clients (name, phone) VALUES (?, ?)")
    .run(cleanName, cleanPhone);
  return result.lastInsertRowid;
}

function mergeClientGroup(group, normalizedPhone = null) {
  if (group.length < 2 && !normalizedPhone) return;

  const canonical = group[0];
  for (const duplicate of group.slice(1)) {
    db.prepare("UPDATE appointments SET client_id = ? WHERE client_id = ?").run(
      canonical.id,
      duplicate.id
    );
    db.prepare("DELETE FROM clients WHERE id = ?").run(duplicate.id);
  }

  if (normalizedPhone && canonical.phone !== normalizedPhone) {
    const phoneOwner = db
      .prepare("SELECT id FROM clients WHERE phone = ? AND id != ?")
      .get(normalizedPhone, canonical.id);
    if (!phoneOwner) {
      db.prepare("UPDATE clients SET phone = ? WHERE id = ?").run(normalizedPhone, canonical.id);
    }
  }
}

function mergeDuplicateClients() {
  const clients = db.prepare("SELECT id, name, phone FROM clients ORDER BY id ASC").all();
  const clientsByPhone = new Map();
  const clientsBySimilarPhone = new Map();
  const clientsByName = new Map();

  for (const client of clients) {
    const cleanPhone = normalizePhone(client.phone);
    const similarPhone = getSimilarPhoneKey(client.phone);
    const nameKey = normalizeNameKey(client.name);

    if (cleanPhone) {
      if (!clientsByPhone.has(cleanPhone)) clientsByPhone.set(cleanPhone, []);
      clientsByPhone.get(cleanPhone).push(client);
    }

    if (similarPhone && similarPhone.length >= 9) {
      if (!clientsBySimilarPhone.has(similarPhone)) clientsBySimilarPhone.set(similarPhone, []);
      clientsBySimilarPhone.get(similarPhone).push(client);
    }

    if (nameKey.length >= 6) {
      if (!clientsByName.has(nameKey)) clientsByName.set(nameKey, []);
      clientsByName.get(nameKey).push(client);
    }
  }

  for (const [cleanPhone, group] of clientsByPhone.entries()) {
    mergeClientGroup(group, cleanPhone);
  }

  for (const group of clientsBySimilarPhone.values()) {
    const currentGroup = group
      .map((client) => db.prepare("SELECT id, name, phone FROM clients WHERE id = ?").get(client.id))
      .filter(Boolean);
    mergeClientGroup(currentGroup, normalizePhone(currentGroup[0]?.phone));
  }

  for (const group of clientsByName.values()) {
    const currentGroup = group
      .map((client) => db.prepare("SELECT id, name, phone FROM clients WHERE id = ?").get(client.id))
      .filter(Boolean);
    mergeClientGroup(currentGroup);
  }
}

mergeDuplicateClients();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_unique ON clients(phone)");

app.get("/api/clients", (req, res) => {
  const clients = db
    .prepare("SELECT id, name, phone, created_at AS createdAt FROM clients ORDER BY name ASC")
    .all();
  res.json(clients);
});

app.get("/api/clients/lookup", (req, res) => {
  const phoneValidation = validatePhone(req.query.phone);
  const phone = phoneValidation.phone;
  if (!phoneValidation.ok) return res.status(400).json({ error: phoneValidation.message });

  const exactClient = db
    .prepare("SELECT id, name, phone, created_at AS createdAt FROM clients WHERE phone = ?")
    .get(phone);
  if (exactClient) return res.json({ found: true, client: exactClient });

  const phoneKey = getSimilarPhoneKey(phone);
  const clients = db.prepare("SELECT id, name, phone, created_at AS createdAt FROM clients").all();
  const matchingClient = clients.find((client) => {
    return (
      normalizePhone(client.phone) === phone ||
      (phoneKey.length >= 9 && getSimilarPhoneKey(client.phone) === phoneKey)
    );
  });
  if (!matchingClient) return res.json({ found: false, client: null });

  if (matchingClient.phone !== phone) {
    db.prepare("UPDATE clients SET phone = ? WHERE id = ?").run(phone, matchingClient.id);
    matchingClient.phone = phone;
  }

  res.json({ found: true, client: matchingClient });
});

app.get("/api/clients/search", (req, res) => {
  const query = normalizeName(req.query.q);
  const phoneQuery = normalizePhone(query);
  if (!query || query.length < 2) return res.json([]);

  const clients = db
    .prepare("SELECT id, name, phone, created_at AS createdAt FROM clients ORDER BY name ASC")
    .all();

  const queryLower = query.toLowerCase();
  const matches = clients
    .filter((client) => {
      const nameMatches = client.name.toLowerCase().includes(queryLower);
      const phoneMatches = phoneQuery.length >= 2 && normalizePhone(client.phone).includes(phoneQuery);
      return nameMatches || phoneMatches;
    })
    .slice(0, 6);

  res.json(matches);
});

app.get("/api/clients/:id/appointments", (req, res) => {
  const client = db.prepare("SELECT id FROM clients WHERE id = ?").get(req.params.id);
  if (!client) return res.status(404).json({ error: "Cliente no encontrado." });

  const appointments = db
    .prepare(`
      SELECT
        id,
        appointment_at AS appointmentAt,
        service,
        status,
        created_at AS createdAt
      FROM appointments
      WHERE client_id = ?
      ORDER BY appointment_at DESC
    `)
    .all(req.params.id);

  res.json(appointments.map(withAppointmentPrice));
});

app.get("/api/available-slots", (req, res) => {
  const date = req.query.date || toDateInputValue(new Date());
  const service = normalizeService(req.query.service || "Corte");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Fecha no valida. Usa YYYY-MM-DD." });
  }
  if (!SERVICE_DURATIONS[service]) {
    return res.status(400).json({ error: "Servicio no valido." });
  }

  res.json({
    date,
    service,
    durationMinutes: getServiceDuration(service),
    intervalMinutes: SLOT_INTERVAL_MINUTES,
    opensAt: minutesToTime(BUSINESS_START_MINUTES),
    closesAt: minutesToTime(BUSINESS_END_MINUTES),
    slots: getAvailableSlots(date, service)
  });
});

app.get("/api/appointments", (req, res) => {
  const date = req.query.date || toDateInputValue(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Fecha no valida. Usa YYYY-MM-DD." });
  }

  const appointments = db
    .prepare(`
      SELECT
        appointments.id,
        appointments.appointment_at AS appointmentAt,
        appointments.service,
        appointments.status,
        clients.id AS clientId,
        clients.name AS clientName,
        clients.phone AS clientPhone
      FROM appointments
      JOIN clients ON clients.id = appointments.client_id
      WHERE appointments.appointment_at >= ?
        AND appointments.appointment_at < ?
      ORDER BY appointments.appointment_at ASC
    `)
    .all(`${date}T00:00`, `${nextDate(date)}T00:00`);

  res.json(appointments.map(withAppointmentPrice));
});

app.post("/api/appointments", (req, res, next) => {
  try {
    const { name, phone, appointmentAt } = req.body;
    const service = normalizeService(req.body.service);
    if (!service) {
      return res.status(400).json({ error: "Selecciona un servicio." });
    }
    if (!SERVICE_DURATIONS[service]) {
      return res.status(400).json({ error: "Servicio no valido." });
    }

    const slot = isBookableSlot(appointmentAt, service);
    if (!slot.ok) {
      return res.status(slot.status || 400).json({ error: slot.message });
    }

    const clientId = getOrCreateClient(name, phone);
    const result = db
      .prepare("INSERT INTO appointments (client_id, appointment_at, service, status) VALUES (?, ?, ?, 'pending')")
      .run(clientId, appointmentAt, service);

    res.status(201).json(withAppointmentPrice(getAppointment.get(result.lastInsertRowid)));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/appointments/:id", (req, res, next) => {
  try {
    const { appointmentAt } = req.body;
    const appointment = getAppointment.get(req.params.id);
    if (!appointment) return res.status(404).json({ error: "Cita no encontrada." });
    if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
      return res.status(400).json({ error: "Solo se pueden reprogramar citas pendientes o confirmadas." });
    }
    const slot = isBookableSlot(appointmentAt, appointment.service, req.params.id);
    if (!slot.ok) {
      return res.status(slot.status || 400).json({ error: slot.message });
    }

    db.prepare(`
      UPDATE appointments
      SET appointment_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(appointmentAt, req.params.id);

    res.json(withAppointmentPrice(getAppointment.get(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/appointments/:id/status", (req, res) => {
  const status = normalizeStatus(req.body.status);
  if (!APPOINTMENT_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Estado no valido." });
  }

  const appointment = getAppointment.get(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Cita no encontrada." });

  if (ACTIVE_APPOINTMENT_STATUSES.includes(status)) {
    if (appointment.appointmentAt <= toDateTimeInputValue(new Date())) {
      return res.status(400).json({ error: "No se puede activar una cita pasada." });
    }
    const [date] = appointment.appointmentAt.split("T");
    const startMinutes = getDateTimeMinutes(appointment.appointmentAt);
    const endMinutes = startMinutes + getServiceDuration(appointment.service);
    const booked = getOverlappingAppointment(date, startMinutes, endMinutes, appointment.id);
    if (booked) {
      return res.status(409).json({ error: "Ese horario ya esta ocupado. Elige otro hueco." });
    }
  }

  db.prepare(`
    UPDATE appointments
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, req.params.id);

  res.json(withAppointmentPrice(getAppointment.get(req.params.id)));
});

app.delete("/api/appointments/:id", (req, res) => {
  const appointment = getAppointment.get(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Cita no encontrada." });

  db.prepare(`
    UPDATE appointments
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.params.id);

  res.json({ ok: true });
});

app.use((error, req, res, next) => {
  if (
    error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    String(error.message || "").includes("UNIQUE constraint failed")
  ) {
    return res.status(409).json({ error: "Ese horario ya esta ocupado. Elige otro hueco." });
  }

  const status = error.status || 500;
  res.status(status).json({ error: error.message || "Error inesperado." });
});

app.listen(port, () => {
  console.log(`Barber app lista en http://localhost:${port}`);
});
