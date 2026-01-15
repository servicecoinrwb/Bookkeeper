import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    // Helper
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // --- Inputs & Filters ---
    addListener('csv-file', 'change', (e) => Handlers.importCSV(e.target.files[0]));
    
    // Universal Filter Handler
    const updateFilter = (field, val) => {
        State.filters[field] = val;
        Handlers.refreshAll();
        // Force Tax Update if in view
        if(State.currentView === 'taxes') UI.renderTaxes(); 
    };

    addListener('year-filter', 'change', (e) => updateFilter('year', e.target.value));
    addListener('month-filter', 'change', (e) => updateFilter('month', e.target.value));
    addListener('mobile-year-filter', 'change', (e) => updateFilter('year', e.target.value));
    addListener('mobile-month-filter', 'change', (e) => updateFilter('month', e.target.value));

    // Live Search & Calc
    addListener('tx-search', 'input', () => UI.renderTransactions());
    addListener('tax-rate-input', 'input', () => UI.renderTaxes());
    addListener('recon-input', 'input', () => UI.updateReconCalc());

    // --- Actions ---
    addListener('save-session-btn', 'click', Handlers.saveSession);
    addListener('btn-add-rule', 'click', Handlers.addRule);
    addListener('btn-save-tx', 'click', Handlers.saveTransactionEdit);
    addListener('btn-save-apar', 'click', Handlers.saveApAr);
    
    // Clear Data
    addListener('clear-session-btn', 'click', () => UI.openModal('confirm-modal'));
    addListener('btn-confirm-clear', 'click', Handlers.clearData);
    
    // Categories & Export
    addListener('btn-add-cat', 'click', Handlers.addCategory);
    addListener('btn-export', 'click', Handlers.exportToIIF);

    // --- Auth ---
    addListener('login-btn', 'click', () => signInWithPopup(auth, provider));
    addListener('logout-btn', 'click', () => signOut(auth));

    onAuthStateChanged(auth, (user) => {
        State.user = user;
        const loginBtn = document.getElementById('login-btn');
        const profile = document.getElementById('user-profile');
        const name = document.getElementById('user-name');
        const avatar = document.getElementById('user-avatar');

        if(user) {
            if(loginBtn) loginBtn.classList.add('hidden');
            if(profile) profile.classList.remove('hidden');
            if(name) name.textContent = user.displayName;
            if(avatar) avatar.src = user.photoURL;
            Handlers.loadSession();
        } else {
            if(loginBtn) loginBtn.classList.remove('hidden');
            if(profile) profile.classList.add('hidden');
        }
    });
});
