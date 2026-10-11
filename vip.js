const API_BASE = '';
const TOKEN = localStorage.getItem('smartpark_token');

if (!TOKEN) {
  window.location.href = 'login.html';
}

const userRaw = localStorage.getItem('smartpark_user');
if (userRaw) {
  try {
    const u = JSON.parse(userRaw);
    const el = document.getElementById('user-display-name');
    if (el) el.textContent = u.name || 'User';
  } catch {}
}

let selectedSlotId = null;
let allSlots = [];

const container      = document.getElementById('vip-slots-container');
const label          = document.getElementById('selected-slot-label');
const confirmBtn     = document.getElementById('confirm-vip-btn');
const myListEl       = document.getElementById('my-reservations-list');
const mySectionEl    = document.getElementById('my-reservations-section');
const gatePanel      = document.getElementById('vip-gate-panel');

const dateInput      = document.getElementById('booking-date');
const timeInput      = document.getElementById('booking-time');
const durationSelect = document.getElementById('booking-duration');
const summaryBar     = document.getElementById('booking-summary');
const summaryText    = document.getElementById('booking-summary-text');

function showToast(msg, success = true) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  if (!toast || !toastText) return;
  toastText.textContent = msg;
  const icon = toast.querySelector('i');
  if (icon) {
    icon.className = success ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    icon.style.color = success ? '#22c55e' : '#f97316';
  }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function initDateTimeInputs() {
  if (!dateInput || !timeInput) return;

  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today);
  if (!dateInput.value) dateInput.value = today;

  if (!timeInput.value) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${mm}`;
  }
}

function getBookingDateTime() {
  if (!dateInput || !timeInput) return null;
  const d = dateInput.value;
  const t = timeInput.value;
  if (!d || !t) return null;
  const dt = new Date(`${d}T${t}:00`);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function updateSummaryAndSlots() {
  if (!summaryText || !summaryBar) return;

  const dt = getBookingDateTime();
  if (!dt) {
    summaryText.textContent = 'Choose a date and time to see available slots.';
    summaryBar.classList.remove('warn');
    confirmBtn.disabled = true;
    return;
  }

  if (dt < new Date()) {
    summaryBar.classList.add('warn');
    summaryText.textContent = 'The selected time is in the past. Please choose a future time.';
    confirmBtn.disabled = true;
    return;
  }

  summaryBar.classList.remove('warn');

  const dur = parseInt(durationSelect?.value || '120', 10);
  const hrs = dur / 60;
  const durLabel = hrs === 1 ? '1 hour' : `${hrs} hours`;
  summaryText.textContent = `Booking for ${dateInput.value} at ${timeInput.value} — ${durLabel}.`;

  if (selectedSlotId) {
    confirmBtn.disabled = false;
  }

  loadSlots();
}

function renderSlots(slots, summary) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.marginBottom = '12px';
  header.style.fontSize = '14px';
  header.style.opacity = '0.85';
  header.innerHTML = `<strong>${summary.vip.available}</strong> of <strong>${summary.vip.total}</strong> VIP spaces available today`;
  container.appendChild(header);

  const vipSlots = slots.filter(s => s.type === 'vip');

  if (vipSlots.length === 0) {
    container.innerHTML += '<p>No VIP slots configured.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
  grid.style.gap = '12px';

  vipSlots.forEach(slot => {
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.slotId = slot.id;
    card.className = 'slot-card ' + slot.status;
    card.style.padding = '16px';
    card.style.borderRadius = '10px';
    card.style.cursor = slot.status === 'available' ? 'pointer' : 'not-allowed';
    card.style.border = '1px solid rgba(255,255,255,0.1)';
    card.style.background = slot.status === 'available'
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(120,120,120,0.15)';
    card.style.color = 'inherit';
    card.style.opacity = slot.status === 'available' ? '1' : '0.5';
    card.innerHTML = `
      <div style="font-size:20px;"><i class="fas fa-crown"></i></div>
      <div style="font-weight:600;margin-top:6px;">${slot.id}</div>
      <div style="font-size:12px;margin-top:4px;">${slot.status === 'available' ? 'Available' : 'Occupied'}</div>
    `;

    if (slot.status === 'available') {
      card.addEventListener('click', () => selectSlot(slot.id));
    }

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function selectSlot(id) {
  selectedSlotId = id;

  const dt = getBookingDateTime();
  if (dt && dt >= new Date()) {
    label.textContent = `Selected: ${id} — ${dateInput.value} at ${timeInput.value}`;
    confirmBtn.disabled = false;
  } else {
    label.textContent = `Selected: ${id} (choose a valid date/time)`;
    confirmBtn.disabled = true;
  }

  document.querySelectorAll('.slot-card').forEach(c => {
    c.style.outline = c.dataset.slotId === id ? '2px solid #a855f7' : 'none';
  });
}

async function loadSlots() {
  try {
    const params = new URLSearchParams();
    if (dateInput?.value) params.set('date', dateInput.value);
    if (timeInput?.value) params.set('time', timeInput.value);
    if (durationSelect?.value) params.set('duration', durationSelect.value);

    const qs = params.toString();
    const url = qs ? `${API_BASE}/api/slots?${qs}` : `${API_BASE}/api/slots`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load slots');
    const data = await res.json();
    allSlots = data.slots;
    renderSlots(data.slots, data.summary);
  } catch (err) {
    container.innerHTML = `<p style="color:#f97316;">Could not load slots: ${err.message}</p>`;
  }
}

async function loadMyReservations() {
  if (!myListEl) return;
  try {
    const res = await fetch(`${API_BASE}/api/reservations/my`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) return;
    const list = await res.json();

    const active = list.filter(r => r.status === 'active');

    if (active.length === 0) {
      mySectionEl.style.display = 'none';
      gatePanel.style.display = 'none';
      return;
    }

    mySectionEl.style.display = 'block';

    const hasVip = active.some(r => r.slot_id === 'V1' && r.code);
    gatePanel.style.display = hasVip ? 'block' : 'none';

    myListEl.innerHTML = active.map(r => {
      const isVip = r.slot_id === 'V1';
      const badge = isVip
        ? '<span style="background:#a855f7;color:white;padding:2px 8px;border-radius:4px;font-size:10px;">VIP</span>'
        : '<span style="background:#3b82f6;color:white;padding:2px 8px;border-radius:4px;font-size:10px;">PUBLIC</span>';

      const dateStr = r.reservation_date || r.date || '';
      const timeStr = r.start_time || r.time || '';
      const durStr = r.duration_minutes
        ? `${r.duration_minutes} min`
        : (r.duration ? `${r.duration} h` : '');

      return `
        <div style="padding:14px;border-radius:10px;background:rgba(255,255,255,0.05);
                    margin-top:8px;border:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:15px;">
                Slot ${r.slot_id} ${badge}
              </div>
              <div style="font-size:12px;opacity:0.7;margin-top:4px;">
                📅 ${dateStr} · 🕐 ${timeStr}${durStr ? ' · ⏱ ' + durStr : ''}
              </div>
            </div>
            ${isVip && r.code ? `
              <div style="text-align:right;">
                <div style="font-size:10px;opacity:0.6;">CODE</div>
                <strong style="font-size:22px;letter-spacing:4px;color:#a855f7;">
                  ${r.code}
                </strong>
              </div>
            ` : ''}
          </div>
          <button data-cancel-id="${r.id}"
            style="margin-top:12px;width:100%;padding:9px;border-radius:6px;
                   border:1px solid rgba(249,115,22,0.4);cursor:pointer;
                   background:rgba(249,115,22,0.1);color:#f97316;
                   font-size:13px;font-weight:600;">
            <i class="fas fa-times"></i> Cancel this reservation
          </button>
        </div>
      `;
    }).join('');

    myListEl.querySelectorAll('[data-cancel-id]').forEach(btn => {
      btn.addEventListener('click', () => cancelReservation(btn.dataset.cancelId));
    });

  } catch (err) {
    console.warn('loadMyReservations failed:', err.message);
  }
}

async function cancelReservation(id) {
  if (!confirm('Cancel this reservation? The slot will become available again.')) return;

  try {
    const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cancel failed');

    showToast('Reservation cancelled ✅');
    await loadMyReservations();
    await loadSlots();
  } catch (err) {
    showToast(err.message, false);
  }
}

async function submitVipCode() {
  const input = document.getElementById('vip-code-input');
  const btn = document.getElementById('vip-code-submit');
  const msg = document.getElementById('vip-code-msg');

  const code = (input.value || '').trim();
  if (code.length !== 4) {
    msg.style.color = '#f97316';
    msg.textContent = 'Please enter the 4-digit code.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Opening…';
  msg.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/vip/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid code');

    msg.style.color = '#22c55e';
    msg.textContent = '✅ Gate opening — please proceed.';
    input.value = '';
    showToast('VIP gate opening…');
  } catch (err) {
    msg.style.color = '#f97316';
    msg.textContent = '❌ ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Open Gate';
  }
}

confirmBtn?.addEventListener('click', async () => {
  if (!selectedSlotId) return;

  const dt = getBookingDateTime();
  if (!dt || dt < new Date()) {
    showToast('Please choose a valid future date and time.', false);
    return;
  }

  confirmBtn.disabled = true;
  const original = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking…';

  const durationMinutes = parseInt(durationSelect?.value || '120', 10);

  try {
    const res = await fetch(`${API_BASE}/api/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        slotId: selectedSlotId,
        slot_id: selectedSlotId,
        date: dateInput.value,
        reservation_date: dateInput.value,
        time: timeInput.value,
        start_time: timeInput.value,
        duration: Math.max(1, Math.round(durationMinutes / 60)),
        duration_minutes: durationMinutes
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking failed');

    if (data.code) {
      showToast(`VIP booked! Your code: ${data.code}`);
      setTimeout(() => {
        alert(
          `Your VIP booking is confirmed.\n\n` +
          `Bay: ${selectedSlotId}\n` +
          `Date: ${dateInput.value}\n` +
          `Time: ${timeInput.value}\n` +
          `Duration: ${durationMinutes} minutes\n\n` +
          `Your access code is: ${data.code}\n\n` +
          `Write it down. You'll need it to open the VIP gate.`
        );
      }, 300);
    } else {
      showToast(`Slot ${selectedSlotId} booked!`);
    }

    selectedSlotId = null;
    label.textContent = 'No slot selected yet.';
    await loadSlots();
    await loadMyReservations();
  } catch (err) {
    showToast(err.message, false);
  } finally {
    confirmBtn.innerHTML = original;
    confirmBtn.disabled = !selectedSlotId;
  }
});

document.getElementById('vip-code-submit')?.addEventListener('click', submitVipCode);
document.getElementById('vip-code-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitVipCode();
});

dateInput?.addEventListener('change', updateSummaryAndSlots);
timeInput?.addEventListener('change', updateSummaryAndSlots);
durationSelect?.addEventListener('change', updateSummaryAndSlots);

initDateTimeInputs();
updateSummaryAndSlots();

loadSlots();
loadMyReservations();
setInterval(loadSlots, 5000);
setInterval(loadMyReservations, 10000);