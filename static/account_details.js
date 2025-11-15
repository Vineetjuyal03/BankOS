const accountNoSpan = document.getElementById('accountNo');
const accountTypeSpan = document.getElementById('accountType');
const balanceSpan = document.getElementById('balance');
const ownerEmailSpan = document.getElementById('ownerEmail');
const creationDateSpan = document.getElementById('creationDate');
const backBtn = document.getElementById('backBtn');

const withdrawBtn = document.getElementById('withdrawBtn');
const depositBtn = document.getElementById('depositBtn');
const transferBtn = document.getElementById('transferBtn');

const popupCard = document.getElementById('popupCard');
const popupTitle = document.getElementById('popupTitle');
const transactionForm = document.getElementById('transactionForm');
const cancelBtn = document.getElementById('cancelBtn');
const transferAccountContainer = document.getElementById('transferAccountContainer');
const toAccountInput = document.getElementById('to_account');

// Helper to get query param from URL
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Format ISO date to readable string
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Fetch account details
async function fetchAccountDetails(accountNo) {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated! Please login.');
    window.location.href = '/login.html';
    return;
  }
  try {
    const response = await fetch(`/api/accounts/details?account_no=${accountNo}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch account details');
    }
    const data = await response.json();
    displayAccountDetails(data);
  } catch (error) {
    alert(error.message);
  }
}

// Populate details on page
function displayAccountDetails(data) {
  accountNoSpan.textContent = data.account_no;
  accountTypeSpan.textContent = data.account_type;
  balanceSpan.textContent = Number(data.balance).toFixed(2);
  ownerEmailSpan.textContent = data.owner_email;
  creationDateSpan.textContent = formatDate(data.created_at);
}

function openPopup(type) {
  popupCard.classList.remove('hidden');
  popupTitle.textContent = `${type.charAt(0)}${type.slice(1).toLowerCase()} Funds`;
  if (type === 'TRANSFER') {
    transferAccountContainer.classList.remove('hidden');
    toAccountInput.required = true;
  } else {
    transferAccountContainer.classList.add('hidden');
    toAccountInput.required = false;
  }
}

function closePopup() {
  popupCard.classList.add('hidden');
  transactionForm.reset();
}

backBtn.addEventListener('click', () => {
  window.location.href = '/dashboard.html';
});

cancelBtn.addEventListener('click', closePopup);

withdrawBtn.addEventListener('click', () => openPopup('WITHDRAW'));
depositBtn.addEventListener('click', () => openPopup('DEPOSIT'));
transferBtn.addEventListener('click', () => openPopup('TRANSFER'));


async function fetchTransactionHistory(accountNo) {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated! Please login.');
    window.location.href = '/login.html';
    return;
  }

  try {
    const response = await fetch(`/api/accounts/transactions/history?account_no=${accountNo}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch transactions');
    }

    const transactions = await response.json();
    displayTransactionHistory(transactions);
  } catch (error) {
    alert(error.message);
  }
}

function displayTransactionHistory(transactions) {
  const txSection = document.getElementById('transactionList');
  if (transactions.length === 0) {
    txSection.innerHTML = '<p>No transactions found.</p>';
    return;
  }

  // Build a simple table
  let html = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>From Account</th>
          <th>To Account</th>
          <th>Amount</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
  `;

  transactions.forEach(tx => {
    html += `
      <tr>
        <td>${tx.transaction_id}</td>
        <td>${tx.transaction_type}</td>
        <td>${tx.from_account}</td>
        <td>${tx.to_account}</td>
        <td>$${Number(tx.amount).toFixed(2)}</td>
        <td>${new Date(tx.transaction_date).toLocaleString()}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  txSection.innerHTML = html;
}

// Modify DOMContentLoaded or page init to fetch tx history

document.addEventListener('DOMContentLoaded', () => {
  const accountNo = getQueryParam('account_no');
  if (!accountNo) {
    alert('No account specified');
    window.location.href = '/dashboard.html';
    return;
  }
  fetchAccountDetails(accountNo);
  fetchTransactionHistory(accountNo);  // Fetch transactions after loading details
});

transactionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const transactionType = popupTitle.textContent.split(' ')[0].toUpperCase(); // e.g. "TRANSFER"
  const amount = transactionForm.amount.value.trim();
  const transactionPin = transactionForm.transaction_pin.value.trim();
  const fromAccount = accountNoSpan.textContent.trim();
  const toAccount = transactionForm.to_account.value.trim();

  if (transactionType === 'TRANSFER' && Number(toAccount) === Number(fromAccount)) {
    alert(`Debug: Transfer to self detected (account ${fromAccount}). Transaction successful without backend call.`);
    closePopup();
    return;
  }

  // Prepare payload
  const payload = {
    transaction_type: transactionType,
    amount: parseFloat(amount),
    transaction_pin: transactionPin,
    from_account: fromAccount,
    to_account: transactionType === 'TRANSFER' ? toAccount : fromAccount
  };

  alert('Debug: Sending transaction to backend: ' + JSON.stringify(payload));

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Not authenticated! Please login.');
      window.location.href = '/login.html';
      return;
    }

    const response = await fetch('/api/accounts/transactions/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      alert('Transaction successful: ' + JSON.stringify(data));
      closePopup();
    } else {
      alert('Transaction failed: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Network error: ' + error.message);
  }
});
const accessBtn = document.getElementById('accessBtn');

accessBtn.addEventListener('click', () => {
  // Get the current account number from the page (assumes you already have it)
  const accountNo = document.getElementById('accountNo').textContent.trim();

  // Redirect to the account access page, passing the account_no as a query param
  window.location.href = `/account_access.html?account_no=${encodeURIComponent(accountNo)}`;
});
