import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from './firebase.js';

export const Handlers = {
    // ... (Keep existing imports, saveSession, loadSession, refreshAll) ...

    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        
        // Fill IDs based on new HTML
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-desc').value = tx.description; // NEW: Editable Description
        document.getElementById('modal-amount').value = tx.amount;    // NEW: Visible Amount
        document.getElementById('modal-category').value = tx.category;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        
        // Uncheck the rule box by default
        document.getElementById('modal-create-rule').checked = false;

        // Ensure datalist is populated
        const jobList = document.getElementById('job-list');
        if(jobList) {
            const jobs = [...new Set(State.data.map(d => d.job).filter(Boolean))];
            jobList.innerHTML = jobs.map(j => `<option value="${j}">`).join('');
        }

        UI.populateRuleCategories(); // Ensure dropdown has latest cats
        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            const newDesc = document.getElementById('modal-desc').value.trim();
            const newCat = document.getElementById('modal-category').value;
            const newJob = document.getElementById('modal-job').value;
            const newNotes = document.getElementById('modal-notes').value;
            const makeRule = document.getElementById('modal-create-rule').checked;

            // Update Transaction
            const updatedTx = { ...tx, description: newDesc, category: newCat, job: newJob, notes: newNotes };
            
            // Create Rule if requested
            if (makeRule && newDesc && newCat) {
                // Check if rule exists to avoid dupes
                const exists = State.rules.some(r => r.keyword === newDesc && r.category === newCat);
                if(!exists) {
                    State.rules.push({ keyword: newDesc, category: newCat });
                    UI.renderRulesList();
                    UI.showToast("Rule Created");
                }
            }

            Handlers.updateSingleItem(updatedTx);
            UI.closeModal('edit-modal');
            Handlers.refreshAll();
            // Don't need to call saveSession because updateSingleItem saves to cloud, but rules need saving
            if(makeRule) Handlers.saveSession(); // Save the new rule to metadata
            UI.showToast('Updated');
        }
    },

    // ... (Keep existing importCSV, importInvoices, batchSave, updateSingleItem, toggleReconcile, toggleAllRec, addRule, deleteRule, addCat, deleteCat, ap/ar, clearData, export) ...
    // Note: Re-pasting standard methods for context
    importCSV: (file) => { Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => { /* ... existing ... */ } }); }, 
    // (Full methods from previous responses omitted for brevity, ensure they are present in your final file)
    // Make sure to include the updated `saveTransactionEdit` above!
    
    // Placeholder for other methods to ensure valid module
    importInvoices: async (file) => { /* ... */ },
    batchSaveTransactions: async (items) => { /* ... */ },
    saveSession: async () => { /* ... */ },
    loadSession: async () => { /* ... */ },
    refreshAll: () => { /* ... */ },
    updateSingleItem: async (item) => { /* ... */ },
    toggleReconcile: (id) => { /* ... */ },
    toggleAllRec: (checked) => { /* ... */ },
    addRule: () => { /* ... */ },
    deleteRule: (index) => { /* ... */ },
    addCategory: () => { /* ... */ },
    deleteCategory: (name) => { /* ... */ },
    openApArModal: (type) => { /* ... */ },
    saveApAr: () => { /* ... */ },
    toggleApArStatus: (id) => { /* ... */ },
    clearData: async () => { /* ... */ },
    exportToIIF: () => { /* ... */ }
};
