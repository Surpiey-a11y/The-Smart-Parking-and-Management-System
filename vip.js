/* =========================================================
   SmartPark — VIP booking page
   - Loads VIP slots from /api/slots
   - Lets the user pick one
   - POSTs the booking to /api/reservations
   ========================================================= */

const SLOTS_API = '/api/slots';
const BOOK_API  = '/api/reservations';

const vipContainer  = document.getElementById('vip-slots-container');
const confirmBtn    = document.getElementById('confirm-vip-btn');
const selectedLabel = document.getElementById('selected-slot-label');

let selectedSlotId = null;
let vipSlots       = [];

/* -------------------- helpers -------------------- */
function showToast(msg, success = true) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  const toastText = document.getElementById('toast-text');
  toastText.textContent = msg;

  const icon = toast.querySelector('i');
  if (icon) {
    icon.className = success ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    icon.style.color = success ? '#22c55e' : '#f97316';
  }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function setUserDisplay() {
  const nameEl = document.getElementById('user-display-name');
  if (!nameEl) return;
  const user = JSON.parse(localStorage.getItem('smartpark_user') || 'null');
  nameEl.textContent = (user && user.name) ? user.name : 'User';
}

/* -------------------- render -------------------- */
function renderVipSlots() {
  if (!vipContainer) return;
  vipContainer.innerHTML = '';

  if (vipSlots.length === 0) {
    vipContainer.innerHTML = '<p style="color:#94a3b8;">No VIP slots available.</p>';
    return;
  }

  vipSlots.forEach(slot => {
    const statusClass = slot.occupied ? 'occupied' : 'available';
    const cardClass = `slot-card vip-slot ${statusClass}`;

    const card = document.createElement('div');
    card.className = cardClass;
    card.dataset.slotId = slot.id;
    card.dataset.occupied = slot.occupied;

    card.innerHTML = `
      <i class="fas fa-crown slot-icon"></i>
      <div class="slot-id">${slot.id}</div>
      <div class="slot-type-badge">VIP</div>
      <div class="slot-status">${slot.occupied ? 'Occupied' : 'Available'}</div>
    `;

    if (selectedSlotId === slot.id) {
      card.classList.add('selected');
    }

    card.addEventListener('click', () => {
      if (slot.occupied) {
        showToast('That VIP slot is occupied.', false);
        return;
      }

      // toggle selection
      selectedSlotId = (selectedSlotId === slot.id) ? null : slot.id;

      selectedLabel.textContent = selectedSlotId
        ? `Selected: ${selectedSlotId} — 2-hour booking`
        : 'No slot selected yet.';

      confirmBtn.disabled = !selectedSlotId;
      renderVipSlots();
    });

    vipContainer.appendChild(card);
  });
}

/* -------------------- load slots -------------------- */
async function loadVipSlots() {
  try {
    const res = await fetch(SLOTS_API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data)) throw new Error('Bad data');

    vipSlots = data.filter(s => s.type === 'vip');
    renderVipSlots();
  } catch (err) {
    console.warn('Could not load VIP slots:', err.message);
    // fallback so the page still renders something
    vipSlots = [{ id: 'V1', type: 'vip', occupied: false }];
    renderVipSlots();
  }
}

/* -------------------- book -------------------- */
async function bookVipSlot() {
  if (!selectedSlotId) return;

  const token = localStorage.getItem('smartpark_token');
  if (!token) {
    showToast('You must be logged in.', false);
    setTimeout(() => { window.location.href = 'login.html'; }, 900);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking…';

    const res = await fetch(BOOK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        slotId: selectedSlotId,
        date: today,
        time: time,
        duration: 2
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking failed');

    showToast(`VIP slot ${selectedSlotId} booked!`, true);
    confirmBtn.innerHTML = '<i class="fas fa-check"></i> Booked!';

    // go back to public page after a moment
    setTimeout(() => { window.location.href = 'public.html'; }, 1500);
  } catch (err) {
    showToast(err.message, false);
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm VIP booking';
  }
}

/* -------------------- boot -------------------- */
if (!localStorage.getItem('smartpark_token')) {
  window.location.href = 'login.html';
} else {
  setUserDisplay();
  loadVipSlots();
  confirmBtn.addEventListener('click', bookVipSlot);
}