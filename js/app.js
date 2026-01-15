import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // Filters & Inputs
    addListener('csv-file', 'change', (e) => Handlers.importCSV(e.target.files[0]));
    
    // NEW: Search Listeners
    addListener('tx-search', 'input', () => UI.renderTransactions());
    addListener('ar-search', 'input', () => UI.renderSimpleTable('ar', 'ar-container'));
    addListener('ap-search', 'input', () => UI.renderSimpleTable('ap', 'ap-container'));

    // NEW: Rec All Checkbox
    addListener('rec-all-checkbox', 'change', (e) => Handlers.toggleAllRec(e.target.checked));

    // Calculators
    addListener('tax-rate-input', 'input', () => UI.renderTaxes());
    addListener('recon-input', 'input', () => UI.updateReconCalc());

    // Date Filters
    const updateFilter = (field, val) => { State.filters[field] = val; Handlers.refreshAll(); };
    addListener('year-filter', 'change', (e) => updateFilter('year', e.target.value));
    addListener('month-filter', 'change', (e) => updateFilter('month', e.target.value));
    addListener('mobile-year-filter', 'change', (e) => updateFilter('year', e.target.value));
    addListener('mobile-month-filter', 'change', (e) => updateFilter('month', e.target.value));

    // Buttons
    addListener('save-session-btn', 'click', Handlers.saveSession);
    addListener('btn-add-rule', 'click', Handlers.addRule);
    addListener('btn-save-tx', 'click', Handlers.saveTransactionEdit);
    addListener('btn-save-apar', 'click', Handlers.saveApAr);
    addListener('clear-session-btn', 'click', () => UI.openModal('confirm-modal'));
    addListener('btn-confirm-clear', 'click', Handlers.clearData);
    addListener('btn-add-cat', 'click', Handlers.addCategory);
    addListener('btn-export', 'click', Handlers.exportToIIF);

    // Auth
    addListener('login-btn', 'click', () => signInWithPopup(auth, provider));
    addListener('logout-btn', 'click', () => signOut(auth));

    onAuthStateChanged(auth, (user) => {
        State.user = user;
        const loginBtn = document.getElementById('login-btn');
        const profile = document.getElementById('user-profile');
        if(user) {
            if(loginBtn) loginBtn.classList.add('hidden');
            if(profile) profile.classList.remove('hidden');
            document.getElementById('user-name').textContent = user.displayName;
            document.getElementById('user-avatar').src = user.photoURL;
            Handlers.loadSession();
        } else {
            if(loginBtn) loginBtn.classList.remove('hidden');
            if(profile) profile.classList.add('hidden');
        }
    });
});
