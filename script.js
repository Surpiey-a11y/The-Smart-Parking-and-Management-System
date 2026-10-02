/* =========================================================
   SmartPark — Auth (signup + login)
   ========================================================= */

const API_BASE = '';

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

function showError(elId, textId, msg) {
  const el = document.getElementById(elId);
  const t  = document.getElementById(textId);
  if (!el || !t) return;
  t.textContent = msg;
  el.classList.remove('hidden', 'success');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

/* -------------------- SIGNUP -------------------- */
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('signup-name').value.trim();
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm  = document.getElementById('signup-confirm').value;

    if (!name || !email || !password || !confirm) {
      return showError('signup-error', 'signup-error-text', 'Please fill all fields.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showError('signup-error', 'signup-error-text', 'Please enter a valid email.');
    }
    if (password.length < 6) {
      return showError('signup-error', 'signup-error-text', 'Password must be at least 6 characters.');
    }
    if (password !== confirm) {
      return showError('signup-error', 'signup-error-text', 'Passwords do not match.');
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');

      localStorage.setItem('smartpark_token', data.token);
      localStorage.setItem('smartpark_user', JSON.stringify(data.user));

      showToast('Account created! Redirecting to login…');
      setTimeout(() => { window.location.href = 'login.html'; }, 1100);
    } catch (err) {
      showError('signup-error', 'signup-error-text', err.message);
    }
  });
}

/* -------------------- LOGIN -------------------- */
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      return showError('login-error', 'login-error-text', 'Please enter email and password.');
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');

      localStorage.setItem('smartpark_token', data.token);
      localStorage.setItem('smartpark_user', JSON.stringify(data.user));

      showToast('Logged in! Taking you to the parking lot…');
      setTimeout(() => { window.location.href = 'public.html'; }, 900);
    } catch (err) {
      showError('login-error', 'login-error-text', err.message);
    }
  });
}