import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from './firebase.js';

export const Handlers = {
    // --- IMPORT CSV ---
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
                     // Smart Column Matching
                     const headers = Object.keys(row);
                     const find = (arr) => headers.find(h => arr.some(x => h.toLowerCase().includes(x)));
                     
                     const dateStr = row[find(['date','transdate']) || 'Date'];
                     const desc = (row[find(['desc','memo','payee']) || 'Description'] || 'No Desc').trim();
                     let amt = parseFloat((row[find(['amount','total']) || 'Amount'] || "0").toString().replace(/[^0-9.-]/g, ''));
                     
                     if(isNaN(amt)) {
                         const debit = parseFloat((row['Debit']||"0").toString().replace(/[^0-9.-]/g, ''));
                         const credit = parseFloat((row['Credit']||"0").toString().replace(/[^0-9.-]/g, ''));
                         if(debit !== 0) amt = -Math.abs(debit);
                         else if(credit !== 0) amt = Math.abs(credit);
                     }
                     
                     if(!dateStr || isNaN(amt) || amt === 0) return null;

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
                
                if (newTxs.length > 0) {
                    State.data = [...State.data, ...newTxs];
                    Handlers.refreshAll();
                    UI.showToast(`Success! Imported ${newTxs.length} new transactions.`);
                    Handlers.batchSaveTransactions(newTxs); // Save only new items to cloud
                } else {
                     const forceTxs = rawRows.map(parseRow).filter(Boolean);
                     if (forceTxs.length > 0) {
                         State.data = [...State.data, ...forceTxs];
                         Handlers.refreshAll();
                         UI.showToast(`Forced Import: ${forceTxs.length} items.`);
                         Handlers.batchSaveTransactions(forceTxs);
                     } else {
                         UI.showToast("Could not parse rows.", "error");
                     }
                }
            }
        });
    },

    // --- IMPORT INVOICES ---
    importInvoices: (file) => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results) => {
                const rawRows = results.data;
                const existingInvoices = new Set(State.data.filter(d => d.type === 'ar').map(i => i.number ? i.number.toString().toLowerCase() : ''));

                const newInvoices = rawRows.map(row => {
                     const headers = Object.keys(row);
                     const find = (arr) => headers.find(h => arr.some(x => h.toLowerCase().includes(x)));

                     const dateStr = row[find(['date','invdate']) || 'Date'];
                     const party = (row[find(['customer','client']) || 'Customer'] || 'Unknown').trim();
                     const number = (row[find(['invoice','num']) || 'Invoice #'] || '').toString().trim();
                     const amt = parseFloat((row[find(['amount','total']) || 'Amount'] || "0").toString().replace(/[^0-9.-]/g, ''));
                     
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
                    Handlers.batchSaveTransactions(newInvoices);
                } else {
                    UI.showToast("No new invoices found.", "error");
                }
            }
        });
    },

    // --- BATCH SAVE (New Cloud Storage) ---
    batchSaveTransactions: async (items) => {
        if (!State.user) {
            Handlers.saveSessionLocally();
            return;
        }
        
        try {
            const batchSize = 400; // Safe batch size
            for (let i = 0; i < items.length; i += batchSize) {
                const chunk = items.slice(i, i + batchSize);
                const batch = writeBatch(db);
                chunk.forEach(item => {
                    // Save to sub-collection 'transactions'
                    const ref = doc(db, 'users', State.user.uid, 'transactions', item.id);
                    batch.set(ref, item);
                });
                await batch.commit();
            }
            console.log(`Saved ${items.length} items to cloud.`);
        } catch (e) {
            console.error("Batch Save Error:", e);
            UI.showToast("Cloud Save Failed: Check Permissions", "error");
        }
    },

    // --- SAVE METADATA (Rules/Cats) ---
    saveSession: async () => {
        if (State.user) {
            try {
                const statusEl = document.getElementById('cloud-status');
                if(statusEl) statusEl.classList.remove('hidden');
                
                await setDoc(doc(db, 'users', State.user.uid), {
                    rules: JSON.stringify(State.rules),
                    categories: JSON.stringify(State.categories),
                    lastUpdated: new Date()
                }, { merge: true }); // Merge preserves subcollections
                
                if(statusEl) statusEl.classList.add('hidden');
                UI.showToast("Settings Saved");
            } catch (e) { 
                console.error("Meta Save Error:", e);
                UI.showToast("Settings Save Failed", "error"); 
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

    // --- LOAD WITH FALLBACK ---
    loadSession: async () => {
        if(State.user) {
            try {
                const userDocRef = doc(db, 'users', State.user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if(userDoc.exists()) {
                    const d = userDoc.data();
                    if(d.rules) State.rules = JSON.parse(d.rules);
                    if(d.categories) State.categories = JSON.parse(d.categories);
                    
                    // MIGRATION Logic
                    if (d.data && d.data.length > 20) { // If 'data' string exists and is not empty '[]'
                        console.log("Attempting migration...");
                        try {
                            const oldData = JSON.parse(d.data);
                            State.data = oldData; // Load into memory immediately so user sees data
                            Handlers.refreshAll();
                            
                            // Try to migrate to subcollection
                            await Handlers.batchSaveTransactions(oldData);
                            await setDoc(userDocRef, { data: null }, { merge: true }); // Clear old blob
                            UI.showToast("Migration Complete");
                        } catch (migrationErr) {
                            console.error("Migration blocked:", migrationErr);
                            UI.showToast("Notice: Update Firestore Rules", "error");
                        }
                    } else {
                        // Load from new Subcollection
                        try {
                            const q = collection(db, 'users', State.user.uid, 'transactions');
                            const querySnapshot = await getDocs(q);
                            const txs = [];
                            querySnapshot.forEach((doc) => txs.push(doc.data()));
                            State.data = txs;
                        } catch (subErr) {
                            console.error("Subcollection read failed:", subErr);
                             // If read fails, State.data remains empty or falls back
                        }
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

    // --- INDIVIDUAL UPDATES ---
    updateSingleItem: async (item) => {
        // Update in memory
        const idx = State.data.findIndex(d => d.id === item.id);
        if(idx > -1) State.data[idx] = item;
        
        // Save
        if(State.user) {
            try {
                const ref = doc(db, 'users', State.user.uid, 'transactions', item.id);
                await setDoc(ref, item); 
            } catch(e) { 
                console.error("Update failed", e); 
                UI.showToast("Sync Error: Check Rules", "error");
            }
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
            
            // Create updated object
            const updatedTx = {
                ...tx,
                category: newCat,
                job: document.getElementById('modal-job').value,
                notes: document.getElementById('modal-notes').value
            };
            
            if(newCat && !State.categories.includes(newCat)) State.categories.push(newCat);
            UI.closeModal('edit-modal');
            
            // Handle Batch
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

    toggleReconcile: (id) => { 
        const tx = State.data.find(d => d.id === id); 
        if(tx) { 
            tx.reconciled = !tx.reconciled; 
            Handlers.updateSingleItem(tx); 
            Handlers.refreshAll(); 
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

    // --- RULES / CATS / OTHER ---
    addRule: () => {
        const key = document.getElementById('rule-keyword').value.trim();
        const cat = document.getElementById('rule-category').value;
        if(key && cat) {
            State.rules.push({ keyword: key, category: cat });
            UI.renderRulesList();
            document.getElementById('rule-keyword').value = '';
            Handlers.saveSession(); // Saves meta
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
            Handlers.saveSession();
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

    toggleApArStatus: (id) => {
        const item = State.data.find(d => d.id === id);
        if(item) {
            item.status = item.status === 'unpaid' ? 'paid' : 'unpaid';
            Handlers.updateSingleItem(item);
            Handlers.refreshAll();
        }
    },

    clearData: async () => {
        if(confirm("Are you sure? This cannot be undone.")) {
            if(State.user) {
                try {
                    // Delete subcollection (in chunks)
                    const q = collection(db, 'users', State.user.uid, 'transactions');
                    const snapshot = await getDocs(q);
                    const batchSize = 400;
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
