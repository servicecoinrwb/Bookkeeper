import { State } from './state.js';
import { UI } from './ui.js';
import { Utils } from './utils.js';
import { db, doc, setDoc } from './firebase.js';

export const Handlers = {
    handleImport(file) {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const newTxs = results.data.map((row) => ({
                    id: Utils.generateId(),
                    type: 'transaction',
                    date: row['Date'] || new Date().toISOString().split('T')[0],
                    description: row['Description'] || 'Imported',
                    amount: parseFloat(row['Amount']) || 0,
                    category: 'Uncategorized'
                }));

                State.addTransactions(newTxs);
                UI.renderDashboard();
                UI.renderTransactions();
                UI.showToast(`Imported ${newTxs.length} items`);
                Handlers.saveSession(); // Auto save
            }
        });
    },

    async saveSession() {
        if (State.user) {
            try {
                await setDoc(doc(db, 'users', State.user.uid), {
                    data: JSON.stringify(State.data),
                    lastUpdated: new Date()
                });
                UI.showToast("Saved to Cloud");
            } catch (e) { console.error(e); UI.showToast("Save Failed", "error"); }
        } else {
            localStorage.setItem('bk_data', JSON.stringify(State.data));
            UI.showToast("Saved Locally");
        }
    }
};
