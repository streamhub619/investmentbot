const API = 'https://investmentbot1-bx169kr4.b4a.run/';
let token = null;
let username = null;
let chart = null;
let isRegisterMode = false;

// ── AUTH ──
function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  document.getElementById('auth-btn').textContent = isRegisterMode ? 'CREATE ACCOUNT' : 'SIGN IN';
  document.getElementById('auth-toggle-btn').textContent = isRegisterMode ? 'BACK TO LOGIN' : 'CREATE ACCOUNT';
  document.getElementById('login-sub').textContent = isRegisterMode ? 'Create a new account' : 'Sign in to your portfolio';
  document.getElementById('email-field').style.display = isRegisterMode ? 'block' : 'none';
  document.getElementById('login-error').textContent = '';
}

async function handleAuth() {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value.trim();
  const e = document.getElementById('auth-email').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!u || !p) { errEl.textContent = 'Username and password required.'; return; }
  if (isRegisterMode && !e) { errEl.textContent = 'Email is required to register.'; return; }

  const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
  const body = isRegisterMode
    ? { username: u, password: p, email: e }
    : { username: u, password: p };

  try {
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Something went wrong.';
      return;
    }

    token = data.token;
    username = u;
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    document.getElementById('header-username').textContent = username;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadDashboard();
  } catch (e) {
    errEl.textContent = 'Could not connect to server.';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
    handleAuth();
  }
});

function logout() {
  token = null;
  username = null;
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-email').value = '';
  if (chart) { chart.destroy(); chart = null; }
}

// ── API HELPERS ──
async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  return res;
}

// ── LOAD DASHBOARD ──
async function loadDashboard() {
  let portfolioAssets = [];
  try {
    const res = await apiFetch('/portfolio/summary');
    const data = await res.json();
    renderStats(data);
    renderChart(data.assets);
    portfolioAssets = data.assets || [];
  } catch (e) { showToast('Failed to load portfolio', true); }

  try {
    const res = await apiFetch('/investments');
    const data = await res.json();
    renderTable(data, portfolioAssets);
  } catch (e) { showToast('Failed to load investments', true); }

  loadAlerts();
  loadExchanges();
}

// ── STATS ──
function renderStats(data) {
  const fmt = v => isNaN(v) ? 'n/a' : '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2 });

  document.getElementById('stat-total-val').textContent = fmt(data.totalCurrentValue);
  document.getElementById('stat-cost-val').textContent = fmt(data.totalCostBasis);

  const pnlEl = document.getElementById('stat-pnl-val');
  const pnl = parseFloat(data.totalProfitLoss);
  if (isNaN(pnl)) {
    pnlEl.textContent = 'n/a';
    pnlEl.className = 'stat-value';
  } else {
    pnlEl.textContent = (pnl >= 0 ? '+' : '') + fmt(pnl);
    pnlEl.className = 'stat-value ' + (pnl >= 0 ? 'positive' : 'negative');
  }

  setTimeout(() => {
    document.querySelectorAll('.stat-card').forEach(c => c.classList.add('loaded'));
  }, 100);
}

// ── TABLE ──
function renderTable(investments, portfolioAssets) {
  const tbody = document.getElementById('investments-tbody');

  if (!investments.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📊</div>No investments yet. Add one above.</div></td></tr>`;
    return;
  }

  const priceMap = {};
  portfolioAssets.forEach(a => { priceMap[a.coin] = a; });

  tbody.innerHTML = investments.map(inv => {
    const live = priceMap[inv.name.toLowerCase()] || {};

    const currentPrice = live.currentPrice ? '$' + parseFloat(live.currentPrice).toLocaleString() : '<span class="na-val">n/a</span>';
    const currentValue = live.currentValue ? '$' + parseFloat(live.currentValue).toLocaleString() : '<span class="na-val">n/a</span>';

    const pnl = parseFloat(live.profitLoss);
    const pnlClass = !live.profitLoss || live.profitLoss === 'n/a' ? 'na-val' : pnl >= 0 ? 'positive-val' : 'negative-val';
    const pnlText = !live.profitLoss || live.profitLoss === 'n/a'
      ? 'n/a'
      : (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) + (live.profitLossPct && live.profitLossPct !== 'n/a' ? ` (${live.profitLossPct})` : '');

    return `<tr>
      <td><span class="coin-name">${inv.name}</span></td>
      <td>${inv.amount}</td>
      <td>${inv.purchase_price ? '$' + parseFloat(inv.purchase_price).toLocaleString() : '<span class="na-val">n/a</span>'}</td>
      <td>${currentPrice}</td>
      <td>${currentValue}</td>
      <td><span class="${pnlClass}">${pnlText}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-outline" onclick="openEdit(${inv.id}, '${inv.name}', ${inv.amount}, ${inv.purchase_price || 0})">EDIT</button>
          <button class="btn btn-sm btn-danger" onclick="deleteInvestment(${inv.id})">DEL</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── CHART ──
const COLORS = ['#00ff9d','#00c8ff','#ffc43d','#ff4d6d','#b48eff','#ff9e4d','#4dffdb','#ff4dbe'];

function renderChart(assets) {
  if (!assets || !assets.length) return;

  const labels = assets.map(a => a.coin.toUpperCase());
  const values = assets.map(a => parseFloat(a.currentValue));
  const total = values.reduce((s, v) => s + v, 0);
  const colors = assets.map((_, i) => COLORS[i % COLORS.length]);

  const ctx = document.getElementById('portfolioChart').getContext('2d');
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#0f1318',
        borderWidth: 3,
        hoverBorderWidth: 3,
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` $${ctx.parsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          }
        }
      }
    }
  });

  document.getElementById('chart-legend').innerHTML = assets.map((a, i) => {
    const pct = total > 0 ? ((parseFloat(a.currentValue) / total) * 100).toFixed(1) : 0;
    return `<div class="legend-item">
      <div class="legend-left">
        <div class="legend-dot" style="background:${colors[i]}"></div>
        <span class="legend-name">${a.coin}</span>
      </div>
      <span class="legend-pct">${pct}%</span>
    </div>`;
  }).join('');
}

// ── ADD INVESTMENT ──
async function addInvestment() {
  const name = document.getElementById('add-name').value.trim();
  const amount = document.getElementById('add-amount').value;
  const purchase_price = document.getElementById('add-price').value;

  if (!name || !amount) { showToast('Coin and quantity required', true); return; }

  try {
    const res = await apiFetch('/investments', {
      method: 'POST',
      body: JSON.stringify({ name, amount: parseFloat(amount), purchase_price: purchase_price ? parseFloat(purchase_price) : undefined })
    });

    if (!res.ok) {
      const d = await res.json();
      showToast((d.errors || [d.error]).join(', '), true);
      return;
    }

    document.getElementById('add-name').value = '';
    document.getElementById('add-amount').value = '';
    document.getElementById('add-price').value = '';
    showToast('Investment added!');
    loadDashboard();
  } catch (e) { showToast('Failed to add investment', true); }
}

// ── EDIT ──
function openEdit(id, name, amount, price) {
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-name').value = name;
  document.getElementById('edit-amount').value = amount;
  document.getElementById('edit-price').value = price || '';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('edit-name').value.trim();
  const amount = document.getElementById('edit-amount').value;
  const purchase_price = document.getElementById('edit-price').value;

  try {
    const res = await apiFetch(`/investments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, amount: parseFloat(amount), purchase_price: purchase_price ? parseFloat(purchase_price) : undefined })
    });

    if (!res.ok) {
      const d = await res.json();
      showToast((d.errors || [d.error]).join(', '), true);
      return;
    }

    closeModal();
    showToast('Investment updated!');
    loadDashboard();
  } catch (e) { showToast('Failed to update', true); }
}

// ── DELETE INVESTMENT ──
async function deleteInvestment(id) {
  if (!confirm('Delete this investment?')) return;

  try {
    const res = await apiFetch(`/investments/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Failed to delete', true); return; }
    showToast('Deleted.');
    loadDashboard();
  } catch (e) { showToast('Failed to delete', true); }
}

// ── ALERTS ──
async function loadAlerts() {
  try {
    const res = await apiFetch('/alerts');
    const alerts = await res.json();
    renderAlerts(alerts);
  } catch (e) { showToast('Failed to load alerts', true); }
}

function renderAlerts(alerts) {
  const tbody = document.getElementById('alerts-tbody');

  if (!alerts.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🔔</div>No alerts set. Add one above.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(alert => {
    const date = new Date(alert.created_at).toLocaleDateString();
    const dirClass = alert.direction === 'above' ? 'positive-val' : 'negative-val';
    const dirLabel = alert.direction === 'above' ? '▲ ABOVE' : '▼ BELOW';

    return `<tr>
      <td><span class="coin-name">${alert.coin}</span></td>
      <td><span class="${dirClass}">${dirLabel}</span></td>
      <td>$${parseFloat(alert.target_price).toLocaleString()}</td>
      <td>${date}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteAlert(${alert.id})">DEL</button>
      </td>
    </tr>`;
  }).join('');
}

async function addAlert() {
  const coin = document.getElementById('alert-coin').value.trim();
  const target_price = document.getElementById('alert-price').value;
  const direction = document.getElementById('alert-direction').value;

  if (!coin || !target_price) { showToast('Coin and target price required', true); return; }

  try {
    const res = await apiFetch('/alerts', {
      method: 'POST',
      body: JSON.stringify({ coin, target_price: parseFloat(target_price), direction })
    });

    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || 'Failed to add alert', true);
      return;
    }

    document.getElementById('alert-coin').value = '';
    document.getElementById('alert-price').value = '';
    document.getElementById('alert-direction').value = 'above';
    showToast('Alert created!');
    loadAlerts();
  } catch (e) { showToast('Failed to add alert', true); }
}

async function deleteAlert(id) {
  if (!confirm('Delete this alert?')) return;

  try {
    const res = await apiFetch(`/alerts/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Failed to delete alert', true); return; }
    showToast('Alert deleted.');
    loadAlerts();
  } catch (e) { showToast('Failed to delete alert', true); }
}

// ── TOAST ──
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  setTimeout(() => t.className = '', 3000);
}

// close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── FORGOT PASSWORD ──
function showForgotPassword() {
  document.getElementById('login-fields').style.display = 'none';
  document.getElementById('forgot-form').style.display = 'block';
}

function hideForgotPassword() {
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('login-fields').style.display = 'block';
}

async function requestPasswordReset() {
  const email = document.getElementById('forgot-email').value.trim();
  const msgEl = document.getElementById('forgot-message');

  if (!email) { msgEl.textContent = 'Email required.'; return; }

  try {
    const res = await fetch(API + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    msgEl.style.color = 'var(--accent)';
    msgEl.textContent = data.message || 'Check your email.';
  } catch (e) {
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = 'Could not connect to server.';
  }
}

// ── EXCHANGES ──
async function loadExchanges() {
  try {
    const res = await apiFetch('/exchanges');
    const exchanges = await res.json();
    renderExchanges(exchanges);
  } catch (e) { showToast('Failed to load exchanges', true); }
}

function renderExchanges(exchanges) {
  const tbody = document.getElementById('exchanges-tbody');

  if (!exchanges.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🔗</div>No exchanges connected. Add one above.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = exchanges.map(ex => {
    const lastSynced = ex.last_synced_at
      ? new Date(ex.last_synced_at).toLocaleString()
      : '<span class="na-val">Never</span>';
    const connectedDate = new Date(ex.created_at).toLocaleDateString();
    const exchangeLabel = ex.exchange.charAt(0).toUpperCase() + ex.exchange.slice(1);

    return `<tr>
      <td><span class="coin-name">${exchangeLabel}</span></td>
      <td><span class="positive-val">● CONNECTED</span></td>
      <td>${lastSynced}</td>
      <td>${connectedDate}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="disconnectExchange(${ex.id}, '${ex.exchange}')">DISCONNECT</button>
      </td>
    </tr>`;
  }).join('');
}

async function connectExchange() {
  const exchange = document.getElementById('exchange-name').value;
  const api_key = document.getElementById('exchange-key').value.trim();
  const api_secret = document.getElementById('exchange-secret').value.trim();

  if (!api_key || !api_secret) { showToast('API key and secret required', true); return; }

  try {
    const res = await apiFetch('/exchanges/connect', {
      method: 'POST',
      body: JSON.stringify({ exchange, api_key, api_secret })
    });

    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || 'Failed to connect exchange', true);
      return;
    }

    document.getElementById('exchange-key').value = '';
    document.getElementById('exchange-secret').value = '';
    showToast(`${exchange} connected! Syncing trades...`);
    loadExchanges();

    // trigger a sync immediately after connecting
    await syncExchanges();
    loadDashboard();
  } catch (e) { showToast('Failed to connect exchange', true); }
}

async function disconnectExchange(id, exchange) {
  if (!confirm(`Disconnect ${exchange}? Synced trades will remain in your portfolio.`)) return;

  try {
    const res = await apiFetch(`/exchanges/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Failed to disconnect', true); return; }
    showToast(`${exchange} disconnected.`);
    loadExchanges();
  } catch (e) { showToast('Failed to disconnect', true); }
}

async function syncExchanges() {
  const btn = document.getElementById('sync-btn');
  btn.textContent = '↻ SYNCING...';
  btn.disabled = true;

  try {
    const res = await apiFetch('/exchanges/sync', { method: 'POST' });
    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || 'Sync failed', true);
      return;
    }
    showToast('Sync complete! Portfolio updated.');
    loadDashboard();
    loadExchanges();
  } catch (e) {
    showToast('Sync failed', true);
  } finally {
    btn.textContent = '↻ SYNC NOW';
    btn.disabled = false;
  }
}

// ── SESSION RESTORE ──
(function checkExistingSession() {
  const savedToken = localStorage.getItem('token');
  const savedUsername = localStorage.getItem('username');

  if (savedToken && savedUsername) {
    token = savedToken;
    username = savedUsername;
    document.getElementById('header-username').textContent = username;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadDashboard();
  }
})();