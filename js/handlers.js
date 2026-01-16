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
                const headers = (results.meta.fields || []).map(h => h.replace(/["']/g, '').trim());
                const rawRows = results.data;
                
                // 2. DETECT FILE TYPE
                // We check for 'INVNum' which is unique to your Invoice file
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
        // Helper to find column matching any of the patterns
        const findCol = (patterns) => headers.find(h => patterns.some(p => h.toLowerCase().includes(p)));
        
        const dateKey = findCol(['date', 'time']) || 'Date';
        const descKey = findCol(['desc', 'memo', 'payee', 'name']) || 'Description';
        const amtKey = findCol(['amount', 'total', 'net']) || 'Amount';
        const debitKey = findCol(['debit', 'withdrawal']);
        const creditKey = findCol(['credit', 'deposit']);

        // Build deduplication map
        const existingSigs = new Set();
        State.data.forEach(tx => {
            if(tx.type === 'transaction') existingSigs.add(`${tx.date}|${tx.description}|${tx.amount}`);
        });

        // Helper to safely get value from row regardless of quotes in key
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
             
             // Handle Debit/Credit columns
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

             // Check Duplicate
             if (existingSigs.has(`${cleanDate}|${desc}|${amt}`)) return null;

             // Auto-Categorize
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
            Handlers.refreshAll();
            UI.showToast(`Success! Imported ${items.length} ${typeLabel}.`);
            if(State.user) await Handlers.batchSaveTransactions(items);
            else Handlers.saveSessionLocally();
        } else {
            UI.showToast(`No new ${typeLabel} found (duplicates).`, "error");
        }
    },

    // --- EDITING ---
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        
        // Populate fields
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-desc').value = tx.description;
        document.getElementById('modal-amount').value = tx.amount;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        
        // FORCE POPULATE DROPDOWN
        const catSelect = document.getElementById('modal-category');
        catSelect.innerHTML = State.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        catSelect.value = tx.category; // Select current category

        // Reset rule checkbox
        document.getElementById('modal-create-rule').checked = false;

        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            const oldCat = tx.category;
            
            // Get Values from Advanced Modal Inputs
            const newDesc = document.getElementById('modal-desc').value.trim();
            const newCat = document.getElementById('modal-category').value;
            const newJob = document.getElementById('modal-job').value.trim();
            const newNotes = document.getElementById('modal-notes').value.trim();
            const makeRule = document.getElementById('modal-create-rule').checked;

            const updatedTx = { ...tx, description: newDesc, category: newCat, job: newJob, notes: newNotes };
            
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            
            UI.closeModal('edit-modal');
            
            // Create Rule
            if (makeRule && newDesc && newCat) {
                // Dedupe Rules
                const exists = State.rules.some(r => r.keyword === newDesc && r.category === newCat);
                if(!exists) {
                    State.rules.push({ keyword: newDesc, category: newCat });
                    UI.renderRulesList();
                    UI.showToast("Rule Created");
                    Handlers.saveSession(); // Save rules immediately
                }
            }
            
            // Batch Logic
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

    // --- HELPERS ---
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

    saveSession: async () => {
        if (State.user) {
            try {
                await setDoc(doc(db, 'users', State.user.uid), {
                    rules: JSON.stringify(State.rules),
                    categories: JSON.stringify(State.categories),
                    lastUpdated: new Date()
                }, { merge: true });
                UI.showToast("Settings Saved");
            } catch (e) { console.error(e); }
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
                    
                    if (d.data && d.data.length > 20) {
                         // Migration path
                         try {
                             const oldData = JSON.parse(d.data);
                             State.data = oldData;
                             Handlers.refreshAll();
                             await Handlers.batchSaveTransactions(oldData);
                             await setDoc(userDocRef, { data: null }, { merge: true });
                             UI.showToast("Migration Complete");
                         } catch (err) { console.error(err); }
                    } else {
                        // Load Subcollection
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
    
    // --- Other handlers ---
    toggleReconcile: (id) => { const tx = State.data.find(d => d.id === id); if(tx) { tx.reconciled = !tx.reconciled; Handlers.updateSingleItem(tx); Handlers.refreshAll(); } },
    toggleAllRec: async (checked) => { const search = document.getElementById('tx-search').value.toLowerCase(); const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search))); visibleTxs.forEach(tx => tx.reconciled = checked); UI.renderTransactions(); if(State.user) await Handlers.batchSaveTransactions(visibleTxs); else Handlers.saveSessionLocally(); },
    addRule: () => { const k = document.getElementById('rule-keyword').value.trim(); const c = document.getElementById('rule-category').value; if(k && c) { State.rules.push({keyword:k, category:c}); UI.renderRulesList(); Handlers.saveSession(); } },
    deleteRule: (i) => { State.rules.splice(i, 1); UI.renderRulesList(); Handlers.saveSession(); },
    addCategory: () => { const n = document.getElementById('new-cat-name').value.trim(); if(n && !State.categories.includes(n)) { State.categories.push(n); State.categories.sort(); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.saveSession(); } },
    deleteCategory: (n) => { if(n !== 'Uncategorized') { State.categories = State.categories.filter(c => c !== n); State.data.forEach(t => { if(t.category === n) { t.category = 'Uncategorized'; } }); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.refreshAll(); Handlers.saveSession(); } },
    openApArModal: (t) => { document.getElementById('ap-ar-id').value=''; document.getElementById('ap-ar-type').value=t; UI.openModal('ap-ar-modal'); },
    saveApAr: () => { const type = document.getElementById('ap-ar-type').value; const item = { id: Utils.generateId(type), type: type, party: document.getElementById('ap-ar-party').value, number: document.getElementById('ap-ar-number').value, date: document.getElementById('ap-ar-date').value, amount: parseFloat(document.getElementById('ap-ar-amount').value)||0, status: 'unpaid' }; State.data.push(item); UI.closeModal('ap-ar-modal'); Handlers.updateSingleItem(item); Handlers.refreshAll(); },
    toggleApArStatus: (id) => { const item = State.data.find(d => d.id === id); if(item) { item.status = item.status === 'unpaid' ? 'paid' : 'unpaid'; Handlers.updateSingleItem(item); Handlers.refreshAll(); } },
    clearData: async () => { if(confirm("Delete All?")) { if(State.user) { /* Logic to delete collection */ } State.data = []; Handlers.refreshAll(); } },
    
    // Direct calls for Invoice button
    importInvoices: (f) => { Handlers.importCSV(f); },
    exportToIIF: () => { /* ... */ }
};
