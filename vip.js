/* =========================================================
   SmartPark — VIP page logic
   Fetches live slot availability from /api/slots and
   handles slot selection + reservation confirmation.
   ========================================================= */

const API_BASE = '';
const TOKEN = localStorage.getItem('smartpark_token');

// Redirect to login if not authenticated
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

const container = document.getElementById('vip-slots-container');
const label = document.getElementById('selected-slot-label');
const confirmBtn = document.getElementById('confirm-vip-btn');

function showToast(msg, success = true) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  if (!toast || !toastText) return;
  toastText.textContent = msg;
  const icon = toast.querySelector('i');
  if (icon) {
    icon.className = success
      ? 'fas fa-check-circle'
      : 'fas fa-exclamation-circle';
    icon.style.color = success ? '#22c55e' : '#f97316';
  }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function renderSlots(slots, summary) {
  container.innerHTML = '';

  // Header line: "2 of 2 VIP spaces available"
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
  label.textContent = `Selected: ${id}`;
  confirmBtn.disabled = false;

  document.querySelectorAll('.slot-card').forEach(c => {
    c.style.outline = c.dataset.slotId === id ? '2px solid #a855f7' : 'none';
  });
}

async function loadSlots() {
  try {
    const res = await fetch(`${API_BASE}/api/slots`);
    if (!res.ok) throw new Error('Failed to load slots');
    const data = await res.json();
    allSlots = data.slots;
    renderSlots(data.slots, data.summary);
  } catch (err) {
    container.innerHTML = `<p style="color:#f97316;">Could not load slots: ${err.message}</p>`;
  }
}

confirmBtn?.addEventListener('click', async () => {
  if (!selectedSlotId) return;

  confirmBtn.disabled = true;
  const original = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking…';

  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toTimeString().slice(0, 5); // HH:MM

  try {
    const res = await fetch(`${API_BASE}/api/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        slotId: selectedSlotId,
        date: today,
        time,
        duration: 2
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking failed');

    showToast(`VIP slot ${selectedSlotId} booked!`);
    selectedSlotId = null;
    label.textContent = 'No slot selected yet.';
    await loadSlots();
  } catch (err) {
    showToast(err.message, false);
  } finally {
    confirmBtn.innerHTML = original;
    confirmBtn.disabled = !selectedSlotId;
  }
});

loadSlots();