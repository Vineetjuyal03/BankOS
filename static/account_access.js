document.addEventListener('DOMContentLoaded', () => {
    const accessList = document.getElementById('accessList');
    const addUserBtn = document.getElementById('addUserBtn');
    const popupCard = document.getElementById('popupCard');
    const addUserForm = document.getElementById('addUserForm');
    const cancelBtn = document.getElementById('cancelBtn');
    const backBtn = document.getElementById('backBtn');
    const deletePopupCard = document.getElementById('deletePopupCard');
    const deleteAccessForm = document.getElementById('deleteAccessForm');
    const delUserIdSpan = document.getElementById('delUserId');
    const delCancelBtn = document.getElementById('delCancelBtn');

    let userIdToRemove = null;  // Declare here to use in multiple handlers

    // Utility: get query param from URL
    function getQueryParam(param) {
        const params = new URLSearchParams(window.location.search);
        return params.get(param);
    }

    const accountNo = getQueryParam('account_no');

    backBtn.addEventListener('click', () => {
        window.history.back();
    });

    // Show Add User popup
    addUserBtn.addEventListener('click', () => {
        popupCard.classList.remove('hidden');
    });

    // Hide Add User popup
    cancelBtn.addEventListener('click', () => {
        popupCard.classList.add('hidden');
        addUserForm.reset();
    });

    // Fetch and display users with access
    async function fetchAccessList() {
        if (!accountNo) {
            accessList.textContent = 'No account specified.';
            return;
        }
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Not authenticated!');
            window.location.href = '/login.html';
            return;
        }

        accessList.textContent = 'Loading...';

        try {
            const response = await fetch(`/api/accounts/access?account_no=${accountNo}`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!response.ok && response.status !== 304) {
                throw new Error('Failed to load access list');
            }

            if (response.status === 304) {
                // Optionally handle cache scenario
                return;
            }

            const data = await response.json();
            const users = data.users;
            const ownerUserId = data.owner_user_id;

            if (users.length === 0) {
                accessList.textContent = 'No users have access to this account.';
                return;
            }

            accessList.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>User ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Delete Access</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr data-userid="${user.user_id}">
                <td>${user.user_id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td><button class="deleteBtn" ${user.user_id == ownerUserId ? 'disabled' : ''}>Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

            // Attach delete event listeners
            document.querySelectorAll('.deleteBtn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const tr = e.target.closest('tr');
                    userIdToRemove = tr.getAttribute('data-userid');
                    delUserIdSpan.textContent = userIdToRemove;
                    deletePopupCard.classList.remove('hidden');
                });
            });

        } catch (err) {
            accessList.textContent = 'Error loading user access list.';
        }
    }

    // Hide delete popup on cancel
    delCancelBtn.addEventListener('click', () => {
        deletePopupCard.classList.add('hidden');
        deleteAccessForm.reset();
    });

    // Handle Delete Access form submit
    deleteAccessForm.addEventListener('submit', async e => {
        e.preventDefault();
        const transaction_pin = document.getElementById('del_transaction_pin').value.trim();
        if (!transaction_pin) {
            alert('Please enter transaction PIN');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('Not authenticated!');
            window.location.href = '/login.html';
            return;
        }

        try {
            const response = await fetch('/api/accounts/access/remove', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    account_no: accountNo,
                    user_id: parseInt(userIdToRemove),
                    transaction_pin: transaction_pin
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message || 'User access removed successfully');
                deletePopupCard.classList.add('hidden');
                deleteAccessForm.reset();
                fetchAccessList();  // Refresh list after removal
            } else {
                alert('Error: ' + (data.message || 'Failed to remove access'));
            }
        } catch {
            alert('Network error');
        }
    });

    // Handle add user form submit
    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user_email = document.getElementById('user_email').value.trim();
        const transaction_pin = document.getElementById('transaction_pin').value.trim();

        if (!user_email || !transaction_pin) {
            alert('Please fill all fields');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('Not authenticated!');
            window.location.href = '/login.html';
            return;
        }

        try {
            const response = await fetch('/api/accounts/access/add', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ account_no: accountNo, user_email, transaction_pin })
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message || 'User access added');
                popupCard.classList.add('hidden');
                addUserForm.reset();
                fetchAccessList();  // refresh list
            } else {
                alert('Error: ' + (data.message || 'Failed to add user'));
            }
        } catch (err) {
            alert('Network error');
        }
    });

    // Initial fetch
    fetchAccessList();
});
