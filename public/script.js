const API = 'http://localhost:3000';
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
 
    // build a lookup map from portfolio summary keyed by coin name
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
      //const pnl = parseFloat(inv.profitLoss);
      //const pnlClass = isNaN(pnl) ? 'na-val' : pnl >= 0 ? 'positive-val' : 'negative-val';
      //const pnlText = inv.profitLoss === 'n/a' ? 'n/a' : (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) + (inv.profitLossPct !== 'n/a' ? ` (${inv.profitLossPct})` : '');
 
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
 
    // legend
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
 
  // ── ADD ──
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
 
  // ── DELETE ──
  async function deleteInvestment(id) {
    if (!confirm('Delete this investment?')) return;
 
    try {
      const res = await apiFetch(`/investments/${id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('Failed to delete', true); return; }
      showToast('Deleted.');
      loadDashboard();
    } catch (e) { showToast('Failed to delete', true); }
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