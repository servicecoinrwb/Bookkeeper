// js/app.js
import { auth, loginUser, logoutUser, loadUserData, saveUserData } from "./firebase-service.js";
import { state } from "./state.js";
import * as UI from "./ui.js";
import { showToast, exportToIIF } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// Init
const init = async () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.currentUser = user;
            document.getElementById('user-info').classList.remove('hidden');
            document.getElementById('user-name').textContent = user.displayName;
            document.getElementById('user-avatar').src = user.photoURL;
            document.getElementById('login-btn').classList.add('hidden');
            
            const cloudData = await loadUserData(user.uid);
            if(cloudData) {
                state.setData(cloudData);
                refreshApp();
            }
        } else {
            state.currentUser = null;
            document.getElementById('user-info').classList.add('hidden');
            document.getElementById('login-btn').classList.remove('hidden');
            const local = localStorage.getItem('bookkeeperSession');
            if(local) {
                state.transactions = JSON.parse(local);
                refreshApp();
            }
        }
    });
};

const refreshApp = () => {
    document.getElementById('upload-section').classList.add('hidden');
    document.getElementById('data-section').classList.remove('hidden');
    UI.populateDateDropdowns();
    UI.renderDashboard();
    UI.renderTransactions();
    UI.renderJobs();
    UI.renderAPAR('ar');
    UI.renderAPAR('ap');
    UI.renderTaxes();
};

// --- Tab Switching ---
const tabs = ['transactions', 'jobs', 'ar', 'ap', 'reports', 'taxes', 'guide'];
tabs.forEach(tab => {
    document.getElementById(`tab-${tab}`).addEventListener('click', (e) => {
        tabs.forEach(t => {
            document.getElementById(`view-${t}`).classList.add('hidden');
            document.getElementById(`tab-${t}`).classList.remove('border-indigo-500', 'text-indigo-600');
        });
        document.getElementById(`view-${tab}`).classList.remove('hidden');
        e.target.classList.add('border-indigo-500', 'text-indigo-600');
    });
});

// --- Modals & Buttons ---
document.getElementById('save-session-btn').addEventListener('click', () => { state.persist(); showToast('Saved!'); });
document.getElementById('clear-session-btn').addEventListener('click', () => { if(confirm('Clear all data?')) { state.clear(); location.reload(); }});
document.getElementById('export-button').addEventListener('click', () => exportToIIF(state.transactions));

// Filters
document.getElementById('year-filter').addEventListener('change', refreshApp);
document.getElementById('month-filter').addEventListener('change', refreshApp);

// Edit Transaction Logic
document.getElementById('transaction-table').addEventListener('click', (e) => {
    if(e.target.classList.contains('edit-btn')) {
        const id = e.target.dataset.id;
        const tx = state.transactions.find(t => t.id === id);
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-job').value = tx.job || '';
        UI.populateCategorySelect('modal-category');
        document.getElementById('modal-category').value = tx.category;
        document.getElementById('edit-modal').classList.remove('hidden');
    }
});
document.getElementById('save-tx-btn').addEventListener('click', () => {
    const id = document.getElementById('modal-tx-id').value;
    state.updateTransaction(id, {
        category: document.getElementById('modal-category').value,
        job: document.getElementById('modal-job').value
    });
    document.getElementById('edit-modal').classList.add('hidden');
    refreshApp();
});
document.getElementById('close-edit-modal').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));

// Category Management
document.getElementById('manage-categories-btn').addEventListener('click', () => {
    UI.populateCategoryList();
    document.getElementById('category-modal').classList.remove('hidden');
});
document.getElementById('add-cat-btn').addEventListener('click', () => {
    const val = document.getElementById('new-cat-input').value.trim();
    if(val) {
        state.categories.push(val);
        state.categories.sort();
        UI.populateCategoryList();
        document.getElementById('new-cat-input').value = '';
    }
});
document.getElementById('category-list').addEventListener('click', (e) => {
    if(e.target.classList.contains('del-cat-btn')) {
        const cat = e.target.dataset.cat;
        state.categories = state.categories.filter(c => c !== cat);
        UI.populateCategoryList();
    }
});
document.getElementById('close-cat-modal').addEventListener('click', () => {
    document.getElementById('category-modal').classList.add('hidden');
    state.persist();
    refreshApp();
});

// AP/AR Logic
const openAPAR = (type, id = null) => {
    const modal = document.getElementById('apar-modal');
    document.getElementById('apar-type').value = type;
    document.getElementById('apar-id').value = id || '';
    document.getElementById('apar-title').textContent = type === 'ar' ? 'Invoice' : 'Bill';
    
    if(id) {
        const item = state.transactions.find(t => t.id === id);
        document.getElementById('apar-party').value = item.party;
        document.getElementById('apar-number').value = item.number;
        document.getElementById('apar-amount').value = item.amount;
        document.getElementById('apar-date').value = item.date;
    } else {
        document.getElementById('apar-party').value = '';
        document.getElementById('apar-number').value = '';
        document.getElementById('apar-amount').value = '';
    }
    modal.classList.remove('hidden');
};

document.getElementById('add-invoice-btn').addEventListener('click', () => openAPAR('ar'));
document.getElementById('add-bill-btn').addEventListener('click', () => openAPAR('ap'));
document.getElementById('close-apar-modal').addEventListener('click', () => document.getElementById('apar-modal').classList.add('hidden'));

document.getElementById('save-apar-btn').addEventListener('click', () => {
    const id = document.getElementById('apar-id').value || `apar-${Date.now()}`;
    const type = document.getElementById('apar-type').value;
    const newData = {
        id,
        type,
        party: document.getElementById('apar-party').value,
        number: document.getElementById('apar-number').value,
        amount: parseFloat(document.getElementById('apar-amount').value) || 0,
        date: document.getElementById('apar-date').value || new Date().toISOString(),
        status: 'unpaid'
    };
    
    const existingIdx = state.transactions.findIndex(t => t.id === id);
    if(existingIdx > -1) state.transactions[existingIdx] = { ...state.transactions[existingIdx], ...newData };
    else state.transactions.push(newData);
    
    document.getElementById('apar-modal').classList.add('hidden');
    state.persist();
    refreshApp();
});

// CSV Import
document.getElementById('csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const newTxs = results.data.map((row, i) => ({
                id: `tx-${Date.now()}-${i}`,
                date: row['Date'] || new Date().toISOString(),
                description: row['Description'] || 'No Desc',
                amount: parseFloat(row['Amount']) || 0,
                category: 'Uncategorized',
                type: 'transaction'
            }));
            state.addTransactions(newTxs);
            refreshApp();
            showToast('Imported!');
        }
    });
});

// Auth Listeners
document.getElementById('login-btn').addEventListener('click', loginUser);
document.getElementById('logout-btn').addEventListener('click', () => { logoutUser(); location.reload(); });

// Start
init();
