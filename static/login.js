document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = e.target.email.value;
  const password = e.target.password.value;

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await resp.json();
    if (resp.ok) {
      localStorage.setItem('token', data.token);
      alert('Login successful!');
      window.location.href = '/dashboard.html';
    } else {
      alert(data.message || 'Login failed');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

// Persistent login check on page load
window.onload = async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const resp = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (resp.ok) {
        window.location.href = '/dashboard.html';
      } else {
        localStorage.removeItem('token');
      }
    } catch {
      localStorage.removeItem('token');
    }
  }
};

// Google Sign-In callback
function handleCredentialResponse(response) {
  fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: response.credential }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.token) {
        localStorage.setItem('token', data.token);
        alert('Google login successful!');
        window.location.href = '/dashboard.html';
      } else {
        alert('Google login failed');
      }
    })
    .catch(() => alert('Sign-in error'));
}
window.handleCredentialResponse = handleCredentialResponse;
