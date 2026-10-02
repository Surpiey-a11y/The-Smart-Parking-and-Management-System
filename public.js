/* =========================================================
   SmartPark — Public slot monitor
   ========================================================= */

const API_URL = '/api/slots';
const REFRESH_INTERVAL = 5000;

const FALLBACK_SLOTS = [
  { id: 'A1', type: 'public', occupied: false },
  { id: 'A2', type: 'public', occupied: true  },
  { id: 'V1', type: 'vip',    occupied: false }
];

const slotsContainer = document.getElementById('slots-container');
const liveStatus      = document.getElementById('live-status');
const liveStatusText  = document.getElementById('live-status-text');
let previousStates = {};

function setUserDisplay() {
  const nameEl = document.getElementById('user-display-name');
  if (!nameEl) return;
  const user = JSON.parse(localStorage.getItem('smartpark_user') || 'null');
  nameEl.textContent = (user && user.name) ? user.name : 'User';
}

function renderSlots(slots) {
  if (!slotsContainer) return;
  slotsContainer.innerHTML = '';

  slots.forEach(slot => {
    const isVip = slot.type === 'vip';
    const statusClass = slot.occupied ? 'occupied' : 'available';
    const cardClass = `slot-card ${statusClass}${isVip ? ' vip-slot' : ''}`;

    const iconHtml = isVip
      ? '<i class="fas fa-crown slot-icon"></i>'
      : '<i class="fas fa-parking slot-icon"></i>';

    const badge  = isVip ? 'VIP' : 'PUBLIC';
    const status = slot.occupied ? 'Occupied' : 'Available';

    const card = document.createElement('div');
    card.className = cardClass;
    card.dataset.slotId = slot.id;
    card.dataset.slotType = slot.type;
    card.dataset.occupied = slot.occupied;

    card.innerHTML = `
      ${iconHtml}
      <div class="slot-id">${slot.id}</div>
      <div class="slot-type-badge">${badge}</div>
      <div class="slot-status">${status}</div>
    `;
    slotsContainer.appendChild(card);
  });
}

function updateSlots(slots) {
  if (!slotsContainer) return;
  slots.forEach(slot => {
    const card = slotsContainer.querySelector(`[data-slot-id="${slot.id}"]`);
    if (!card) return;

    const prev = previousStates[slot.id];
    const changed = prev !== undefined && prev !== slot.occupied;

    card.classList.toggle('occupied', slot.occupied);
    card.classList.toggle('available', !slot.occupied);
    card.dataset.occupied = slot.occupied;

    const s = card.querySelector('.slot-status');
    if (s) s.textContent = slot.occupied ? 'Occupied' : 'Available';

    if (changed) {
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
    }
    previousStates[slot.id] = slot.occupied;
  });
}

function setLiveStatus(state, text) {
  if (!liveStatus) return;
  liveStatus.classList.remove('online', 'offline');
  if (state === 'online')  liveStatus.classList.add('online');
  if (state === 'offline') liveStatus.classList.add('offline');
  liveStatusText.textContent = text;
}

async function fetchSlots() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Bad data');

    if (Object.keys(previousStates).length === 0) {
      renderSlots(data);
      data.forEach(s => { previousStates[s.id] = s.occupied; });
    } else {
      updateSlots(data);
    }
    setLiveStatus('online', `Live · ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.warn('fetch failed:', err.message);
    setLiveStatus('offline', 'Offline · cached data');
    if (Object.keys(previousStates).length === 0) {
      renderSlots(FALLBACK_SLOTS);
      FALLBACK_SLOTS.forEach(s => { previousStates[s.id] = s.occupied; });
    }
  }
}

/* -------------------- BOOT -------------------- */
if (!localStorage.getItem('smartpark_token')) {
  window.location.href = 'login.html';
} else {
  setUserDisplay();
  fetchSlots();
  setInterval(fetchSlots, REFRESH_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchSlots();
  });
}