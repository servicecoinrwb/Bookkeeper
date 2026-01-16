import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from './firebase.js';

export const Handlers = {
    // --- UNIVERSAL IMPORT HANDLER ---
    importCSV: async (file) => {
        Papa.parse(file, {
            header: true, 
            skipEmptyLines: true,
            complete: async (results) => {
                // 1. Clean Headers (Remove quotes and whitespace)
                const headers = (results.meta.fields || []).map(h => h.trim().replace(/^"|"$/g, ''));
                const rawRows = results.data;
                
                // 2. DETECT FILE TYPE
                // Your invoices ALWAYS have 'INVNum' or 'Grand Total'
                const isInvoice = headers.some(h => h === 'INVNum' || h === 'Grand Total');

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
        // Smart Column Detection
        const findCol = (patterns) => headers.find(h => patterns.some(p => h.toLowerCase().includes(p)));
        const dateKey = findCol(['date', 'time']) || 'Date';
        const descKey = findCol(['desc', 'memo', 'payee', 'name']) || 'Description';
        const amtKey = findCol(['amount', 'total', 'net']) || 'Amount';
        const debitKey = findCol(['debit', 'withdrawal']);
        const creditKey = findCol(['credit', 'deposit']);

        const existingCounts = {};
        State.data.forEach(tx => {
            if(tx.type === 'transaction') {
                const key = `${tx.date}-${tx.description.trim()}-${tx.amount}`;
                existingCounts[key] = (existingCounts[key] || 0) + 1;
            }
        });

        const parseRow = (row) => {
             // Access row data safely (handling quoted keys)
             const getVal = (k) => {
                 const actualKey = Object.keys(row).find(rk => rk.trim().replace(/^"|"$/g, '') === k);
                 return row[actualKey || k];
             };

             const dateStr = getVal(dateKey);
             const desc = (getVal(descKey) || 'No Description').trim();
             const cleanNum = (val) => parseFloat((val || "0").toString().replace(/[^0-9.-]/g, ''));

             let amt = cleanNum(getVal(amtKey));
             
             // Handle Debit/Credit columns
             if (amt === 0 && (debitKey || creditKey)) {
                 const debit = cleanNum(getVal(debitKey));
                 const credit = cleanNum(getVal(creditKey));
                 if (debit !== 0) amt = -Math.abs(debit);
                 else if (credit !== 0) amt = Math.abs(credit);
             }
             
             if(!dateStr || isNaN(amt)) return null;

             let cleanDate;
             try { cleanDate = new Date(dateStr).toLocaleDateString('en-CA'); } catch(e) { return null; }
             if (cleanDate === 'Invalid Date') return null;

             let category = 'Uncategorized';
             for(const rule of State.rules) {
                 if(desc.toLowerCase().includes(rule.keyword.toLowerCase())) { category = rule.category; break; }
             }

             return { 
                 id: Utils.generateId('tx'), 
                 type: 'transaction', 
                 date: cleanDate, 
                 description: desc, 
                 amount: amt, 
                 category: category, 
                 reconciled: false, 
                 job: '' 
             };
        };

        const newTxs = rawRows.map(parseRow).filter(Boolean);
        
        // Remove strictly exact duplicates from this batch against existing DB
        const finalTxs = newTxs.filter(tx => {
            const signature = `${tx.date}-${tx.description}-${tx.amount}`;
            if (existingCounts[signature] && existingCounts[signature] > 0) {
                existingCounts[signature]--;
                return false;
            }
            return true;
        });
        
        // If everything was filtered but we parsed rows, assume user wants to force import
        if (finalTxs.length === 0 && newTxs.length > 0) {
             Handlers.finalizeImport(newTxs, 'transactions (Force)');
        } else {
             Handlers.finalizeImport(finalTxs, 'transactions');
        }
    },

    // --- PROCESS 2: INVOICES (A/R) ---
    processInvoices: async (rawRows) => {
        const existingInvoices = new Set(State.data.filter(d => d.type === 'ar').map(i => i.number ? i.number.toString().toLowerCase() : ''));

        const newInvoices = rawRows.map(row => {
             // Helper to handle keys
             const getVal = (k) => {
                 const actualKey = Object.keys(row).find(rk => rk.trim().replace(/^"|"$/g, '') === k);
                 return row[actualKey || k];
             };

             // Mapping for your specific CSV structure
             const dateStr = getVal('TransDate') || getVal('Date');
             const party = (getVal('Bill To') || getVal('Customer') || 'Unknown').trim();
             const number = (getVal('INVNum') || getVal('Invoice #') || '').toString().trim();
             const statusRaw = (getVal('Invoice Status') || '').toLowerCase();
             const grandTotal = getVal('Grand Total') || getVal('Total Cost') || "0";
             
             // Clean Currency
             const amt = parseFloat(grandTotal.toString().replace(/[^0-9.-]/g, ''));
             
             if(!dateStr || isNaN(amt)) return null;
             
             // Skip duplicates
             if (number && existingInvoices.has(number.toLowerCase())) return null;

             let cleanDate;
             try { cleanDate = new Date(dateStr).toLocaleDateString('en-CA'); } catch(e) { return null; }

             return { 
                 id: Utils.generateId('ar'), 
                 type: 'ar', 
                 date: cleanDate, 
                 party: party, 
                 number: number || 'N/A', 
                 amount: amt, 
                 status: statusRaw.includes('paid') ? 'paid' : 'unpaid' 
             };
        }).filter(Boolean);
        
        Handlers.finalizeImport(newInvoices, 'invoices');
    },

    // --- FINALIZE ---
    finalizeImport: async (items, typeLabel) => {
        if (items.length > 0) {
            State.data = [...State.data, ...items];
            
            // AUTO-SWITCH YEAR logic
            // If we imported 2026 data, switch view to 2026 so user sees it immediately
            const importedYears = [...new Set(items.map(i => i.date.split('-')[0]))];
            if (importedYears.length > 0) {
                const newestYear = importedYears.sort().reverse()[0];
                if (newestYear !== State.filters.year && State.filters.year !== 'all') {
                    State.filters.year = newestYear;
                    UI.showToast(`Switched view to ${newestYear}`);
                }
            }

            Handlers.refreshAll();
            UI.showToast(`Success! Imported ${items.length} ${typeLabel}.`);
            
            if(State.user) await Handlers.batchSaveTransactions(items);
            else Handlers.saveSessionLocally();
        } else {
            UI.showToast(`No new ${typeLabel} found.`, "error");
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
                    // Load Subcollection
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

    // --- ACTIONS ---
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-category').value = tx.category;
        // Fix for new modal fields
        if(document.getElementById('modal-desc')) document.getElementById('modal-desc').value = tx.description;
        if(document.getElementById('modal-amount')) document.getElementById('modal-amount').value = tx.amount;
        
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        const catList = document.getElementById('category-list');
        if(catList) catList.innerHTML = State.categories.map(c => `<option value="${c}">`).join('');
        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            const oldCat = tx.category;
            const newCat = document.getElementById('modal-category').value;
            const newDesc = document.getElementById('modal-desc') ? document.getElementById('modal-desc').value : tx.description;
            
            const updatedTx = { 
                ...tx, 
                category: newCat, 
                description: newDesc,
                job: document.getElementById('modal-job').value, 
                notes: document.getElementById('modal-notes').value 
            };
            
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            UI.closeModal('edit-modal');
            
            // Rule creation checkbox
            const makeRule = document.getElementById('modal-create-rule');
            if (makeRule && makeRule.checked) {
                State.rules.push({ keyword: newDesc, category: newCat });
                UI.renderRulesList();
            }

            Handlers.updateSingleItem(updatedTx);
            Handlers.refreshAll();
            Handlers.saveSession();
            UI.showToast('Updated');
        }
    },

    updateSingleItem: async (item) => {
        const idx = State.data.findIndex(d => d.id === item.id);
        if(idx > -1) State.data[idx] = item;
        if(State.user) {
            try { await setDoc(doc(db, 'users', State.user.uid, 'transactions', item.id), item); } 
            catch(e) { console.error(e); }
        } else {
            Handlers.saveSessionLocally();
        }
    },

    toggleReconcile: (id) => { const tx = State.data.find(d => d.id === id); if(tx) { tx.reconciled = !tx.reconciled; Handlers.updateSingleItem(tx); Handlers.refreshAll(); } },
    toggleAllRec: async (checked) => {
        const search = document.getElementById('tx-search').value.toLowerCase();
        const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search)));
        visibleTxs.forEach(tx => tx.reconciled = checked);
        UI.renderTransactions();
        if(State.user) await Handlers.batchSaveTransactions(visibleTxs);
        else Handlers.saveSessionLocally();
    },

    addRule: () => {
        const key = document.getElementById('rule-keyword').value.trim();
        const cat = document.getElementById('rule-category').value;
        if(key && cat) { State.rules.push({ keyword: key, category: cat }); UI.renderRulesList(); document.getElementById('rule-keyword').value = ''; Handlers.saveSession(); UI.showToast('Rule Added'); }
    },
    deleteRule: (index) => { State.rules.splice(index, 1); UI.renderRulesList(); Handlers.saveSession(); },
    
    addCategory: () => {
        const name = document.getElementById('new-cat-name').value.trim();
        if(name && !State.categories.includes(name)) {
            State.categories.push(name);
            State.categories.sort();
            UI.populateRuleCategories();
            UI.renderCategoryManagementList();
            document.getElementById('new-cat-name').value = '';
            Handlers.saveSession();
            UI.showToast('Category Added');
        }
    },
    deleteCategory: (name) => {
        if(name === 'Uncategorized') return;
        State.categories = State.categories.filter(c => c !== name);
        State.data.forEach(t => { if(t.category === name) { t.category = 'Uncategorized'; } });
        UI.populateRuleCategories();
        UI.renderCategoryManagementList();
        Handlers.refreshAll();
        Handlers.saveSession();
    },

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
        Handlers.updateSingleItem(item);
        Handlers.refreshAll();
        UI.showToast(type === 'ar' ? "Invoice Added" : "Bill Added");
    },
    toggleApArStatus: (id) => { const item = State.data.find(d => d.id === id); if(item) { item.status = item.status === 'unpaid' ? 'paid' : 'unpaid'; Handlers.updateSingleItem(item); Handlers.refreshAll(); } },

    clearData: async () => {
        if(confirm("Are you sure? This cannot be undone.")) {
            if(State.user) {
                try {
                    const q = collection(db, 'users', State.user.uid, 'transactions');
                    const snapshot = await getDocs(q);
                    const batchSize = 400;
                    let batch = writeBatch(db);
                    let count = 0;
                    snapshot.forEach(doc => { batch.delete(doc.ref); count++; if(count >= batchSize) { batch.commit(); batch = writeBatch(db); count = 0; } });
                    await batch.commit();
                    await setDoc(doc(db, 'users', State.user.uid), { data: null, rules: '[]', categories: '[]' });
                } catch(e) { console.error("Clear failed", e); }
            }
            State.data = []; State.rules = [];
            localStorage.removeItem('bk_data'); localStorage.removeItem('bk_rules'); localStorage.removeItem('bk_cats');
            UI.closeModal('confirm-modal');
            Handlers.refreshAll();
            UI.showToast("All Data Cleared");
        }
    },
    
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
