const form = document.querySelector("#appointmentForm");
const adminLogin = document.querySelector("#adminLogin");
const adminApp = document.querySelector("#adminApp");
const adminTabs = document.querySelector("#adminTabs");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginError = document.querySelector("#adminLoginError");
const logoutButton = document.querySelector("#logoutButton");
const appointmentsEl = document.querySelector("#appointments");
const clientsEl = document.querySelector("#clients");
const nameInput = document.querySelector("#name");
const phoneInput = document.querySelector("#phone");
const filterDate = document.querySelector("#filterDate");
const dateInput = document.querySelector("#date");
const timeInput = document.querySelector("#time");
const serviceInput = document.querySelector("#service");
const slotsEl = document.querySelector("#slots");
const slotsHint = document.querySelector("#slotsHint");
const clientHint = document.querySelector("#clientHint");
const clientSuggestions = document.querySelector("#clientSuggestions");
const toast = document.querySelector("#toast");
const todayBadge = document.querySelector("#todayBadge");
const todayCount = document.querySelector("#todayCount");
const dayTotal = document.querySelector("#dayTotal");
const navLinks = document.querySelectorAll(".mobile-nav a, .bottom-tabs a");
const ADMIN_PASSWORD = "1234";
const ADMIN_SESSION_KEY = "barberAdminAuthenticated";

const today = toDateInputValue(new Date());
filterDate.value = today;
dateInput.value = today;
dateInput.min = today;
todayBadge.textContent = formatDate(today);
const STATUS_LABELS = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  scheduled: "Pendiente"
};
const ACTIVE_STATUSES = ["pending", "confirmed", "scheduled"];

function isAdminAuthenticated() {
  return localStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function showAdminApp() {
  adminLogin.classList.add("hidden");
  adminApp.classList.remove("hidden");
  adminTabs.classList.remove("hidden");
}

function showAdminLogin() {
  adminApp.classList.add("hidden");
  adminTabs.classList.add("hidden");
  adminLogin.classList.remove("hidden");
  adminPassword.value = "";
  adminLoginError.textContent = "";
  adminPassword.focus();
}

async function initAdminApp() {
  showAdminApp();
  await Promise.all([refresh(), loadSlots()]);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${value}T00:00`));
}

function formatTime(value) {
  return value.slice(11, 16);
}

function formatDateTime(value) {
  return `${formatDate(value.slice(0, 10))} ${formatTime(value)}`;
}

function formatPrice(value) {
  return `${Number(value || 0).toFixed(0)}\u20ac`;
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function getStatusOptions(currentStatus) {
  return Object.entries({
    pending: "Pendiente",
    confirmed: "Confirmada",
    completed: "Completada",
    cancelled: "Cancelada"
  })
    .map(([value, label]) => {
      const selected = value === currentStatus || (currentStatus === "scheduled" && value === "pending") ? "selected" : "";
      return `<option value="${value}" ${selected}>${label}</option>`;
    })
    .join("");
}

function resetAppointmentForm(date) {
  form.reset();
  dateInput.value = date;
  serviceInput.value = "Corte";
  timeInput.value = "";
  clientHint.textContent = "";
  clientSuggestions.innerHTML = "";
  slotsEl.querySelectorAll(".slot").forEach((slot) => slot.classList.remove("selected"));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "No se pudo completar la accion.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function debounce(callback, delay = 350) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function normalizePhoneInput(value) {
  const trimmed = String(value || "").trim();
  return trimmed.replace(/\D/g, "");
}

function validatePhoneInput() {
  const phone = normalizePhoneInput(phoneInput.value);
  if (!phone) return "El telefono es obligatorio.";
  if (!/^\d+$/.test(phone)) return "El telefono solo puede contener numeros.";
  if (phone.length < 9) return "El telefono debe tener al menos 9 digitos.";
  return "";
}

function renderClientSuggestions(clients) {
  if (!clients.length) {
    clientSuggestions.innerHTML = "";
    return;
  }

  clientSuggestions.innerHTML = clients
    .map((client) => {
      const name = escapeHtml(client.name);
      const phone = escapeHtml(client.phone);
      return `
        <button type="button" class="client-suggestion" data-name="${name}" data-phone="${phone}">
          <span>${name}</span>
          <small>${phone}</small>
        </button>
      `;
    })
    .join("");
}

async function searchClientSuggestions(query, source) {
  clientHint.textContent = "";
  if (query.length < 2) {
    clientSuggestions.innerHTML = "";
    return;
  }

  const clients = await api(`/api/clients/search?q=${encodeURIComponent(query)}`);
  renderClientSuggestions(clients);

  if (source === "phone") {
    const phone = normalizePhoneInput(query);
    const exactClient = clients.find((client) => normalizePhoneInput(client.phone) === phone);
    if (exactClient) {
      nameInput.value = exactClient.name;
      phoneInput.value = exactClient.phone;
      clientHint.textContent = "Cliente existente encontrado. Se reutilizara al crear la cita.";
    }
  }
}

function selectClientSuggestion(button) {
  nameInput.value = button.dataset.name;
  phoneInput.value = button.dataset.phone;
  clientSuggestions.innerHTML = "";
  clientHint.textContent = "Cliente seleccionado. Se reutilizara al crear la cita.";
}

async function loadAppointments() {
  const appointments = await api(`/api/appointments?date=${filterDate.value}`);
  appointmentsEl.innerHTML = "";
  todayCount.textContent = appointments.filter((appointment) => ACTIVE_STATUSES.includes(appointment.status)).length;
  const total = appointments
    .filter((appointment) => ["confirmed", "completed"].includes(appointment.status))
    .reduce((sum, appointment) => sum + Number(appointment.price || 0), 0);
  dayTotal.textContent = formatPrice(total);

  if (!appointments.length) {
    appointmentsEl.innerHTML = '<div class="empty">No hay citas para este dia.</div>';
    return;
  }

  appointments.forEach((appointment) => {
    const clientName = escapeHtml(appointment.clientName);
    const clientPhone = escapeHtml(appointment.clientPhone);
    const service = escapeHtml(appointment.service);
    const price = formatPrice(appointment.price);
    const statusLabel = getStatusLabel(appointment.status);
    const canManageTime = ACTIVE_STATUSES.includes(appointment.status);
    const item = document.createElement("article");
    item.className = `appointment ${appointment.status}`;
    item.innerHTML = `
      <div class="appointment-main">
        <div>
          <p class="client-name">${clientName}</p>
          <p class="phone">${clientPhone}</p>
          <span class="service">${service}</span>
          <span class="price">${price}</span>
          <span class="status ${appointment.status}">${statusLabel}</span>
        </div>
        <div class="time">${formatTime(appointment.appointmentAt)}</div>
      </div>
      <label class="status-control">
        Estado
        <select data-action="status" data-id="${appointment.id}">
          ${getStatusOptions(appointment.status)}
        </select>
      </label>
      ${
        canManageTime
          ? `
            <div class="actions">
              <button class="secondary" data-action="toggle" data-id="${appointment.id}">Reprogramar</button>
              <button class="danger" data-action="cancel" data-id="${appointment.id}">Cancelar</button>
            </div>
            <form class="reschedule" data-id="${appointment.id}">
              <input type="datetime-local" value="${appointment.appointmentAt}" required />
              <button type="submit">OK</button>
            </form>
          `
          : ""
      }
    `;
    appointmentsEl.appendChild(item);
  });
}

async function loadSlots() {
  timeInput.value = "";
  slotsEl.innerHTML = '<div class="empty small">Cargando horarios...</div>';

  const params = new URLSearchParams({
    date: dateInput.value,
    service: serviceInput.value
  });
  const availability = await api(`/api/available-slots?${params}`);
  const availableCount = availability.slots.filter((slot) => slot.available).length;
  slotsHint.textContent = `${availability.durationMinutes} min`;

  if (!availableCount) {
    slotsEl.innerHTML = '<div class="empty small">No hay horarios disponibles para este dia.</div>';
    return;
  }

  slotsEl.innerHTML = availability.slots
    .map((slot) => {
      const disabled = slot.available ? "" : "disabled";
      const state = slot.available ? "Libre" : "Ocupado";
      const stateClass = slot.available ? "available" : "busy";
      return `
        <button class="slot ${stateClass}" type="button" data-time="${slot.time}" ${disabled}>
          <strong>${slot.time}</strong>
          <span>${state}</span>
        </button>
      `;
    })
    .join("");
}

async function loadClients() {
  const clients = await api("/api/clients");
  clientsEl.innerHTML = "";

  if (!clients.length) {
    clientsEl.innerHTML = '<div class="empty">Aun no hay clientes guardados.</div>';
    return;
  }

  clients.forEach((client) => {
    const name = escapeHtml(client.name);
    const phone = escapeHtml(client.phone);
    const item = document.createElement("article");
    item.className = "client";
    item.innerHTML = `
      <div class="client-row">
        <div>
          <p class="client-name">${name}</p>
          <p class="phone">${phone}</p>
        </div>
        <button class="secondary compact" data-action="history" data-client-id="${client.id}">Historial</button>
      </div>
      <div class="history" id="history-${client.id}"></div>
    `;
    clientsEl.appendChild(item);
  });
}

async function toggleHistory(clientId) {
  const historyEl = document.querySelector(`#history-${clientId}`);
  if (!historyEl) return;

  if (historyEl.classList.contains("open")) {
    historyEl.classList.remove("open");
    historyEl.innerHTML = "";
    return;
  }

  historyEl.classList.add("open");
  historyEl.innerHTML = '<div class="empty small">Cargando historial...</div>';

  const history = await api(`/api/clients/${clientId}/appointments`);
  if (!history.length) {
    historyEl.innerHTML = '<div class="empty small">Este cliente aun no tiene citas.</div>';
    return;
  }

  historyEl.innerHTML = history
    .map((appointment) => {
      const service = escapeHtml(appointment.service);
      const price = formatPrice(appointment.price);
      const status = getStatusLabel(appointment.status);
      const statusClass = appointment.status === "scheduled" ? "pending" : appointment.status;

      return `
        <div class="history-item">
          <div>
            <p class="history-date">${formatDateTime(appointment.appointmentAt)}</p>
            <p class="phone">${service} &middot; ${price}</p>
          </div>
          <span class="status ${statusClass}">${status}</span>
        </div>
      `;
    })
    .join("");
}

async function refresh() {
  await Promise.all([loadAppointments(), loadClients()]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const phoneError = validatePhoneInput();
  if (phoneError) {
    clientHint.textContent = phoneError;
    showToast(phoneError);
    return;
  }
  const selectedTime = formData.get("time");
  if (!selectedTime) {
    showToast("Elige una hora disponible.");
    return;
  }
  const appointmentAt = `${formData.get("date")}T${selectedTime}`;

  try {
    const appointment = await api("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        phone: normalizePhoneInput(formData.get("phone")),
        service: formData.get("service"),
        appointmentAt
      })
    });
    filterDate.value = appointment.appointmentAt.slice(0, 10);
    todayBadge.textContent = formatDate(filterDate.value);
    resetAppointmentForm(filterDate.value);
    showToast(`Cita confirmada: ${appointment.clientName}, ${appointment.service}, ${formatDateTime(appointment.appointmentAt)}.`);
    await refresh();
    await loadSlots();
  } catch (error) {
    showToast(error.message);
    if (error.status === 409) {
      await loadSlots().catch(() => {});
    }
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (adminPassword.value === ADMIN_PASSWORD) {
    localStorage.setItem(ADMIN_SESSION_KEY, "true");
    await initAdminApp().catch((error) => showToast(error.message));
    return;
  }

  adminLoginError.textContent = "Contraseña incorrecta.";
  showToast("Contraseña incorrecta.");
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  showAdminLogin();
});

dateInput.addEventListener("change", () => {
  loadSlots().catch((error) => showToast(error.message));
});

serviceInput.addEventListener("change", () => {
  loadSlots().catch((error) => showToast(error.message));
});

phoneInput.addEventListener(
  "input",
  debounce(() => {
    const phoneError = phoneInput.value.trim() ? validatePhoneInput() : "";
    if (phoneError) {
      clientHint.textContent = phoneError;
      clientSuggestions.innerHTML = "";
      return;
    }
    searchClientSuggestions(phoneInput.value.trim(), "phone").catch(() => {
      clientHint.textContent = "";
      clientSuggestions.innerHTML = "";
    });
  })
);

nameInput.addEventListener(
  "input",
  debounce(() => {
    searchClientSuggestions(nameInput.value.trim(), "name").catch(() => {
      clientHint.textContent = "";
      clientSuggestions.innerHTML = "";
    });
  })
);

clientSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest(".client-suggestion");
  if (!button) return;
  selectClientSuggestion(button);
});

filterDate.addEventListener("change", () => {
  dateInput.value = filterDate.value;
  todayBadge.textContent = formatDate(filterDate.value);
  Promise.all([loadAppointments(), loadSlots()]).catch((error) => showToast(error.message));
});

slotsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".slot");
  if (!button || button.disabled) return;

  slotsEl.querySelectorAll(".slot").forEach((slot) => slot.classList.remove("selected"));
  button.classList.add("selected");
  timeInput.value = button.dataset.time;
});

appointmentsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "toggle") {
    button.closest(".appointment").querySelector(".reschedule").classList.toggle("open");
  }

  if (action === "cancel") {
    try {
      await api(`/api/appointments/${id}`, { method: "DELETE" });
      showToast("Cita cancelada.");
      await refresh();
      await loadSlots();
    } catch (error) {
      showToast(error.message);
    }
  }
});

appointmentsEl.addEventListener("change", async (event) => {
  const select = event.target.closest('select[data-action="status"]');
  if (!select) return;

  try {
    const appointment = await api(`/api/appointments/${select.dataset.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: select.value })
    });
    showToast(`Estado actualizado: ${getStatusLabel(appointment.status)}.`);
    await refresh();
    await loadSlots();
  } catch (error) {
    showToast(error.message);
    await refresh().catch(() => {});
  }
});

appointmentsEl.addEventListener("submit", async (event) => {
  if (!event.target.matches(".reschedule")) return;
  event.preventDefault();

  const id = event.target.dataset.id;
  const appointmentAt = event.target.querySelector("input").value;

  try {
    await api(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ appointmentAt })
    });
    showToast("Cita reprogramada.");
    await refresh();
  } catch (error) {
    showToast(error.message);
    if (error.status === 409) {
      await loadAppointments().catch(() => {});
    }
  }
});

clientsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "history") return;

  try {
    await toggleHistory(button.dataset.clientId);
  } catch (error) {
    showToast(error.message);
  }
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(`a[href="${link.getAttribute("href")}"]`).forEach((item) => {
      item.classList.add("active");
    });
  });
});

if (isAdminAuthenticated()) {
  initAdminApp().catch((error) => showToast(error.message));
} else {
  showAdminLogin();
}
