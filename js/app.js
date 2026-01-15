import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    // Helper to safely add event listeners
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // --- Inputs & Filters ---
    addListener('csv-file', 'change', (e) => Handlers.importCSV(e.target.files[0]));
    
    // Desktop Filters
    addListener('year-filter', 'change', (e) => { State.filters.year = e.target.value; Handlers.refreshAll(); });
    addListener('month-filter', 'change', (e) => { State.filters.month = e.target.value; Handlers.refreshAll(); });
    
    // Mobile Filters
    addListener('mobile-year-filter', 'change', (e) => { State.filters.year = e.target.value; Handlers.refreshAll(); });
    addListener('mobile-month-filter', 'change', (e) => { State.filters.month = e.target.value; Handlers.refreshAll(); });

    // Live Search
    addListener('tx-search', 'input', () => UI.renderTransactions());
    addListener('ar-search', 'input', () => UI.renderSimpleTable('ar', 'ar-container'));
    addListener('ap-search', 'input', () => UI.renderSimpleTable('ap', 'ap-container'));
    
    // NEW: Report Search
    addListener('report-search', 'input', () => {
        // We re-render the active report to apply the search filter
        const activeReport = document.querySelector('.rep-tab.border-b-2.border-brand-600');
        if(activeReport) {
            // Extract the report type from ID (e.g. rep-tab-vendors -> vendors)
            const type = activeReport.id.replace('rep-tab-', '');
            UI.switchReport(type);
        }
    });
    
    // Rec All Checkbox
    addListener('rec-all-checkbox', 'change', (e) => Handlers.toggleAllRec(e.target.checked));

    // Calculators
    addListener('tax-rate-input', 'input', () => UI.renderTaxes());
    addListener('recon-input', 'input', () => UI.updateReconCalc());

    // --- Action Buttons ---
    addListener('save-session-btn', 'click', Handlers.saveSession);
    addListener('btn-add-rule', 'click', Handlers.addRule);
    addListener('btn-save-tx', 'click', Handlers.saveTransactionEdit);
    addListener('btn-save-apar', 'click', Handlers.saveApAr);
    
    // Clear Data Flow
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
