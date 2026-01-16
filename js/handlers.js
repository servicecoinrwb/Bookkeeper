// ... (imports)

export const Handlers = {
    // ... (importCSV, importInvoices, batchSave, saveSession, loadSession, refreshAll) ...

    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-desc').value = tx.description;
        document.getElementById('modal-amount').value = tx.amount;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        
        // FIX: Populate Dropdown FIRST
        UI.populateRuleCategories(); 
        
        // THEN set the value so it shows up selected
        const catSelect = document.getElementById('modal-category');
        if(catSelect) catSelect.value = tx.category;

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
    
    // ... (Rest of handlers: toggleReconcile, toggleAllRec, addRule, deleteRule, addCategory, deleteCategory, openApAr, saveApAr, toggleApArStatus, clearData, exportToIIF) ...
    // Placeholder to keep file valid if you copy/paste this block
    updateSingleItem: async (item) => { const idx = State.data.findIndex(d => d.id === item.id); if(idx > -1) State.data[idx] = item; if(State.user) { await setDoc(doc(db, 'users', State.user.uid, 'transactions', item.id), item); } else { Handlers.saveSessionLocally(); } },
    toggleReconcile: (id) => { const tx = State.data.find(d => d.id === id); if(tx) { tx.reconciled = !tx.reconciled; Handlers.updateSingleItem(tx); Handlers.refreshAll(); } },
    toggleAllRec: async (checked) => { const search = document.getElementById('tx-search').value.toLowerCase(); const visibleTxs = UI.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search))); visibleTxs.forEach(tx => tx.reconciled = checked); UI.renderTransactions(); if(State.user) await Handlers.batchSaveTransactions(visibleTxs); else Handlers.saveSessionLocally(); },
    addRule: () => { const k = document.getElementById('rule-keyword').value; const c = document.getElementById('rule-category').value; if(k && c) { State.rules.push({keyword:k, category:c}); UI.renderRulesList(); Handlers.saveSession(); } },
    deleteRule: (i) => { State.rules.splice(i, 1); UI.renderRulesList(); Handlers.saveSession(); },
    addCategory: () => { const n = document.getElementById('new-cat-name').value; if(n && !State.categories.includes(n)) { State.categories.push(n); State.categories.sort(); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.saveSession(); } },
    deleteCategory: (n) => { if(n !== 'Uncategorized') { State.categories = State.categories.filter(c => c !== n); UI.populateRuleCategories(); UI.renderCategoryManagementList(); Handlers.refreshAll(); Handlers.saveSession(); } },
    openApArModal: (t) => { document.getElementById('ap-ar-type').value=t; UI.openModal('ap-ar-modal'); },
    saveApAr: () => { UI.closeModal('ap-ar-modal'); }, // Simplified
    clearData: async () => { if(confirm("Delete All?")) { State.data = []; Handlers.refreshAll(); } },
    exportToIIF: () => { /* ... */ },
    importCSV: (f) => { /* ... */ },
    importInvoices: (f) => { /* ... */ },
    batchSaveTransactions: async (i) => { /* ... */ },
    saveSession: async () => { /* ... */ },
    saveSessionLocally: () => { /* ... */ },
    loadSession: async () => { /* ... */ },
    refreshAll: () => { /* ... */ }
};
