import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc } from './firebase.js';

export const Handlers = {
    // --- IMPORT ---
    importCSV: (file) => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results) => {
                const rawRows = results.data;
                const existingCounts = {};
                State.data.forEach(tx => {
                    if(tx.type === 'transaction') {
                        const key = `${tx.date}-${tx.description.trim()}-${tx.amount}`;
                        existingCounts[key] = (existingCounts[key] || 0) + 1;
                    }
                });

                const parseRow = (row) => {
                     const dateStr = row['Date'] || row['date'] || row['TransDate'];
                     const desc = (row['Description'] || row['Memo'] || row['description'] || 'No Desc').trim();
                     let amt = parseFloat(row['Amount'] || row['amount'] || row['Grand Total']);
                     
                     if(isNaN(amt)) {
                         const debit = parseFloat(row['Debit']);
                         const credit = parseFloat(row['Credit']);
                         if(!isNaN(debit) && debit !== 0) amt = -debit;
                         if(!isNaN(credit) && credit !== 0) amt = credit;
                     }
                     
                     if(!dateStr || isNaN(amt)) return null;

                     let cleanDate;
                     try { cleanDate = new Date(dateStr).toLocaleDateString('en-CA'); } catch(e) { return null; }
                     if (cleanDate === 'Invalid Date') return null;

                     let category = 'Uncategorized';
                     for(const rule of State.rules) {
                         if(desc.toLowerCase().includes(rule.keyword.toLowerCase())) { category = rule.category; break; }
                     }

                     return { id: Utils.generateId('tx'), type: 'transaction', date: cleanDate, description: desc, amount: amt, category: category, reconciled: false, job: '' };
                };

                const newTxs = rawRows.map(row => {
                     const tx = parseRow(row);
                     if (!tx) return null;
                     const signature = `${tx.date}-${tx.description}-${tx.amount}`;
                     if (existingCounts[signature] && existingCounts[signature] > 0) {
                         existingCounts[signature]--; 
                         return null; 
                     }
                     return tx;
                }).filter(Boolean);
                
                if (newTxs.length > 0) {
                    State.data = [...State.data, ...newTxs];
                    Handlers.refreshAll();
                    UI.showToast(`Success! Imported ${newTxs.length} new transactions.`);
                    Handlers.saveSession();
                } else {
                     const forceTxs = rawRows.map(parseRow).filter(Boolean);
                     if (forceTxs.length > 0) {
                         State.data = [...State.data, ...forceTxs];
                         Handlers.refreshAll();
                         UI.showToast(`Imported ${forceTxs.length} transactions (Forced).`);
                         Handlers.saveSession();
                     } else {
                         UI.showToast("Could not parse any rows.", "error");
                     }
                }
            }
        });
    },

    saveSession: async () => {
        const payload = {
            data: JSON.stringify(State.data),
            rules: JSON.stringify(State.rules),
            categories: JSON.stringify(State.categories),
            lastUpdated: new Date()
        };

        if (State.user) {
            try {
                const statusEl = document.getElementById('cloud-status');
                if(statusEl) statusEl.classList.remove('hidden');
                await setDoc(doc(db, 'users', State.user.uid), payload);
                if(statusEl) statusEl.classList.add('hidden');
                UI.showToast("Saved to Cloud");
            } catch (e) { console.error(e); UI.showToast("Save Failed", "error"); }
        } else {
            localStorage.setItem('bk_data', payload.data);
            localStorage.setItem('bk_rules', payload.rules);
            localStorage.setItem('bk_cats', payload.categories);
            UI.showToast("Saved Locally");
        }
    },

    loadSession: async () => {
        if(State.user) {
            const snap = await getDoc(doc(db, 'users', State.user.uid));
            if(snap.exists()) {
                const d = snap.data();
                State.data = JSON.parse(d.data || '[]');
                if(d.rules) State.rules = JSON.parse(d.rules);
                if(d.categories) State.categories = JSON.parse(d.categories);
            }
        } else {
            const local = localStorage.getItem('bk_data');
            const rules = localStorage.getItem('bk_rules');
            const cats = localStorage.getItem('bk_cats');
            if(local) State.data = JSON.parse(local);
            if(rules) State.rules = JSON.parse(rules);
            if(cats) State.categories = JSON.parse(cats);
        }
        Handlers.refreshAll();
        UI.populateRuleCategories();
        UI.renderRulesList();
        UI.renderCategoryManagementList();
    },

    refreshAll: () => { UI.renderDateFilters(); UI.updateDashboard(); if(State.currentView !== 'dashboard') UI.switchTab(State.currentView); },

    // --- TRANSACTIONS ---
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-category').value = tx.category;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        const catList = document.getElementById('category-list');
        if(catList) catList.innerHTML = State.categories.map(c => `<option value="${c}">`).join('');
        const jobList = document.getElementById('job-list');
        if(jobList) jobList.innerHTML = [...new Set(State.data.map(d => d.job).filter(Boolean))].map(j => `<option value="${j}">`).join('');
        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            const oldCat = tx.category;
            const newCat = document.getElementById('modal-category').value;
            tx.category = newCat;
            tx.job = document.getElementById('modal-job').value;
            tx.notes = document.getElementById('modal-notes').value;
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            UI.closeModal('edit-modal');
            if (oldCat !== newCat) {
                const similar = State.data.filter(t => t.type === 'transaction' && t.id !== id && t.description.toLowerCase().includes(tx.description.split(' ')[0].toLowerCase()));
                if(similar.length > 0) {
                    const msgEl = document.getElementById('batch-msg');
                    if(msgEl) msgEl.textContent = `Update ${similar.length} other transactions like "${tx.description.split(' ')[0]}..." to "${newCat}"?`;
                    document.getElementById('btn-batch-yes').onclick = () => { similar.forEach(t => t.category = newCat); UI.closeModal('batch-modal'); Handlers.refreshAll(); Handlers.saveSession(); };
                    document.getElementById('btn-batch-no').onclick = () => UI.closeModal('batch-modal');
                    UI.openModal('batch-modal');
                }
            }
            Handlers.refreshAll(); Handlers.saveSession(); UI.showToast('Updated');
        }
    },

    toggleReconcile: (id) => { const tx = State.data.find(d => d.id === id); if(tx) { tx.reconciled = !tx.reconciled; Handlers.saveSession(); } },
    
    // NEW: Toggle All Visible
    toggleAllRec: (checked) => {
        const search = document.getElementById('tx-search').value.toLowerCase();
        const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search)));
        visibleTxs.forEach(tx => tx.reconciled = checked);
        UI.renderTransactions();
        Handlers.saveSession();
    },

    // --- RULES & CATS ---
    addRule: () => {
        const key = document.getElementById('rule-keyword').value.trim();
        const cat = document.getElementById('rule-category').value;
        if(key && cat) { State.rules.push({ keyword: key, category: cat }); UI.renderRulesList(); document.getElementById('rule-keyword').value = ''; Handlers.saveSession(); UI.showToast('Rule Added'); }
    },
    deleteRule: (index) => { State.rules.splice(index, 1); UI.renderRulesList(); Handlers.saveSession(); },
    addCategory: () => { const name = document.getElementById('new-cat-name').value.trim(); if(name && !State.categories.includes(name)) { State.categories.push(name); State.categories.sort(); UI.populateRuleCategories(); UI.renderCategoryManagementList(); document.getElementById('new-cat-name').value = ''; Handlers.saveSession(); UI.showToast('Category Added'); } },
    deleteCategory: (name) => { if(name === 'Uncategorized') return; State.categories = State.categories.filter(c => c !== name); State.data.forEach(t => { if(t.category === name) t.category = 'Uncategorized'; }); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.refreshAll(); Handlers.saveSession(); },

    // --- AP/AR ---
    openApArModal: (type) => {
        document.getElementById('ap-ar-id').value = '';
        document.getElementById('ap-ar-type').value = type;
        document.getElementById('ap-ar-title').textContent = type === 'ar' ? 'Add Invoice' : 'Add Bill';
        document.getElementById('ap-ar-party-label').textContent = type === 'ar' ? 'Customer' : 'Vendor';
        document.getElementById('ap-ar-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('ap-ar-amount').value = '';
        document.getElementById('ap-ar-number').value = '';
        document.getElementById('ap-ar-party').value = '';
        UI.openModal('ap-ar-modal');
    },
    saveApAr: () => {
        const type = document.getElementById('ap-ar-type').value;
        const item = {
            id: Utils.generateId(type),
            type: type,
            party: document.getElementById('ap-ar-party').value,
            number: document.getElementById('ap-ar-number').value,
            date: document.getElementById('ap-ar-date').value,
            amount: parseFloat(document.getElementById('ap-ar-amount').value) || 0,
            status: 'unpaid'
        };
        State.data.push(item);
        UI.closeModal('ap-ar-modal');
        Handlers.refreshAll();
        Handlers.saveSession();
    },
    toggleApArStatus: (id) => { const item = State.data.find(d => d.id === id); if(item) { item.status = item.status === 'unpaid' ? 'paid' : 'unpaid'; Handlers.refreshAll(); Handlers.saveSession(); } },

    clearData: () => { if(confirm("Are you sure?")) { State.data = []; State.rules = []; localStorage.removeItem('bk_data'); localStorage.removeItem('bk_rules'); if(State.user) setDoc(doc(db, 'users', State.user.uid), { data: '[]', rules: '[]' }); UI.closeModal('confirm-modal'); Handlers.refreshAll(); UI.showToast("All Data Cleared"); } },
    exportToIIF: () => {
        const bankName = prompt("Enter Bank Account Name (QuickBooks):", "Checking");
        if(!bankName) return;
        let iif = `!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n!ENDTRNS\n`;
        State.data.filter(d => d.type === 'transaction').forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('en-US', {month: '2-digit', day: '2-digit', year: 'numeric'});
            const type = tx.amount < 0 ? 'EXPENSE' : 'DEPOSIT';
            iif += `TRNS\t\t${type}\t${date}\t${bankName}\t\t${tx.amount.toFixed(2)}\t\t${(tx.description+' '+tx.job).trim()}\n`;
            iif += `SPL\t\t${type}\t${date}\t${tx.category}\t\t${(-tx.amount).toFixed(2)}\t\t${(tx.description+' '+tx.job).trim()}\n`;
            iif += `ENDTRNS\n`;
        });
        const blob = new Blob([iif], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'quickbooks_import.iif'; a.click();
    }
};
