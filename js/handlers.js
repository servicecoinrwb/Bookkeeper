import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from './firebase.js';

const DEFAULT_CATS = [
    'COGS - Equipment', 'COGS - Parts & Materials', 'Income (Sales/Service)',
    'Insurance', 'Marketing & Advertising', 'Office Supplies & Software',
    'Owner\'s Draw', 'Payroll Expenses', 'Permits & Licenses', 'Rent/Lease',
    'Subcontractors', 'Tools & Small Equipment', 'Transfer', 'Uncategorized',
    'Utilities', 'Vehicle Expenses'
];

export const Handlers = {
    // --- UNIVERSAL IMPORT HANDLER ---
    importCSV: async (file) => {
        Papa.parse(file, {
            header: true, 
            skipEmptyLines: true,
            complete: async (results) => {
                const headers = (results.meta.fields || []).map(h => h.replace(/["']/g, '').trim());
                const rawRows = results.data;
                const isInvoice = headers.includes('INVNum') || headers.includes('Grand Total');

                if (isInvoice) {
                    console.log("Detected: INVOICE File");
                    Handlers.processInvoices(rawRows);
                } else {
                    console.log("Detected: BANK TRANSACTION File");
                    Handlers.processTransactions(rawRows, headers);
                }
            }
        });
    },

    // --- PROCESS 1: BANK TRANSACTIONS ---
    processTransactions: async (rawRows, headers) => {
        const findCol = (patterns) => headers.find(h => patterns.some(p => h.toLowerCase().includes(p)));
        const dateKey = findCol(['date', 'time']) || 'Date';
        const descKey = findCol(['desc', 'memo', 'payee', 'name']) || 'Description';
        const amtKey = findCol(['amount', 'total', 'net']) || 'Amount';
        const debitKey = findCol(['debit', 'withdrawal']);
        const creditKey = findCol(['credit', 'deposit']);

        const existingSigs = new Set();
        State.data.forEach(tx => {
            if(tx.type === 'transaction') existingSigs.add(`${tx.date}|${tx.description}|${tx.amount}`);
        });

        const getValue = (row, cleanKey) => {
            if (!cleanKey) return undefined;
            const actualKey = Object.keys(row).find(k => k.replace(/["']/g, '').trim() === cleanKey);
            return row[actualKey] || row[cleanKey];
        };

        const newTxs = rawRows.map(row => {
             const dateStr = getValue(row, dateKey);
             const desc = (getValue(row, descKey) || 'No Description').trim();
             const cleanNum = (val) => parseFloat((val || "0").toString().replace(/[^0-9.-]/g, ''));

             let amt = cleanNum(getValue(row, amtKey));
             if (amt === 0 && (debitKey || creditKey)) {
                 const debit = cleanNum(getValue(row, debitKey));
                 const credit = cleanNum(getValue(row, creditKey));
                 if (debit !== 0) amt = -Math.abs(debit);
                 else if (credit !== 0) amt = Math.abs(credit);
             }
             
             if(!dateStr || isNaN(amt)) return null;

             let cleanDate;
             try { cleanDate = new Date(dateStr).toLocaleDateString('en-CA'); } catch(e) { return null; }
             if (cleanDate === 'Invalid Date') return null;

             if (existingSigs.has(`${cleanDate}|${desc}|${amt}`)) return null;

             let category = 'Uncategorized';
             for(const rule of State.rules) {
                 if(desc.toLowerCase().includes(rule.keyword.toLowerCase())) { category = rule.category; break; }
             }

             return { id: Utils.generateId('tx'), type: 'transaction', date: cleanDate, description: desc, amount: amt, category: category, reconciled: false, job: '' };
        }).filter(Boolean);
        
        Handlers.finalizeImport(newTxs, 'transactions');
    },

    // --- PROCESS 2: INVOICES (A/R) ---
    processInvoices: async (rawRows) => {
        const existingInvoices = new Set(State.data.filter(d => d.type === 'ar').map(i => i.number ? i.number.toString().toLowerCase() : ''));
        const getValue = (row, keyMatch) => {
            const actualKey = Object.keys(row).find(k => k.replace(/["']/g, '').trim() === keyMatch);
            return row[actualKey];
        };

        const newInvoices = rawRows.map(row => {
             const dateStr = getValue(row, 'TransDate') || getValue(row, 'Date');
             const party = (getValue(row, 'Bill To') || getValue(row, 'Customer') || 'Unknown').trim();
             const number = (getValue(row, 'INVNum') || getValue(row, 'Invoice #') || '').toString().trim();
             const statusRaw = (getValue(row, 'Invoice Status') || '').toLowerCase();
             const amt = parseFloat((getValue(row, 'Grand Total') || "0").toString().replace(/[^0-9.-]/g, ''));
             
             if(!dateStr || isNaN(amt)) return null;
             if (number && existingInvoices.has(number.toLowerCase())) return null;

             let cleanDate;
             try { cleanDate = new Date(dateStr).toLocaleDateString('en-CA'); } catch(e) { return null; }

             return { id: Utils.generateId('ar'), type: 'ar', date: cleanDate, party: party, number: number || 'N/A', amount: amt, status: statusRaw.includes('paid') ? 'paid' : 'unpaid' };
        }).filter(Boolean);
        
        Handlers.finalizeImport(newInvoices, 'invoices');
    },

    // --- FINALIZE ---
    finalizeImport: async (items, typeLabel) => {
        if (items.length > 0) {
            State.data = [...State.data, ...items];
            Handlers.refreshAll();
            UI.showToast(`Success! Imported ${items.length} ${typeLabel}.`);
            if(State.user) await Handlers.batchSaveTransactions(items);
            else Handlers.saveSessionLocally();
        } else {
            UI.showToast(`No new ${typeLabel} found (duplicates).`, "error");
        }
    },

    // --- BATCH SAVE HELPER ---
    batchSaveTransactions: async (items) => {
        if (!State.user) return;
        const batchSize = 450;
        for (let i = 0; i < items.length; i += batchSize) {
            const chunk = items.slice(i, i + batchSize);
            const batch = writeBatch(db);
            chunk.forEach(item => {
                const ref = doc(db, 'users', State.user.uid, 'transactions', item.id);
                batch.set(ref, item);
            });
            await batch.commit();
        }
    },

    // --- SAVE / LOAD ---
    saveSession: async () => {
        if (State.user) {
            try {
                const statusEl = document.getElementById('cloud-status');
                if(statusEl) statusEl.classList.remove('hidden');
                await setDoc(doc(db, 'users', State.user.uid), {
                    rules: JSON.stringify(State.rules),
                    categories: JSON.stringify(State.categories),
                    lastUpdated: new Date()
                }, { merge: true });
                if(statusEl) statusEl.classList.add('hidden');
                UI.showToast("Settings Saved");
            } catch (e) { console.error(e); UI.showToast(`Save Failed: ${e.message}`, "error"); }
        } else {
            Handlers.saveSessionLocally();
        }
    },

    saveSessionLocally: () => {
        localStorage.setItem('bk_data', JSON.stringify(State.data));
        localStorage.setItem('bk_rules', JSON.stringify(State.rules));
        localStorage.setItem('bk_cats', JSON.stringify(State.categories));
        UI.showToast("Saved Locally");
    },

    loadSession: async () => {
        if(State.user) {
            try {
                const userDocRef = doc(db, 'users', State.user.uid);
                const userDoc = await getDoc(userDocRef);
                if(userDoc.exists()) {
                    const d = userDoc.data();
                    if(d.rules) State.rules = JSON.parse(d.rules);
                    if(d.categories) State.categories = JSON.parse(d.categories);
                    
                    const q = collection(db, 'users', State.user.uid, 'transactions');
                    const querySnapshot = await getDocs(q);
                    const txs = [];
                    querySnapshot.forEach((doc) => txs.push(doc.data()));
                    State.data = txs;
                }
            } catch(e) { console.error("Load Error:", e); }
        } else {
            const local = localStorage.getItem('bk_data');
            const rules = localStorage.getItem('bk_rules');
            const cats = localStorage.getItem('bk_cats');
            if(local) State.data = JSON.parse(local);
            if(rules) State.rules = JSON.parse(rules);
            if(cats) State.categories = JSON.parse(cats);
        }

        // FAILSAFE: If categories empty, restore defaults
        if(!State.categories || State.categories.length === 0) {
            State.categories = [...DEFAULT_CATS];
        }

        Handlers.refreshAll();
        UI.populateRuleCategories();
        UI.renderRulesList();
        UI.renderCategoryManagementList();
    },

    refreshAll: () => { 
        UI.renderDateFilters(); 
        UI.updateDashboard(); 
        if(State.currentView !== 'dashboard') UI.switchTab(State.currentView); 
    },

    // --- EDITING ---
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-desc').value = tx.description;
        document.getElementById('modal-amount').value = tx.amount;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        
        // Ensure dropdown has options (using failsafe if needed)
        const cats = (State.categories && State.categories.length > 0) ? State.categories : DEFAULT_CATS;
        const catSelect = document.getElementById('modal-category');
        catSelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        catSelect.value = tx.category;

        // Reset rule checkbox
        document.getElementById('modal-create-rule').checked = false;

        // Job Datalist
        const jobList = document.getElementById('job-list');
        if(jobList) jobList.innerHTML = [...new Set(State.data.map(d => d.job).filter(Boolean))].map(j => `<option value="${j}">`).join('');

        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            const oldCat = tx.category;
            const newDesc = document.getElementById('modal-desc').value.trim();
            const newCat = document.getElementById('modal-category').value;
            const newJob = document.getElementById('modal-job').value.trim();
            const newNotes = document.getElementById('modal-notes').value.trim();
            const makeRule = document.getElementById('modal-create-rule').checked;

            const updatedTx = { ...tx, description: newDesc, category: newCat, job: newJob, notes: newNotes };
            
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            
            UI.closeModal('edit-modal');
            
            if (makeRule && newDesc && newCat) {
                const exists = State.rules.some(r => r.keyword === newDesc && r.category === newCat);
                if(!exists) {
                    State.rules.push({ keyword: newDesc, category: newCat });
                    UI.renderRulesList();
                    UI.showToast("Rule Created");
                    Handlers.saveSession();
                }
            }
            
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
            UI.showToast('Updated');
        }
    },

    // ... (Keep updateSingleItem, toggleReconcile, toggleAllRec, addRule, deleteRule, addCategory, deleteCategory, openApArModal, saveApAr, toggleApArStatus, clearData, exportToIIF) ...
    // Note: Re-pasting standard methods for context
    updateSingleItem: async (item) => { const idx = State.data.findIndex(d => d.id === item.id); if(idx > -1) State.data[idx] = item; if(State.user) { await setDoc(doc(db, 'users', State.user.uid, 'transactions', item.id), item); } else { Handlers.saveSessionLocally(); } },
    toggleReconcile: (id) => { const tx = State.data.find(d => d.id === id); if(tx) { tx.reconciled = !tx.reconciled; Handlers.updateSingleItem(tx); Handlers.refreshAll(); } },
    toggleAllRec: async (checked) => { const search = document.getElementById('tx-search').value.toLowerCase(); const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search))); visibleTxs.forEach(tx => tx.reconciled = checked); UI.renderTransactions(); if(State.user) await Handlers.batchSaveTransactions(visibleTxs); else Handlers.saveSessionLocally(); },
    addRule: () => { const k = document.getElementById('rule-keyword').value.trim(); const c = document.getElementById('rule-category').value; if(k && c) { State.rules.push({keyword:k, category:c}); UI.renderRulesList(); Handlers.saveSession(); } },
    deleteRule: (i) => { State.rules.splice(i, 1); UI.renderRulesList(); Handlers.saveSession(); },
    addCategory: () => { const n = document.getElementById('new-cat-name').value.trim(); if(n && !State.categories.includes(n)) { State.categories.push(n); State.categories.sort(); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.saveSession(); } },
    deleteCategory: (n) => { if(n !== 'Uncategorized') { State.categories = State.categories.filter(c => c !== n); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.refreshAll(); Handlers.saveSession(); } },
    openApArModal: (t) => { document.getElementById('ap-ar-id').value=''; document.getElementById('ap-ar-type').value=t; UI.openModal('ap-ar-modal'); },
    saveApAr: () => { const type = document.getElementById('ap-ar-type').value; const item = { id: Utils.generateId(type), type: type, party: document.getElementById('ap-ar-party').value, number: document.getElementById('ap-ar-number').value, date: document.getElementById('ap-ar-date').value, amount: parseFloat(document.getElementById('ap-ar-amount').value)||0, status: 'unpaid' }; State.data.push(item); UI.closeModal('ap-ar-modal'); Handlers.updateSingleItem(item); Handlers.refreshAll(); UI.showToast("Added"); },
    toggleApArStatus: (id) => { const item = State.data.find(d => d.id === id); if(item) { item.status = item.status === 'unpaid' ? 'paid' : 'unpaid'; Handlers.updateSingleItem(item); Handlers.refreshAll(); } },
    
    // Updated Clear Data: DON'T delete categories by default
    clearData: async () => {
        if(confirm("Are you sure? This deletes Transactions but keeps your Categories/Rules.")) {
            if(State.user) {
                try {
                    const q = collection(db, 'users', State.user.uid, 'transactions');
                    const snapshot = await getDocs(q);
                    const batchSize = 400;
                    let batch = writeBatch(db);
                    let count = 0;
                    snapshot.forEach(doc => { batch.delete(doc.ref); count++; if(count >= batchSize) { batch.commit(); batch = writeBatch(db); count = 0; } });
                    await batch.commit();
                } catch(e) { console.error("Clear failed", e); }
            }
            State.data = []; 
            // Note: We do NOT clear State.rules or State.categories anymore
            localStorage.removeItem('bk_data'); 
            UI.closeModal('confirm-modal');
            Handlers.refreshAll();
            UI.showToast("Transactions Cleared");
        }
    },
    
    exportToIIF: () => { const bankName = prompt("Bank Account:", "Checking"); if(!bankName) return; let iif = `!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n!ENDTRNS\n`; State.data.filter(d => d.type === 'transaction').forEach(tx => { const date = new Date(tx.date).toLocaleDateString('en-US', {month: '2-digit', day: '2-digit', year: 'numeric'}); const type = tx.amount < 0 ? 'EXPENSE' : 'DEPOSIT'; iif += `TRNS\t\t${type}\t${date}\t${bankName}\t\t${tx.amount.toFixed(2)}\t\t${(tx.description+' '+tx.job).trim()}\n`; iif += `SPL\t\t${type}\t${date}\t${tx.category}\t\t${(-tx.amount).toFixed(2)}\t\t${(tx.description+' '+tx.job).trim()}\n`; iif += `ENDTRNS\n`; }); const blob = new Blob([iif], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'quickbooks.iif'; a.click(); }
};
