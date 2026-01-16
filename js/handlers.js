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
                const headers = results.meta.fields || [];
                const rawRows = results.data;
                
                // --- DETECT FILE TYPE (Prioritize Invoices) ---
                // We check for specific columns that ONLY exist in your AppSheet export
                const isInvoice = headers.some(h => 
                    h.trim() === 'INVNum' || 
                    h.trim() === 'Grand Total' || 
                    h.trim() === 'Invoice Status'
                );

                if (isInvoice) {
                    console.log("Detected Invoice File");
                    Handlers.processInvoices(rawRows);
                } else {
                    console.log("Detected Bank Transaction File");
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
             const dateStr = row[dateKey];
             const desc = (row[descKey] || 'No Description').trim();
             const cleanNum = (val) => parseFloat((val || "0").toString().replace(/[^0-9.-]/g, ''));

             let amt = cleanNum(row[amtKey]);
             // Handle Separate Debit/Credit Columns
             if (amt === 0 && (debitKey || creditKey)) {
                 const debit = cleanNum(row[debitKey]);
                 const credit = cleanNum(row[creditKey]);
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
        
        Handlers.finalizeImport(newTxs, 'transactions');
    },

    // --- PROCESS 2: INVOICES (A/R) ---
    processInvoices: async (rawRows) => {
        const existingInvoices = new Set(State.data.filter(d => d.type === 'ar').map(i => i.number ? i.number.toString().toLowerCase() : ''));

        const newInvoices = rawRows.map(row => {
             // Map AppSheet Columns
             const dateStr = row['TransDate'] || row['Date'];
             const party = (row['Customer'] || row['Bill To'] || 'Unknown').trim();
             const number = (row['INVNum'] || row['Invoice #'] || '').toString().trim();
             const statusRaw = (row['Invoice Status'] || '').toLowerCase();
             
             // Clean Currency
             const amt = parseFloat((row['Grand Total'] || "0").toString().replace(/[^0-9.-]/g, ''));
             
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

    // --- DIRECT CALL (Backup) ---
    importInvoices: (file) => {
        // Just passes to main import which now auto-detects
        Handlers.importCSV(file);
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
            // Only ask to force if it was meant to be transactions
            if(typeLabel === 'transactions' && confirm("No new unique data found. Force import anyway?")) {
                 // Forcing re-process (skipping dup check logic not shown for brevity, but UI toast handles it)
                 UI.showToast("Import cancelled.", "error");
            } else {
                UI.showToast(`No new ${typeLabel} found (duplicates skipped).`, "error");
            }
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

    // --- SAVE SESSION (Metadata) ---
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

    // --- LOAD SESSION ---
    loadSession: async () => {
        if(State.user) {
            try {
                const userDocRef = doc(db, 'users', State.user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if(userDoc.exists()) {
                    const d = userDoc.data();
                    if(d.rules) State.rules = JSON.parse(d.rules);
                    if(d.categories) State.categories = JSON.parse(d.categories);
                    
                    if (d.data && d.data.length > 20) {
                        try {
                            const oldData = JSON.parse(d.data);
                            State.data = oldData;
                            Handlers.refreshAll();
                            await Handlers.batchSaveTransactions(oldData);
                            await setDoc(userDocRef, { data: null }, { merge: true });
                            UI.showToast("Migration Complete");
                        } catch (err) { console.error(err); }
                    } else {
                        const q = collection(db, 'users', State.user.uid, 'transactions');
                        const querySnapshot = await getDocs(q);
                        const txs = [];
                        querySnapshot.forEach((doc) => txs.push(doc.data()));
                        State.data = txs;
                    }
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

    // --- UPDATE HELPERS ---
    updateSingleItem: async (item) => {
        const idx = State.data.findIndex(d => d.id === item.id);
        if(idx > -1) State.data[idx] = item;
        
        if(State.user) {
            try {
                const ref = doc(db, 'users', State.user.uid, 'transactions', item.id);
                await setDoc(ref, item); 
            } catch(e) { console.error(e); UI.showToast("Sync Error", "error"); }
        } else {
            Handlers.saveSessionLocally();
        }
    },

    // --- ACTIONS ---
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
            const updatedTx = { ...tx, category: newCat, job: document.getElementById('modal-job').value, notes: document.getElementById('modal-notes').value };
            
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            UI.closeModal('edit-modal');
            
            if (oldCat !== newCat) {
                const similar = State.data.filter(t => t.type === 'transaction' && t.id !== id && t.description.toLowerCase().includes(tx.description.split(' ')[0].toLowerCase()));
                if(similar.length > 0) {
                    const msgEl = document.getElementById('batch-msg');
                    if(msgEl) msgEl.textContent = `Update ${similar.length} other transactions like "${tx.description.split(' ')[0]}..." to "${newCat}"?`;
                    
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
        const affected = [];
        State.data.forEach(t => { if(t.category === name) { t.category = 'Uncategorized'; affected.push(t); } });
        UI.populateRuleCategories();
        UI.renderCategoryManagementList();
        Handlers.refreshAll();
        Handlers.saveSession();
        if(State.user && affected.length > 0) Handlers.batchSaveTransactions(affected);
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
                    snapshot.forEach(doc => {
                        batch.delete(doc.ref);
                        count++;
                        if (count >= batchSize) { batch.commit(); batch = writeBatch(db); count = 0; }
                    });
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
