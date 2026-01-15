import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    document.getElementById('csv-file').addEventListener('change', (e) => Handlers.importCSV(e.target.files[0]));
    
    // Filters
    const setupFilter = (id, field) => { const el = document.getElementById(id); if(el) el.addEventListener('change', (e) => { State.filters[field] = e.target.value; Handlers.refreshAll(); }); };
    setupFilter('year-filter', 'year'); setupFilter('month-filter', 'month'); setupFilter('mobile-year-filter', 'year'); setupFilter('mobile-month-filter', 'month');

    // Inputs
    document.getElementById('tx-search').addEventListener('input', () => UI.renderTransactions());
    document.getElementById('tax-rate-input').addEventListener('input', () => UI.renderTaxes());
    document.getElementById('recon-input').addEventListener('input', () => UI.updateReconCalc());

    // Click Handlers
    document.getElementById('save-session-btn').addEventListener('click', Handlers.saveSession);
    document.getElementById('btn-add-rule').addEventListener('click', Handlers.addRule);
    document.getElementById('btn-save-tx').addEventListener('click', Handlers.saveTransactionEdit);
    document.getElementById('btn-save-apar').addEventListener('click', Handlers.saveApAr);
    document.getElementById('clear-session-btn').addEventListener('click', () => UI.openModal('confirm-modal'));
    document.getElementById('btn-confirm-clear').addEventListener('click', Handlers.clearData);
    document.getElementById('btn-add-cat').addEventListener('click', Handlers.addCategory); // New binding

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
        }
    });
});
