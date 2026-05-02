const form = document.querySelector("#appointmentForm");
const nameInput = document.querySelector("#name");
const phoneInput = document.querySelector("#phone");
const dateInput = document.querySelector("#date");
const timeInput = document.querySelector("#time");
const serviceInput = document.querySelector("#service");
const slotsEl = document.querySelector("#slots");
const slotsHint = document.querySelector("#slotsHint");
const clientHint = document.querySelector("#clientHint");
const toast = document.querySelector("#toast");
const todayBadge = document.querySelector("#todayBadge");
const serviceSummary = document.querySelector("#serviceSummary");

const today = toDateInputValue(new Date());
dateInput.value = today;
dateInput.min = today;
todayBadge.textContent = formatDate(today);

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

function normalizePhoneInput(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function validatePhoneInput() {
  const phone = normalizePhoneInput(phoneInput.value);
  if (!phone) return "El telefono es obligatorio.";
  if (!/^\d+$/.test(phone)) return "El telefono solo puede contener numeros.";
  if (phone.length < 9) return "El telefono debe tener al menos 9 digitos.";
  return "";
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

async function lookupClientByPhone() {
  const phoneError = phoneInput.value.trim() ? validatePhoneInput() : "";
  clientHint.textContent = phoneError;
  if (phoneError) return;

  const phone = normalizePhoneInput(phoneInput.value);
  if (phone.length < 9) return;

  const result = await api(`/api/clients/lookup?phone=${encodeURIComponent(phone)}`);
  if (!result.found) {
    clientHint.textContent = "";
    return;
  }

  nameInput.value = result.client.name;
  phoneInput.value = result.client.phone;
  clientHint.textContent = "Cliente encontrado. Se reutilizara al crear la cita.";
}

function resetForm(date) {
  form.reset();
  dateInput.value = date;
  serviceInput.value = "Corte";
  serviceSummary.textContent = "Corte";
  timeInput.value = "";
  clientHint.textContent = "";
  slotsEl.querySelectorAll(".slot").forEach((slot) => slot.classList.remove("selected"));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const phoneError = validatePhoneInput();
  if (phoneError) {
    clientHint.textContent = phoneError;
    showToast(phoneError);
    return;
  }

  const formData = new FormData(form);
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
    resetForm(appointment.appointmentAt.slice(0, 10));
    todayBadge.textContent = formatDate(dateInput.value);
    showToast(`Cita reservada: ${appointment.service}, ${formatDate(dateInput.value)} ${formatTime(appointment.appointmentAt)}.`);
    await loadSlots();
  } catch (error) {
    showToast(error.message);
    if (error.status === 409) {
      await loadSlots().catch(() => {});
    }
  }
});

dateInput.addEventListener("change", () => {
  todayBadge.textContent = formatDate(dateInput.value);
  loadSlots().catch((error) => showToast(error.message));
});

serviceInput.addEventListener("change", () => {
  serviceSummary.textContent = serviceInput.value;
  loadSlots().catch((error) => showToast(error.message));
});

phoneInput.addEventListener(
  "input",
  debounce(() => {
    lookupClientByPhone().catch(() => {
      clientHint.textContent = "";
    });
  })
);

slotsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".slot");
  if (!button || button.disabled) return;

  slotsEl.querySelectorAll(".slot").forEach((slot) => slot.classList.remove("selected"));
  button.classList.add("selected");
  timeInput.value = button.dataset.time;
});

loadSlots().catch((error) => showToast(error.message));
