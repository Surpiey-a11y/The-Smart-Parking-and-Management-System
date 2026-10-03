/* =========================================================
   SmartPark — VIP page logic
   - Fetches live slot availability
   - Handles slot selection + reservation
   - Shows the generated 4-digit VIP code after booking
   - Lets the user enter their code at the gate to open the VIP servo
   ========================================================= */

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

/* =========================================================
   Inject the "Enter VIP code" panel + "Your codes" panel
   ========================================================= */
function ensureVipCodeUI() {
  // ---- Code entry panel ----
  if (!document.getElementById('vip-gate-panel')) {
    const panel = document.createElement('div');
    panel.id = 'vip-gate-panel';
    panel.style.margin = '24px auto';
    panel.style.maxWidth = '480px';
    panel.style.padding = '20px';
    panel.style.borderRadius = '12px';
    panel.style.background = 'rgba(168, 85, 247, 0.12)';
    panel.style.border = '1px solid rgba(168, 85, 247, 0.4)';

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <i class="fas fa-key" style="color:#a855f7;font-size:18px;"></i>
        <strong style="font-size:15px;">Enter your VIP code at the gate</strong>
      </div>
      <div style="display:flex;gap:8px;">
        <input id="vip-code-input" type="text" maxlength="4" inputmode="numeric"
          placeholder="4-digit code"
          style="flex:1;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
                 background:rgba(0,0,0,0.25);color:inherit;font-size:18px;letter-spacing:6px;
                 text-align:center;outline:none;" />
        <button id="vip-code-submit"
          style="padding:12px 20px;border-radius:8px;border:none;cursor:pointer;
                 background:#a855f7;color:white;font-weight:600;">
          Open Gate
        </button>
      </div>
      <div id="vip-code-msg" style="margin-top:10px;font-size:13px;min-height:18px;"></div>
    `;

    document.body.appendChild(panel);

    document.getElementById('vip-code-submit').addEventListener('click', submitVipCode);
    document.getElementById('vip-code-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitVipCode();
    });
  }

  // ---- My codes panel (populated after booking / on load) ----
  if (!document.getElementById('my-vip-codes')) {
    const box = document.createElement('div');
    box.id = 'my-vip-codes';
    box.style.margin = '24px auto';
    box.style.maxWidth = '480px';
    box.style.padding = '16px 20px';
    box.style.borderRadius = '12px';
    box.style.background = 'rgba(255,255,255,0.04)';
    box.style.border = '1px solid rgba(255,255,255,0.08)';
    box.style.display = 'none';
    document.body.appendChild(box);
  }
}

/* =========================================================
   Submit the 4-digit code to open the VIP gate
   ========================================================= */
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

/* =========================================================
   Show the user's active VIP codes
   ========================================================= */
async function loadMyVipCodes() {
  const box = document.getElementById('my-vip-codes');
  if (!box) return;

  try {
    const res = await fetch(`${API_BASE}/api/reservations/my`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) return;
    const list = await res.json();

    const vipWithCode = list.filter(r => r.slot_id === 'V1' && r.code);

    if (vipWithCode.length === 0) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <i class="fas fa-ticket-alt" style="color:#a855f7;"></i>
        <strong>Your VIP code${vipWithCode.length > 1 ? 's' : ''}</strong>
      </div>
      ${vipWithCode.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px;border-radius:8px;background:rgba(168,85,247,0.15);margin-top:6px;">
          <span style="opacity:0.8;font-size:13px;">${r.date}</span>
          <strong style="font-size:22px;letter-spacing:6px;color:#a855f7;">${r.code}</strong>
        </div>
      `).join('')}
      <div style="margin-top:10px;font-size:12px;opacity:0.7;">
        Use this code at the VIP gate to open the servo.
      </div>
    `;
  } catch (err) {
    console.warn('loadMyVipCodes failed:', err.message);
  }
}

/* =========================================================
   Slot rendering (unchanged)
   ========================================================= */
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

/* =========================================================
   Confirm booking — now shows the code if VIP
   ========================================================= */
confirmBtn?.addEventListener('click', async () => {
  if (!selectedSlotId) return;

  confirmBtn.disabled = true;
  const original = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking…';

  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toTimeString().slice(0, 5);

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

    // If VIP, show the code
    if (data.code) {
      showToast(`VIP booked! Your code: ${data.code}`);
      // Big visual popup so user writes it down
      setTimeout(() => {
        alert(`Your VIP access code is:\n\n    ${data.code}\n\nWrite it down. You'll need it to open the VIP gate.`);
      }, 300);
      loadMyVipCodes();
    } else {
      showToast(`Slot ${selectedSlotId} booked!`);
    }

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

/* =========================================================
   BOOT
   ========================================================= */
ensureVipCodeUI();
loadSlots();
loadMyVipCodes();
setInterval(loadSlots, 5000);