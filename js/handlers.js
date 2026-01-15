import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc } from './firebase.js';

export const Handlers = {
    importCSV: (file) => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results) => {
                const newTxs = results.data.map(row => {
                     const dateStr = row['Date'] || row['date'] || row['TransDate'];
                     const desc = row['Description'] || row['Memo'] || row['description'] || 'No Desc';
                     let amt = parseFloat(row['Amount'] || row['amount'] || row['Grand Total']);
                     
                     // Handle Debit/Credit logic
                     if(isNaN(amt)) {
                         const debit = parseFloat(row['Debit']);
                         const credit = parseFloat(row['Credit']);
                         if(!isNaN(debit)) amt = -debit;
                         if(!isNaN(credit)) amt = credit;
                     }
                     if(!dateStr || isNaN(amt)) return null;

                     // Apply Rules
                     let category = 'Uncategorized';
                     for(const rule of State.rules) {
                         if(desc.toLowerCase().includes(rule.keyword.toLowerCase())) {
                             category = rule.category;
                             break;
                         }
                     }

                     return { id: Utils.generateId('tx'), type: 'transaction', date: new Date(dateStr).toISOString().split('T')[0], description: desc, amount: amt, category: category, reconciled: false, job: '' };
                }).filter(Boolean);
                
                State.data = [...State.data, ...newTxs];
                Handlers.refreshAll();
                UI.showToast(`Imported ${newTxs.length} transactions`);
                Handlers.saveSession();
            }
        });
    },

    saveSession: async () => {
        if (State.user) {
            try {
                document.getElementById('cloud-status').classList.remove('hidden');
                await setDoc(doc(db, 'users', State.user.uid), {
                    data: JSON.stringify(State.data),
                    rules: JSON.stringify(State.rules),
                    lastUpdated: new Date()
                });
                document.getElementById('cloud-status').classList.add('hidden');
                UI.showToast("Saved to Cloud");
            } catch (e) { console.error(e); UI.showToast("Save Failed", "error"); }
        } else {
            localStorage.setItem('bk_data', JSON.stringify(State.data));
            localStorage.setItem('bk_rules', JSON.stringify(State.rules));
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
            }
        } else {
            const local = localStorage.getItem('bk_data');
            const rules = localStorage.getItem('bk_rules');
            if(local) State.data = JSON.parse(local);
            if(rules) State.rules = JSON.parse(rules);
        }
        Handlers.refreshAll();
    },

    refreshAll: () => {
        UI.renderDateFilters();
        UI.updateDashboard();
        if(State.currentView !== 'dashboard') UI.switchTab(State.currentView);
    },
    
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-category').value = tx.category;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        
        // Datalists
        document.getElementById('category-list').innerHTML = State.categories.map(c => `<option value="${c}">`).join('');
        const jobs = [...new Set(State.data.map(d => d.job).filter(Boolean))];
        document.getElementById('job-list').innerHTML = jobs.map(j => `<option value="${j}">`).join('');

        UI.openModal('edit-modal');
    },

    saveTransactionEdit: () => {
        const id = document.getElementById('modal-tx-id').value;
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            tx.category = document.getElementById('modal-category').value;
            tx.job = document.getElementById('modal-job').value;
            tx.notes = document.getElementById('modal-notes').value;
            
            // Add category if new
            if(tx.category && !State.categories.includes(tx.category)) State.categories.push(tx.category);

            UI.closeModal('edit-modal');
            Handlers.refreshAll();
            Handlers.saveSession();
            UI.showToast('Updated');
        }
    },

    toggleReconcile: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(tx) { tx.reconciled = !tx.reconciled; Handlers.saveSession(); }
    },

    addRule: () => {
        const key = document.getElementById('rule-keyword').value;
        const cat = document.getElementById('rule-category').value;
        if(key && cat) {
            State.rules.push({ keyword: key, category: cat });
            UI.renderRulesList();
            document.getElementById('rule-keyword').value = '';
            Handlers.saveSession();
        }
    },

    deleteRule: (index) => {
        State.rules.splice(index, 1);
        UI.renderRulesList();
        Handlers.saveSession();
    }
};
