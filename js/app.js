// js/app.js
import { auth, loginUser, logoutUser, loadUserData } from "./firebase-service.js";
import { state } from "./state.js";
import { renderDashboard, renderTransactions, populateCategorySelect } from "./ui.js";
import { showToast, parseDate } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const uploadSection = document.getElementById('upload-section');
const dataSection = document.getElementById('data-section');
const csvInput = document.getElementById('csv-file');
const editModal = document.getElementById('edit-modal');

// Init Logic
const init = async () => {
    // Auth Listener
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.currentUser = user;
            document.getElementById('user-info').classList.remove('hidden');
            document.getElementById('user-name').textContent = user.displayName;
            document.getElementById('user-avatar').src = user.photoURL;
            loginBtn.classList.add('hidden');

            const cloudData = await loadUserData(user.uid);
            if (cloudData) {
                state.setData(cloudData);
                showApp();
            }
        } else {
            state.currentUser = null;
            document.getElementById('user-info').classList.add('hidden');
            loginBtn.classList.remove('hidden');
            // Try local storage
            const local = localStorage.getItem('bookkeeperSession');
            if (local) {
                state.transactions = JSON.parse(local);
                showApp();
            }
        }
    });
};

const showApp = () => {
    uploadSection.classList.add('hidden');
    dataSection.classList.remove('hidden');
    renderDashboard();
    renderTransactions();
    populateDateFilters();
};

// CSV Handler
csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const newTxs = results.data.map((row, index) => {
                // Simple mapping (Expand this based on your bank's CSV format)
                return {
                    id: `tx-${Date.now()}-${index}`,
                    date: row['Date'] || new Date().toISOString(),
                    description: row['Description'] || 'No Desc',
                    amount: parseFloat(row['Amount']) || 0,
                    category: 'Uncategorized',
                    job: ''
                };
            });
            state.addTransactions(newTxs);
            showApp();
            showToast(`${newTxs.length} transactions imported`);
        }
    });
});

// Event Listeners
loginBtn.addEventListener('click', loginUser);
logoutBtn.addEventListener('click', async () => {
    await logoutUser();
    window.location.reload();
});

// Edit Modal Logic
document.getElementById('transaction-table').addEventListener('click', (e) => {
    if (e.target.classList.contains('edit-btn')) {
        const id = e.target.dataset.id;
        const tx = state.transactions.find(t => t.id === id);

        document.getElementById('modal-transaction-id').value = id;
        document.getElementById('modal-job').value = tx.job || '';
        populateCategorySelect('modal-category');
        document.getElementById('modal-category').value = tx.category;

        editModal.classList.remove('hidden');
    }
});

document.getElementById('save-edit-btn').addEventListener('click', () => {
    const id = document.getElementById('modal-transaction-id').value;
    const category = document.getElementById('modal-category').value;
    const job = document.getElementById('modal-job').value;

    state.updateTransaction(id, { category, job });
    editModal.classList.add('hidden');
    renderTransactions();
    renderDashboard();
});

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    editModal.classList.add('hidden');
});

// Start
init();

function populateDateFilters() {
    // Populate the year/month dropdowns based on state.transactions
}
