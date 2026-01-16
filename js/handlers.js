import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from './firebase.js';

export const Handlers = {
    // ... (Keep existing importCSV, importInvoices, batchSave, saveSession, loadSession, refreshAll) ...
    // NOTE: Copied for context, please ensure you keep the full file content

    importCSV: (file) => { Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => { /* ... existing robust logic ... */ } }); },
    importInvoices: (file) => { Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => { /* ... existing robust logic ... */ } }); },
    batchSaveTransactions: async (items) => { /* ... */ },
    saveSession: async () => { /* ... */ },
    saveSessionLocally: () => { /* ... */ },
    loadSession: async () => { 
        // ... existing logic ...
        // Ensure defaults are restored if empty
        if(!State.categories || State.categories.length === 0) {
            State.categories = [
                'COGS - Equipment', 'COGS - Parts & Materials', 'Income (Sales/Service)',
                'Insurance', 'Marketing & Advertising', 'Office Supplies & Software',
                'Owner\'s Draw', 'Payroll Expenses', 'Permits & Licenses', 'Rent/Lease',
                'Subcontractors', 'Tools', 'Transfer', 'Uncategorized', 'Utilities', 'Vehicle Expenses'
            ];
        }
        Handlers.refreshAll();
        UI.populateRuleCategories();
        UI.renderRulesList();
        UI.renderCategoryManagementList();
    },
    refreshAll: () => { UI.renderDateFilters(); UI.updateDashboard(); if(State.currentView !== 'dashboard') UI.switchTab(State.currentView); },

    // --- FIX: EDIT TRANSACTION ---
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        
        // Populate Hidden ID
        document.getElementById('modal-tx-id').value = id;
        
        // Populate Advanced Fields (Desc, Amount, Category, Job, Notes)
        const descEl = document.getElementById('modal-desc');
        if(descEl) descEl.value = tx.description;
        
        const amtEl = document.getElementById('modal-amount');
        if(amtEl) amtEl.value = tx.amount;

        const jobEl = document.getElementById('modal-job');
        if(jobEl) jobEl.value = tx.job || '';
        
        const noteEl = document.getElementById('modal-notes');
        if(noteEl) noteEl.value = tx.notes || '';
        
        // Refresh & Set Category Dropdown
        UI.populateRuleCategories(); 
        const catEl = document.getElementById('modal-category');
        if(catEl) catEl.value = tx.category;

        // Reset Rule Checkbox
        const ruleChk = document.getElementById('modal-create-rule');
        if(ruleChk) ruleChk.checked = false;

        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            const oldCat = tx.category;
            
            // Get new values from Advanced Modal
            const newDesc = document.getElementById('modal-desc').value.trim();
            const newCat = document.getElementById('modal-category').value;
            const newJob = document.getElementById('modal-job').value.trim();
            const newNotes = document.getElementById('modal-notes').value.trim();
            const makeRule = document.getElementById('modal-create-rule').checked;

            const updatedTx = { ...tx, description: newDesc, category: newCat, job: newJob, notes: newNotes };
            
            // Add Category if custom (failsafe, though dropdown handles most)
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            
            UI.closeModal('edit-modal');
            
            // Create Rule Logic
            if (makeRule && newDesc && newCat) {
                 State.rules.push({ keyword: newDesc, category: newCat });
                 UI.renderRulesList();
                 UI.showToast("Rule Created");
            }
            
            // Batch Logic (Update similar)
            if (oldCat !== newCat) {
                const similar = State.data.filter(t => t.type === 'transaction' && t.id !== id && t.description.toLowerCase().includes(newDesc.split(' ')[0].toLowerCase()));
                if(similar.length > 0) {
                    const msgEl = document.getElementById('batch-msg');
                    if(msgEl) msgEl.textContent = `Update ${similar.length} other transactions like "${newDesc.split(' ')[0]}..."?`;
                    document.getElementById('btn-batch-yes').onclick = async () => { 
                        similar.forEach(t => t.category = newCat); 
                        if(State.user) await Handlers.batchSaveTransactions(similar);
                        else Handlers.saveSessionLocally();
                        UI.closeModal('batch-modal'); 
                        Handlers.refreshAll(); 
                    };
                    document.getElementById('btn-batch-no').onclick = () => UI.closeModal('batch-modal');
                    UI.openModal('batch-modal');
                }
            }

            Handlers.updateSingleItem(updatedTx);
            Handlers.refreshAll();
            // Save Metadata (Categories/Rules)
            if(makeRule || !State.categories.includes(oldCat)) Handlers.saveSession();
            UI.showToast('Updated');
        }
    },

    // ... (Keep existing updateSingleItem, toggleReconcile, toggleAllRec, addRule, deleteRule, addCategory, deleteCategory, openApArModal, saveApAr, toggleApArStatus, clearData, exportToIIF) ...
    // Placeholder to ensure validity
    updateSingleItem: async (item) => { const idx = State.data.findIndex(d => d.id === item.id); if(idx > -1) State.data[idx] = item; if(State.user) { await setDoc(doc(db, 'users', State.user.uid, 'transactions', item.id), item); } else { Handlers.saveSessionLocally(); } },
    toggleReconcile: (id) => { const tx = State.data.find(d => d.id === id); if(tx) { tx.reconciled = !tx.reconciled; Handlers.updateSingleItem(tx); Handlers.refreshAll(); } },
    toggleAllRec: async (checked) => { const search = document.getElementById('tx-search').value.toLowerCase(); const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search))); visibleTxs.forEach(tx => tx.reconciled = checked); UI.renderTransactions(); if(State.user) await Handlers.batchSaveTransactions(visibleTxs); else Handlers.saveSessionLocally(); },
    addRule: () => { const key = document.getElementById('rule-keyword').value.trim(); const cat = document.getElementById('rule-category').value; if(key && cat) { State.rules.push({ keyword: key, category: cat }); UI.renderRulesList(); document.getElementById('rule-keyword').value = ''; Handlers.saveSession(); UI.showToast('Rule Added'); } },
    deleteRule: (index) => { State.rules.splice(index, 1); UI.renderRulesList(); Handlers.saveSession(); },
    addCategory: () => { const name = document.getElementById('new-cat-name').value.trim(); if(name && !State.categories.includes(name)) { State.categories.push(name); State.categories.sort(); UI.populateRuleCategories(); UI.renderCategoryManagementList(); document.getElementById('new-cat-name').value = ''; Handlers.saveSession(); UI.showToast('Category Added'); } },
    deleteCategory: (name) => { if(name === 'Uncategorized') return; State.categories = State.categories.filter(c => c !== name); State.data.forEach(t => { if(t.category === name) { t.category = 'Uncategorized'; } }); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.refreshAll(); Handlers.saveSession(); },
    openApArModal: (type) => { document.getElementById('ap-ar-id').value = ''; document.getElementById('ap-ar-type').value = type; document.getElementById('ap-ar-title').textContent = type === 'ar' ? 'Add Invoice' : 'Add Bill'; document.getElementById('ap-ar-party-label').textContent = type === 'ar' ? 'Customer' : 'Vendor'; document.getElementById('ap-ar-date').value = new Date().toISOString().split('T')[0]; document.getElementById('ap-ar-amount').value = ''; document.getElementById('ap-ar-number').value = ''; document.getElementById('ap-ar-party').value = ''; UI.openModal('ap-ar-modal'); },
    saveApAr: () => { const type = document.getElementById('ap-ar-type').value; const item = { id: Utils.generateId(type), type: type, party: document.getElementById('ap-ar-party').value, number: document.getElementById('ap-ar-number').value, date: document.getElementById('ap-ar-date').value, amount: parseFloat(document.getElementById('ap-ar-amount').value) || 0, status: 'unpaid' }; State.data.push(item); UI.closeModal('ap-ar-modal'); Handlers.updateSingleItem(item); Handlers.refreshAll(); UI.showToast(type === 'ar' ? "Invoice Added" : "Bill Added"); },
    toggleApArStatus: (id) => { const item = State.data.find(d => d.id === id); if(item) { item.status = item.status === 'unpaid' ? 'paid' : 'unpaid'; Handlers.updateSingleItem(item); Handlers.refreshAll(); } },
    clearData: async () => { if(confirm("Are you sure?")) { State.data = []; State.rules = []; localStorage.removeItem('bk_data'); localStorage.removeItem('bk_rules'); localStorage.removeItem('bk_cats'); if(State.user) setDoc(doc(db, 'users', State.user.uid), { data: '[]', rules: '[]', categories: '[]' }); UI.closeModal('confirm-modal'); Handlers.refreshAll(); UI.showToast("All Data Cleared"); } },
    exportToIIF: () => { const bankName = prompt("Bank Account Name:", "Checking"); if(!bankName) return; let iif = `!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n!ENDTRNS\n`; State.data.filter(d => d.type === 'transaction').forEach(tx => { const date = new Date(tx.date).toLocaleDateString('en-US', {month: '2-digit', day: '2-digit', year: 'numeric'}); const type = tx.amount < 0 ? 'EXPENSE' : 'DEPOSIT'; iif += `TRNS\t\t${type}\t${date}\t${bankName}\t\t${tx.amount.toFixed(2)}\t\t${(tx.description+' '+tx.job).trim()}\n`; iif += `SPL\t\t${type}\t${date}\t${tx.category}\t\t${(-tx.amount).toFixed(2)}\t\t${(tx.description+' '+tx.job).trim()}\n`; iif += `ENDTRNS\n`; }); const blob = new Blob([iif], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'quickbooks.iif'; a.click(); }
};
