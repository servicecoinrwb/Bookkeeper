import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from './firebase.js';

export const Handlers = {
    // --- IMPORT CSV ---
    importCSV: async (file) => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: async (results) => {
                const rawRows = results.data;
                const headers = results.meta.fields || [];

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

                // Deduplicate
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
                
                // FORCE IMPORT Logic
                let finalTxs = newTxs;
                if (newTxs.length === 0) {
                     const forceTxs = rawRows.map(parseRow).filter(Boolean);
                     if (forceTxs.length > 0) {
                         finalTxs = forceTxs;
                         UI.showToast(`Imported ${forceTxs.length} transactions (Forced).`);
                     } else {
                         UI.showToast("Could not parse rows.", "error");
                         return;
                     }
                } else {
                    UI.showToast(`Success! Imported ${newTxs.length} new transactions.`);
                }

                // UPDATE STATE
                State.data = [...State.data, ...finalTxs];
                Handlers.refreshAll();

                // SAVE TO CLOUD (BATCHED)
                if(State.user) {
                    await Handlers.batchSaveTransactions(finalTxs);
                } else {
                    Handlers.saveSessionLocally();
                }
            }
        });
    },

    // --- INVOICE IMPORT ---
    importInvoices: async (file) => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: async (results) => {
                const rawRows = results.data;
                const headers = results.meta.fields || [];
                const findCol = (patterns) => headers.find(h => patterns.some(p => h.toLowerCase().includes(p)));
                
                const dateKey = findCol(['date', 'invdate']) || 'Date';
                const partyKey = findCol(['customer', 'client', 'bill to']) || 'Customer';
                const numKey = findCol(['invoice #', 'inv #', 'number']) || 'Invoice #';
                const amtKey = findCol(['amount', 'total', 'balance']) || 'Amount';

                const existingInvoices = new Set(State.data.filter(d => d.type === 'ar').map(i => i.number ? i.number.toString().toLowerCase() : ''));

                const newInvoices = rawRows.map(row => {
                     const dateStr = row[dateKey];
                     const party = (row[partyKey] || 'Unknown').trim();
                     const number = (row[numKey] || '').toString().trim();
                     const amt = parseFloat((row[amtKey] || "0").toString().replace(/[^0-9.-]/g, ''));
                     
                     if(!dateStr || isNaN(amt)) return null;
                     if (number && existingInvoices.has(number.toLowerCase())) return null;

                     let cleanDate;
                     try { cleanDate = new Date(dateStr).toLocaleDateString('en-CA'); } catch(e) { return null; }

                     return { id: Utils.generateId('ar'), type: 'ar', date: cleanDate, party: party, number: number || 'N/A', amount: amt, status: 'unpaid' };
                }).filter(Boolean);
                
                if (newInvoices.length > 0) {
                    State.data = [...State.data, ...newInvoices];
                    Handlers.refreshAll();
                    UI.showToast(`Success! Imported ${newInvoices.length} invoices.`);
                    if(State.user) await Handlers.batchSaveTransactions(newInvoices);
                    else Handlers.saveSessionLocally();
                } else {
                    UI.showToast("No new invoices found.", "error");
                }
            }
        });
    },

    // --- BATCH SAVE HELPER (Solves 1MB Limit) ---
    batchSaveTransactions: async (items) => {
        if (!State.user) return;
        
        // Write in batches of 500 (Firestore Limit)
        const batchSize = 500;
        for (let i = 0; i < items.length; i += batchSize) {
            const chunk = items.slice(i, i + batchSize);
            const batch = writeBatch(db);
            chunk.forEach(item => {
                const ref = doc(db, 'users', State.user.uid, 'transactions', item.id);
                batch.set(ref, item);
            });
            await batch.commit();
        }
        console.log(`Saved ${items.length} items to subcollection.`);
    },

    // --- SAVE / LOAD ---
    saveSession: async () => {
        // Only saves Metadata (Rules, Categories). Transactions are saved individually now.
        if (State.user) {
            try {
                const statusEl = document.getElementById('cloud-status');
                if(statusEl) statusEl.classList.remove('hidden');
                
                await setDoc(doc(db, 'users', State.user.uid), {
                    rules: JSON.stringify(State.rules),
                    categories: JSON.stringify(State.categories),
                    lastUpdated: new Date()
                }, { merge: true }); // Merge to not overwrite existing fields
                
                if(statusEl) statusEl.classList.add('hidden');
                UI.showToast("Settings Saved");
            } catch (e) { 
                console.error("Save Error:", e);
                UI.showToast(`Save Failed: ${e.message}`, "error"); 
            }
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
                    
                    // MIGRATION CHECK: If old 'data' blob exists, migrate it
                    if (d.data && d.data.length > 2) {
                        console.log("Migrating legacy data...");
                        const oldData = JSON.parse(d.data);
                        await Handlers.batchSaveTransactions(oldData); // Move to subcollection
                        await setDoc(userDocRef, { data: null }, { merge: true }); // Clear old blob
                        State.data = oldData;
                    } else {
                        // Load from Subcollection
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

    // --- INDIVIDUAL UPDATES (Writes directly to DB) ---
    updateSingleItem: async (item) => {
        if(State.user) {
            try {
                const ref = doc(db, 'users', State.user.uid, 'transactions', item.id);
                await setDoc(ref, item); 
            } catch(e) { console.error("Update failed", e); }
        } else {
            Handlers.saveSessionLocally();
        }
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
                    document.getElementById('btn-batch-yes').onclick = async () => { 
                        similar.forEach(t => t.category = newCat); 
                        // Batch update for similar items
                        if(State.user) await Handlers.batchSaveTransactions(similar);
                        else Handlers.saveSessionLocally();

                        UI.closeModal('batch-modal'); 
                        Handlers.refreshAll(); 
                    };
                    document.getElementById('btn-batch-no').onclick = () => UI.closeModal('batch-modal');
                    UI.openModal('batch-modal');
                }
            }

            Handlers.updateSingleItem(tx);
            Handlers.refreshAll();
            UI.showToast('Updated');
        }
    },

    toggleReconcile: (id) => { 
        const tx = State.data.find(d => d.id === id); 
        if(tx) { 
            tx.reconciled = !tx.reconciled; 
            Handlers.updateSingleItem(tx); 
            Handlers.refreshAll(); // Refresh to update recon calc
        } 
    },
    
    toggleAllRec: async (checked) => {
        const search = document.getElementById('tx-search').value.toLowerCase();
        const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search)));
        
        visibleTxs.forEach(tx => tx.reconciled = checked);
        UI.renderTransactions();
        
        if(State.user) await Handlers.batchSaveTransactions(visibleTxs);
        else Handlers.saveSessionLocally();
    },

    // --- OTHER ---
    addRule: () => {
        const key = document.getElementById('rule-keyword').value.trim();
        const cat = document.getElementById('rule-category').value;
        if(key && cat) {
            State.rules.push({ keyword: key, category: cat });
            UI.renderRulesList();
            document.getElementById('rule-keyword').value = '';
            Handlers.saveSession(); // Saves rules to main doc
            UI.showToast('Rule Added');
        }
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
            Handlers.saveSession(); // Saves cats to main doc
            UI.showToast('Category Added');
        }
    },
    deleteCategory: (name) => {
        if(name === 'Uncategorized') return;
        State.categories = State.categories.filter(c => c !== name);
        const affected = [];
        State.data.forEach(t => { 
            if(t.category === name) {
                t.category = 'Uncategorized';
                affected.push(t);
            }
        });
        
        UI.populateRuleCategories();
        UI.renderCategoryManagementList();
        Handlers.refreshAll();
        Handlers.saveSession(); // Save Cats
        if(State.user && affected.length > 0) Handlers.batchSaveTransactions(affected); // Update txs
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

    toggleApArStatus: (id) => {
        const item = State.data.find(d => d.id === id);
        if(item) {
            item.status = item.status === 'unpaid' ? 'paid' : 'unpaid';
            Handlers.updateSingleItem(item);
            Handlers.refreshAll();
        }
    },

    // CLEAR: Must delete subcollection docs
    clearData: async () => {
        if(confirm("Are you sure? This cannot be undone.")) {
            if(State.user) {
                // Delete cloud transactions (Chunked)
                const q = collection(db, 'users', State.user.uid, 'transactions');
                const snapshot = await getDocs(q);
                const batchSize = 500;
                let batch = writeBatch(db);
                let count = 0;
                
                snapshot.forEach(doc => {
                    batch.delete(doc.ref);
                    count++;
                    if (count >= batchSize) {
                        batch.commit();
                        batch = writeBatch(db);
                        count = 0;
                    }
                });
                await batch.commit(); // Commit remaining
                
                await setDoc(doc(db, 'users', State.user.uid), { data: null, rules: '[]', categories: '[]' });
            }
            
            State.data = []; State.rules = [];
            localStorage.removeItem('bk_data'); localStorage.removeItem('bk_rules'); localStorage.removeItem('bk_cats');
            UI.closeModal('confirm-modal');
            Handlers.refreshAll();
            UI.showToast("All Data Cleared");
        }
    },
    
    // KEEP EXPORT (Read-only)
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
