import { State } from './state.js';
import { Utils } from './utils.js';

export const UI = {
    init() {
        lucide.createIcons();
        this.renderFilters();
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.remove('translate-x-full');
        // Add timeout to hide...
        setTimeout(() => toast.classList.add('translate-x-full'), 3000);
    },

    switchTab(tabName) {
        // Update Nav visual state
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if(btn.dataset.tab === tabName) {
                btn.classList.add('bg-brand-900/50', 'text-brand-100', 'border-brand-700');
                btn.classList.remove('text-slate-400');
            } else {
                btn.classList.remove('bg-brand-900/50', 'text-brand-100', 'border-brand-700');
                btn.classList.add('text-slate-400');
            }
        });

        // Hide all views, show target
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${tabName}`);
        if(target) target.classList.remove('hidden');

        // Render specific view data
        if(tabName === 'dashboard') this.renderDashboard();
        if(tabName === 'transactions') this.renderTransactions();
    },

    renderDashboard() {
        const txs = State.data.filter(d => d.type === 'transaction');
        const net = txs.reduce((sum, t) => sum + t.amount, 0);
        
        const netEl = document.getElementById('dash-net');
        netEl.textContent = Utils.formatCurrency(net);
        netEl.className = `text-2xl font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`;

        // Chart rendering logic would go here...
    },

    renderTransactions() {
        const tbody = document.getElementById('tx-table-body');
        tbody.innerHTML = State.data
            .filter(t => t.type === 'transaction')
            .map(t => `
                <tr class="hover:bg-slate-50">
                    <td class="px-6 py-4">${t.date}</td>
                    <td class="px-6 py-4 font-medium">${t.description}</td>
                    <td class="px-6 py-4 ${t.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'} font-bold">
                        ${Utils.formatCurrency(t.amount)}
                    </td>
                    <td class="px-6 py-4"><span class="bg-slate-100 px-2 py-1 rounded text-xs">${t.category}</span></td>
                    <td class="px-6 py-4 text-brand-600 cursor-pointer">Edit</td>
                </tr>
            `).join('');
    },
    
    renderFilters() {
        // Populate Year dropdown...
        const yearSelect = document.getElementById('year-filter');
        yearSelect.innerHTML = '<option value="all">All Years</option>';
        // Add logic to find years in State.data
    }
};
