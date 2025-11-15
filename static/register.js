document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = e.target.username.value;
  const email = e.target.email.value;
  const password = e.target.password.value;

  try {
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await resp.json();
    if (resp.ok) {
      alert(data.message);
      window.location.href = '/login.html';
    } else {
      alert(data.message || 'Registration failed');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
});
