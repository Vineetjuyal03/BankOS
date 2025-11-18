const accountTypeSelect = document.getElementById('account_type');
const durationLabel = document.getElementById('durationLabel');
const durationInput = document.getElementById('account_duration');

accountTypeSelect.addEventListener('change', () => {
  if (accountTypeSelect.value === 'FD') {
    durationLabel.style.display = 'block';
    durationInput.style.display = 'block';
    durationInput.required = true;
  } else {
    durationLabel.style.display = 'none';
    durationInput.style.display = 'none';
    durationInput.required = false;
    durationInput.value = ''; // reset the value when hidden
  }
});

document.getElementById('createAccountForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const account_type = e.target.account_type.value;
  const balance = parseFloat(e.target.balance.value);
  const transaction_pin = e.target.transaction_pin.value;

  const token = localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated! Please login.');
    window.location.href = '/login.html';
    return;
  }

  let fd_duration_seconds = null;
  if (account_type === 'FD') {
    fd_duration_seconds = parseInt(e.target.account_duration.value);
    if (!fd_duration_seconds || fd_duration_seconds <= 0) {
      alert('Please enter a valid duration in seconds for Fixed Deposit.');
      return;
    }
  }

  try {
    const resp = await fetch('/api/accounts/create', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ 
        account_type, 
        balance, 
        transaction_pin,
        fd_duration_seconds  // Only for FD accounts
      }),
    });

    const data = await resp.json();
    if (resp.ok) {
      alert('Account created successfully!');
      window.location.href = '/dashboard.html';
    } else {
      alert(data.message || 'Account creation failed');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
});
