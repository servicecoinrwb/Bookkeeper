// js/app.js
import { auth, loginUser, logoutUser, loadUserData, saveUserData } from "./firebase-service.js";
import { state } from "./state.js";
import * as UI from "./ui.js"; // This imports ALL the functions we just exported
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
            refreshApp(); 
        }
    });
};

const refreshApp = () => {
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
        UI.populateCategorySelect('modal-category'); 
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
            
            if(tab === 'guide') UI.renderGuide();
            if(tab === 'reports') UI.renderReports('pl'); 
        });
    }
});

// --- Action Buttons ---
const saveBtn = document.getElementById('save-session-button');
if(saveBtn) saveBtn.addEventListener('click', () => { state.persist(); showToast('Saved!'); });

const clearBtn = document.getElementById('clear-session-button');
if(clearBtn) clearBtn.addEventListener('click', () => document.getElementById('confirm-modal').classList.remove('hidden'));

document.getElementById('confirm-delete-button').addEventListener('click', () => { state.clear(); location.reload(); });
document.getElementById('cancel-delete-button').addEventListener('click', () => document.getElementById('confirm-modal').classList.add('hidden'));
document.getElementById('export-button').addEventListener('click', () => exportToIIF(state.transactions));

// Filters
document.getElementById('year-filter').addEventListener('change', () => { UI.renderDashboard(); UI.renderTransactions(); });
document.getElementById('month-filter').addEventListener('change', () => { UI.renderDashboard(); UI.renderTransactions(); });

// --- Edit Transaction & Batch Logic ---
document.getElementById('transaction-table').addEventListener('click', (e) => {
    // Edit Button
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
    // Reconcile Checkbox Logic (Auto-Save state)
    if(e.target.type === 'checkbox') {
        const id = e.target.dataset.id; // We need to add data-id to checkboxes in UI.js
        // If UI.js handles the click, we don't need logic here, but for state persistence:
        // Ideally, UI.js checkboxes should trigger a state update.
        // Let's rely on UI.js rendering correctly and update state here if needed.
        // Actually, let's delegate the click in UI to update state directly.
        // See updated renderTransactions in UI.js which adds event listeners there? 
        // Better: Handle it here via delegation.
        if (id) {
             const tx = state.transactions.find(t => t.id === id);
             if(tx) {
                 tx.reconciled = e.target.checked;
                 state.persist(); // Auto-save on check
             }
        }
    }
});

document.getElementById('save-button').addEventListener('click', () => {
    const id = document.getElementById('modal-transaction-id').value;
    const newCat = document.getElementById('modal-category').value;
    const newJob = document.getElementById('modal-job').value;
    
    const tx = state.transactions.find(t => t.id === id);
    const oldCat = tx.category;

    state.updateTransaction(id, { category: newCat, job: newJob });
    document.getElementById('edit-modal').classList.add('hidden');

    if (oldCat !== newCat) {
        const similar = state.transactions.filter(t => 
            t.id !== id && 
            t.description.split(' ')[0] === tx.description.split(' ')[0] && 
            t.category === oldCat
        );
        
        if (similar.length > 0) {
            document.getElementById('batch-update-body').textContent = `Found ${similar.length} similar transactions. Update them all to "${newCat}"?`;
            
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

const invBtn = document.getElementById('add-invoice-button');
if(invBtn) invBtn.addEventListener('click', () => openAPAR('ar'));

const billBtn = document.getElementById('add-bill-button');
if(billBtn) billBtn.addEventListener('click', () => openAPAR('ap'));

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
        category: type === 'ar' ? 'Income' : 'Uncategorized' 
    };
    
    const existingIdx = state.transactions.findIndex(t => t.id === id);
    if(existingIdx > -1) state.transactions[existingIdx] = { ...state.transactions[existingIdx], ...newData };
    else state.transactions.push(newData);
    
    document.getElementById('ap-ar-modal').classList.add('hidden');
    state.persist();
    refreshApp();
});

// --- Reconciliation Logic ---
document.getElementById('start-reconcile-btn').addEventListener('click', () => {
    const modal = document.getElementById('reconcile-modal');
    modal.classList.remove('hidden');
    
    // Calculate total of CHECKED items
    const clearedTotal = state.transactions
        .filter(t => t.type === 'transaction' && t.reconciled)
        .reduce((sum, t) => sum + t.amount, 0);
        
    document.getElementById('recon-calc-balance').textContent = formatCurrency(clearedTotal);
    document.getElementById('recon-bank-balance').value = '';
    document.getElementById('recon-difference').textContent = '$0.00';
    document.getElementById('recon-success-msg').classList.add('hidden');
    document.getElementById('recon-error-msg').classList.add('hidden');
});

document.getElementById('recon-bank-balance').addEventListener('input', (e) => {
    const bankBal = parseFloat(e.target.value) || 0;
    const clearedTotal = state.transactions
        .filter(t => t.type === 'transaction' && t.reconciled)
        .reduce((sum, t) => sum + t.amount, 0);
        
    const diff = bankBal - clearedTotal;
    const diffEl = document.getElementById('recon-difference');
    diffEl.textContent = formatCurrency(diff);
    
    if(Math.abs(diff) < 0.01) {
        diffEl.className = "text-green-600 font-bold";
        document.getElementById('recon-success-msg').classList.remove('hidden');
        document.getElementById('recon-error-msg').classList.add('hidden');
    } else {
        diffEl.className = "text-red-600 font-bold";
        document.getElementById('recon-success-msg').classList.add('hidden');
        document.getElementById('recon-error-msg').classList.remove('hidden');
    }
});

document.getElementById('close-recon-btn').addEventListener('click', () => {
    document.getElementById('reconcile-modal').classList.add('hidden');
});


// --- CSV Import ---
document.getElementById('csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    const existingSignatures = new Set(
        state.transactions.map(t => `${t.date}-${t.description}-${t.amount}`)
    );

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            let duplicatesCount = 0;
            const newTxs = results.data.map((row, i) => {
                const date = row['Date'] || row['date'] || new Date().toISOString();
                const desc = row['Description'] || row['description'] || row['Memo'] || 'No Desc';
                let amt = row['Amount'] || row['amount'] || 0;
                
                if(row['Debit'] && row['Debit'] !== '') amt = -Math.abs(parseFloat(row['Debit']));
                if(row['Credit'] && row['Credit'] !== '') amt = Math.abs(parseFloat(row['Credit']));
                
                const cleanDate = typeof date === 'string' ? date : new Date().toISOString();
                const cleanAmt = parseFloat(amt) || 0;
                const signature = `${cleanDate}-${desc}-${cleanAmt}`;

                if (existingSignatures.has(signature)) {
                    duplicatesCount++;
                    return null;
                }

                return {
                    id: `tx-${Date.now()}-${i}`,
                    date: cleanDate,
                    description: desc,
                    amount: cleanAmt,
                    category: 'Uncategorized',
                    type: 'transaction',
                    reconciled: false
                };
            }).filter(Boolean);

            if (newTxs.length > 0) {
                state.addTransactions(newTxs);
                refreshApp();
                showToast(`Imported ${newTxs.length} items. Skipped ${duplicatesCount} duplicates.`);
            } else {
                showToast(`No new items found. Skipped ${duplicatesCount} duplicates.`, true);
            }
        }
    });
});

// Auth Listeners
document.getElementById('login-btn').addEventListener('click', loginUser);
document.getElementById('logout-btn').addEventListener('click', () => { logoutUser(); location.reload(); });

// Start
init();

