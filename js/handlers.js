import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc, getDoc } from './firebase.js';

export const Handlers = {
    importCSV: (file) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const newTxs = results.data.map((row) => {
                     // Robust Column Matching
                     const dateStr = row['Date'] || row['date'] || row['TransDate'];
                     const desc = row['Description'] || row['Memo'] || row['description'] || 'No Desc';
                     let amt = parseFloat(row['Amount'] || row['amount'] || row['Grand Total']);
                     
                     // Handle Debit/Credit columns
                     if(isNaN(amt)) {
                         const debit = parseFloat(row['Debit']);
                         const credit = parseFloat(row['Credit']);
                         if(!isNaN(debit)) amt = -debit;
                         if(!isNaN(credit)) amt = credit;
                     }
                     if(!dateStr || isNaN(amt)) return null;

                     return {
                         id: Utils.generateId('tx'),
                         type: 'transaction',
                         date: new Date(dateStr).toISOString().split('T')[0],
                         description: desc,
                         amount: amt,
                         category: 'Uncategorized',
                         reconciled: false,
                         job: ''
                     };
                }).filter(Boolean);
                
                State.data = [...State.data, ...newTxs];
                UI.updateDashboard();
                UI.switchTab(State.currentView);
                UI.renderDateFilters();
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
                    lastUpdated: new Date()
                });
                document.getElementById('cloud-status').classList.add('hidden');
                UI.showToast("Saved to Cloud");
            } catch (e) { console.error(e); UI.showToast("Save Failed", "error"); }
        } else {
            localStorage.setItem('bk_data', JSON.stringify(State.data));
            UI.showToast("Saved Locally");
        }
    },

    loadSession: async () => {
        if(State.user) {
            const snap = await getDoc(doc(db, 'users', State.user.uid));
            if(snap.exists()) State.data = JSON.parse(snap.data().data || '[]');
        } else {
            const local = localStorage.getItem('bk_data');
            if(local) State.data = JSON.parse(local);
        }
        UI.renderDateFilters();
        UI.updateDashboard();
    },
    
    editTransaction: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(!tx) return;
        
        document.getElementById('modal-tx-id').value = id;
        document.getElementById('modal-tx-desc').textContent = tx.description;
        document.getElementById('modal-category').value = tx.category;
        document.getElementById('modal-job').value = tx.job || '';
        document.getElementById('modal-notes').value = tx.notes || '';
        
        // Populate Datalists
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
            
            if(tx.category && !State.categories.includes(tx.category)) State.categories.push(tx.category);

            UI.closeModal('edit-modal');
            UI.switchTab(State.currentView);
            UI.updateDashboard();
            Handlers.saveSession();
            UI.showToast('Transaction Updated');
        }
    },

    toggleReconcile: (id) => {
        const tx = State.data.find(d => d.id === id);
        if(tx) {
            tx.reconciled = !tx.reconciled;
            Handlers.saveSession();
        }
    },

    exportToIIF: () => {
        const bankAccount = prompt("Enter Bank Account Name (e.g. Checking):", "Checking");
        if(!bankAccount) return;

        let content = `!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n`;
        content += `!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n`;
        content += `!ENDTRNS\n`;

        const txs = UI.getFilteredData().filter(d => d.type === 'transaction');
        
        txs.forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('en-US', {month: '2-digit', day: '2-digit', year: 'numeric'});
            const type = tx.amount < 0 ? 'EXPENSE' : 'DEPOSIT';
            const memo = (tx.description + ' ' + (tx.notes || '')).trim();
            const amt = tx.amount.toFixed(2);

            content += `TRNS\t\t${type}\t${date}\t${bankAccount}\t${tx.job||''}\t${amt}\t\t${memo}\n`;
            content += `SPL\t\t${type}\t${date}\t${tx.category}\t${tx.job||''}\t${(-amt).toFixed(2)}\t\t${memo}\n`;
            content += `ENDTRNS\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quickbooks_import.iif';
        a.click();
    }
};
