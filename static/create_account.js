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

  try {
    const resp = await fetch('/api/accounts/create', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ account_type, balance, transaction_pin }),
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
