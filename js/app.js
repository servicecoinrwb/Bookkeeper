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
            }
            refreshApp(); // Refresh regardless to show empty state/filters
        }
    });
};

const refreshApp = () => {
    // Only show main app if there is data or user is logged in, 
    // BUT we want to allow CSV upload even if empty.
    if (state.transactions.length > 0 || state.currentUser) {
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('data-section').classList.remove('hidden');
        UI.populateDateDropdowns();
        UI.renderDashboard();
        UI.renderTransactions();
        UI.renderJobs();
        UI.renderAPAR('ar');
        UI.renderAPAR('ap');
        UI.renderTaxes();
        UI.populateCategorySelect('modal-category'); // Pre-fill modals
        UI.populateCategorySelect('rule-category');
    } else {
        document.getElementById('upload-section').classList.remove('hidden');
        document.getElementById('data-section').classList.add('hidden');
    }
};

// --- Tab Switching ---
const tabs = ['transactions', 'jobs', 'ar', 'ap', 'reports', 'taxes', 'guide'];
tabs.forEach(tab => {
    const btn = document.getElementById(`tab-${tab}`);
    if(btn) {
        btn.addEventListener('click', (e) => {
            tabs.forEach(t => {
                document.getElementById(`view-${t}`).classList.add('hidden');
                const b = document.getElementById(`tab-${t}`);
                if(b) b.classList.remove('border-indigo-500', 'text-indigo-600');
            });
            document.getElementById(`view-${tab}`).classList.remove('hidden');
            e.target.classList.add('border-indigo-500', 'text-indigo-600');
            
            // Special Render Calls for Guide/Reports when clicked
            if(tab === 'guide') UI.renderGuide();
            if(tab === 'reports') UI.renderReports('pl'); // Default to PL
        });
    }
});

// --- Action Buttons ---
document.getElementById('save-session-button').addEventListener('click', () => { state.persist(); showToast('Saved!'); });
document.getElementById('clear-session-button').addEventListener('click', () => document.getElementById('confirm-modal').classList.remove('hidden'));
document.getElementById('confirm-delete-button').addEventListener('click', () => { state.clear(); location.reload(); });
document.getElementById('cancel-delete-button').addEventListener('click', () => document.getElementById('confirm-modal').classList.add('hidden'));
document.getElementById('export-button').addEventListener('click', () => exportToIIF(state.transactions));

// Filters
document.getElementById('year-filter').addEventListener('change', () => { UI.renderDashboard(); UI.renderTransactions(); });
document.getElementById('month-filter').addEventListener('change', () => { UI.renderDashboard(); UI.renderTransactions(); });

// --- Edit Transaction & Batch Logic ---
document.getElementById('transaction-table').addEventListener('click', (e) => {
    if(e.target.classList.contains('edit-btn')) {
        const id = e.target.dataset.id;
        const tx = state.transactions.find(t => t.id === id);
        document.getElementById('modal-transaction-id').value = id;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-description').textContent = tx.description;
        UI.populateCategorySelect('modal-category');
        document.getElementById('modal-category').value = tx.category;
        document.getElementById('edit-modal').classList.remove('hidden');
    }
});

document.getElementById('save-button').addEventListener('click', () => {
    const id = document.getElementById('modal-transaction-id').value;
    const newCat = document.getElementById('modal-category').value;
    const newJob = document.getElementById('modal-job').value;
    
    const tx = state.transactions.find(t => t.id === id);
    const oldCat = tx.category;

    // Update current
    state.updateTransaction(id, { category: newCat, job: newJob });
    document.getElementById('edit-modal').classList.add('hidden');

    // Batch Update Check
    if (oldCat !== newCat) {
        const similar = state.transactions.filter(t => 
            t.id !== id && 
            t.description.split(' ')[0] === tx.description.split(' ')[0] && // Simple fuzzy match
            t.category === oldCat
        );
        
        if (similar.length > 0) {
            document.getElementById('batch-update-body').textContent = `Found ${similar.length} similar transactions. Update them all to "${newCat}"?`;
            
            // Temporary listeners for the batch modal
            const yesBtn = document.getElementById('batch-update-confirm-button');
            const noBtn = document.getElementById('batch-update-cancel-button');
            
            const handleBatch = (doUpdate) => {
                if(doUpdate) {
                    similar.forEach(t => t.category = newCat);
                    state.persist();
                    showToast(`Updated ${similar.length} transactions`);
                }
                document.getElementById('batch-update-modal').classList.add('hidden');
                refreshApp();
                // Remove listeners to prevent stacking (simple approach)
                yesBtn.onclick = null;
                noBtn.onclick = null;
            };

            yesBtn.onclick = () => handleBatch(true);
            noBtn.onclick = () => handleBatch(false);
            
            document.getElementById('batch-update-modal').classList.remove('hidden');
        } else {
            refreshApp();
        }
    } else {
        refreshApp();
    }
});
document.getElementById('cancel-button').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));

// --- Category & Rules ---
document.getElementById('add-category-button').addEventListener('click', () => {
    UI.populateCategoryList();
    document.getElementById('category-modal').classList.remove('hidden');
});
document.getElementById('add-new-category-btn').addEventListener('click', () => {
    const val = document.getElementById('new-category-name').value.trim();
    if(val) {
        state.categories.push(val);
        state.categories.sort();
        UI.populateCategoryList();
        document.getElementById('new-category-name').value = '';
    }
});
document.getElementById('close-category-modal').addEventListener('click', () => {
    document.getElementById('category-modal').classList.add('hidden');
    state.persist();
    refreshApp();
});

document.getElementById('rules-button').addEventListener('click', () => {
    UI.populateRulesList();
    document.getElementById('rules-modal').classList.remove('hidden');
});
document.getElementById('add-rule-btn').addEventListener('click', () => {
    const key = document.getElementById('rule-keyword').value;
    const cat = document.getElementById('rule-category').value;
    if(key && cat) {
        state.rules.push({ keyword: key, category: cat });
        UI.populateRulesList();
        document.getElementById('rule-keyword').value = '';
    }
});
document.getElementById('close-rules-modal').addEventListener('click', () => {
    document.getElementById('rules-modal').classList.add('hidden');
    state.persist();
});

// --- AP/AR Logic ---
const openAPAR = (type, id = null) => {
    const modal = document.getElementById('ap-ar-modal');
    document.getElementById('ap-ar-type').value = type;
    document.getElementById('ap-ar-id').value = id || '';
    document.getElementById('ap-ar-modal-title').textContent = type === 'ar' ? 'Invoice' : 'Bill';
    document.getElementById('ap-ar-party-label').textContent = type === 'ar' ? 'Customer' : 'Vendor';
    
    if(id) {
        const item = state.transactions.find(t => t.id === id);
        document.getElementById('ap-ar-party').value = item.party;
        document.getElementById('ap-ar-number').value = item.number;
        document.getElementById('ap-ar-amount').value = item.amount;
        document.getElementById('ap-ar-date').value = item.date;
    } else {
        document.getElementById('ap-ar-party').value = '';
        document.getElementById('ap-ar-number').value = '';
        document.getElementById('ap-ar-amount').value = '';
        document.getElementById('ap-ar-date').value = new Date().toISOString().split('T')[0];
    }
    modal.classList.remove('hidden');
};

document.getElementById('add-invoice-button').addEventListener('click', () => openAPAR('ar'));
document.getElementById('add-bill-button').addEventListener('click', () => openAPAR('ap'));
document.getElementById('ap-ar-cancel-button').addEventListener('click', () => document.getElementById('ap-ar-modal').classList.add('hidden'));

document.getElementById('ap-ar-save-button').addEventListener('click', () => {
    const id = document.getElementById('ap-ar-id').value || `apar-${Date.now()}`;
    const type = document.getElementById('ap-ar-type').value;
    const newData = {
        id,
        type,
        party: document.getElementById('ap-ar-party').value,
        number: document.getElementById('ap-ar-number').value,
        amount: parseFloat(document.getElementById('ap-ar-amount').value) || 0,
        date: document.getElementById('ap-ar-date').value || new Date().toISOString(),
        status: 'unpaid',
        category: type === 'ar' ? 'Income' : 'Uncategorized' // Default
    };
    
    const existingIdx = state.transactions.findIndex(t => t.id === id);
    if(existingIdx > -1) state.transactions[existingIdx] = { ...state.transactions[existingIdx], ...newData };
    else state.transactions.push(newData);
    
    document.getElementById('ap-ar-modal').classList.add('hidden');
    state.persist();
    refreshApp();
});

// --- CSV Import ---
document.getElementById('csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const newTxs = results.data.map((row, i) => {
                // Heuristic to find columns
                const date = row['Date'] || row['date'] || new Date().toISOString();
                const desc = row['Description'] || row['description'] || row['Memo'] || 'No Desc';
                let amt = row['Amount'] || row['amount'] || 0;
                // Handle Debit/Credit columns
                if(row['Debit'] && row['Debit'] !== '') amt = -Math.abs(parseFloat(row['Debit']));
                if(row['Credit'] && row['Credit'] !== '') amt = Math.abs(parseFloat(row['Credit']));
                
                return {
                    id: `tx-${Date.now()}-${i}`,
                    date: typeof date === 'string' ? date : new Date().toISOString(),
                    description: desc,
                    amount: parseFloat(amt) || 0,
                    category: 'Uncategorized',
                    type: 'transaction'
                };
            });
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
