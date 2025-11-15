const backBtn = document.getElementById('backBtn');
const createFdForm = document.getElementById('createFdForm');
const createFdMessage = document.getElementById('createFdMessage');
const fdList = document.getElementById('fdList');

// Extract account_no from URL query params
function getQueryParam(param) {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}

const accountNo = getQueryParam('account_no');

backBtn.addEventListener('click', () => {
  window.location.href = '/dashboard.html';
});

async function fetchFDs() {
  if (!accountNo) return;
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated');
    window.location.href = '/login.html';
    return;
  }
  try {
    const res = await fetch(`/api/fixedDeposits/user?account_no=${accountNo}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to fetch Fixed Deposits');
    const fds = await res.json();
    if (fds.length === 0) {
      fdList.innerHTML = '<p>No Fixed Deposits found.</p>';
      return;
    }
    fdList.innerHTML = '<ul>' + fds.map(fd => `
      <li>
        FD ID: ${fd.fd_id} | Principal: $${Number(fd.principal).toFixed(2)} | 
        Interest: ${fd.interest_rate}% | Tenure: ${fd.tenure_months} months | 
        Start: ${new Date(fd.start_date).toLocaleDateString()} | 
        Maturity: ${new Date(fd.maturity_date).toLocaleDateString()} | 
        Status: ${fd.status}
      </li>`).join('') + '</ul>';
  } catch (error) {
    fdList.textContent = 'Error loading Fixed Deposits';
  }
}

createFdForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createFdMessage.textContent = '';
  const principal = parseFloat(document.getElementById('principal').value);
  const tenure_months = parseInt(document.getElementById('tenure').value);
  const interest_rate = parseFloat(document.getElementById('interestRate').value);
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated');
    window.location.href = '/login.html';
    return;
  }
  try {
    const res = await fetch('/api/fixedDeposits/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ account_no: accountNo, principal, tenure_months, interest_rate })
    });
    const data = await res.json();
    if (res.ok) {
      createFdMessage.textContent = 'FD creation successful. ID: ' + data.fd_id;
      createFdForm.reset();
      fetchFDs();
    } else {
      createFdMessage.textContent = 'Error: ' + data.message;
    }
  } catch (error) {
    createFdMessage.textContent = 'Network error';
  }
});

// Load existing FDs on page load
fetchFDs();
