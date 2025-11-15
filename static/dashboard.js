const toggleBtn = document.getElementById('toggleThemeBtn');
const accountsTableBody = document.getElementById('accountsTableBody');
const usernameDisplay = document.getElementById('usernameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const createAccountBtn = document.getElementById('createAccountBtn');

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('darkIcon').style.display = 'inline';
    document.getElementById('lightIcon').style.display = 'none';
  } else {
    document.body.classList.remove('dark-mode');
    document.getElementById('lightIcon').style.display = 'inline';
    document.getElementById('darkIcon').style.display = 'none';
  }
  localStorage.setItem('dashboardTheme', theme);
}

function toggleTheme() {
  const currentTheme = localStorage.getItem('dashboardTheme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

toggleBtn.addEventListener('click', toggleTheme);

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

createAccountBtn.addEventListener('click', () => {
  window.location.href = '/create_account.html';  // Your form page for new accounts
});

// Apply saved theme and fetch data on load
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
  applyTheme(savedTheme);
  fetchAccountData();
  fetchUsername();
});

// Fetch account data from backend
async function fetchAccountData() {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated! Please login.');
    window.location.href = '/login.html';
    return;
  }
  try {
    const response = await fetch('/api/accounts/user', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch account data');
    }
    const accounts = await response.json();
    renderAccounts(accounts);
  } catch (error) {
    console.log(error.message);
  }
}

function renderAccounts(accounts) {
  accountsTableBody.innerHTML = '';
  if (accounts.length === 0) {
    accountsTableBody.innerHTML = `<tr><td colspan="3">No accounts found.</td></tr>`;
    return;
  }
  accounts.forEach(acc => {
    const tr = document.createElement('tr');
    tr.classList.add('clickable-row');
    tr.innerHTML = `
      <td>${acc.account_no}</td>
      <td>${acc.account_type}</td>
      <td>${Number(acc.balance).toFixed(2)}</td>
    `;
    tr.addEventListener('click', () => {
      // Redirect to account_details.html with account_no as query param
      window.location.href = `/account_details.html?account_no=${acc.account_no}`;
    });
    accountsTableBody.appendChild(tr);
  });
}


// Fetch username from token or backend
function fetchUsername() {
  const token = localStorage.getItem('token');
  if (!token) return;
  // Decode JWT payload (simple base64 decode - no validation here, use a library for production)
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    usernameDisplay.textContent = payload.email || 'User';
  } catch {
    usernameDisplay.textContent = 'User';
  }
}
