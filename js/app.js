import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

// Expose Globals for HTML onclicks
window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    // File Inputs
    document.getElementById('csv-file').addEventListener('change', (e) => Handlers.importCSV(e.target.files[0]));
    
    // Filters
    document.getElementById('year-filter').addEventListener('change', (e) => { State.filters.year = e.target.value; Handlers.refreshAll(); });
    document.getElementById('month-filter').addEventListener('change', (e) => { State.filters.month = e.target.value; Handlers.refreshAll(); });
    document.getElementById('tx-search').addEventListener('input', () => UI.renderTransactions());

    // Tax Calculator Input
    document.getElementById('tax-rate-input').addEventListener('input', () => UI.renderTaxes());

    // Reconcile Input
    document.getElementById('recon-input').addEventListener('input', () => UI.updateReconCalc());

    // Rules
    document.getElementById('btn-add-rule').addEventListener('click', Handlers.addRule);

    // Transaction Save
    document.getElementById('btn-save-tx').addEventListener('click', Handlers.saveTransactionEdit);

    // Auth
    document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, provider));
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

    onAuthStateChanged(auth, (user) => {
        State.user = user;
        if(user) {
            document.getElementById('login-btn').classList.add('hidden');
            document.getElementById('user-profile').classList.remove('hidden');
            document.getElementById('user-name').textContent = user.displayName;
            document.getElementById('user-avatar').src = user.photoURL;
            Handlers.loadSession();
        } else {
            document.getElementById('login-btn').classList.remove('hidden');
            document.getElementById('user-profile').classList.add('hidden');
            // Guest mode: Rely on Handlers.loadSession from top of this file
        }
    });
});
