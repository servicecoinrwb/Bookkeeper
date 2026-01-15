import { State } from './state.js';
import { Utils } from './utils.js';
import { Handlers } from './handlers.js'; // Import handlers to bind clicks in HTML

export const UI = {
    charts: {},

    init() {
        lucide.createIcons();
        this.renderFilters();
        this.setupCharts();
        this.updateDashboard();
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = `fixed top-5 right-5 z-50 transform transition-all duration-300 px-4 py-3 rounded-lg shadow-lg text-white font-medium text-sm flex items-center gap-2 ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`;
        toast.classList.remove('translate-x-full');
        setTimeout(() => toast.classList.add('translate-x-full'), 3000);
    },

    openModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id).classList.add('hidden'); },

    switchTab(tabName) {
        // Update Nav visual state
        document.querySelectorAll('.nav-item').forEach(btn => {
            const isActive = btn.id === `nav-${tabName}`;
            btn.className = isActive 
                ? 'nav-item w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-brand-100 bg-brand-900/50 border border-brand-700'
                : 'nav-item w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors';
        });

        // Hide all views, show target
        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${tabName}`);
        if(target) target.classList.remove('hidden');

        // Update Title
        document.getElementById('page-title').textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);

        // Render specific view data
        if(tabName === 'transactions') this.renderTransactions();
        if(tabName === 'jobs') this.renderJobs();
        if(tabName === 'ar') this.renderAR();
        if(tabName === 'ap') this.renderAP();
        if(tabName === 'reports') this.renderReports();
        
        State.currentView = tabName;
    },

    getFilteredData() {
        return State.data.filter(d => {
            const date = new Date(d.date);
            const yearMatch = State.filters.year === 'all' || date.getFullYear().toString() === State.filters.year;
            const monthMatch = State.filters.month === 'all' || (date.getMonth() + 1).toString() === State.filters.month;
            return yearMatch && monthMatch;
        }).sort((a,b) => new Date(b.date) - new Date(a.date));
    },

    updateDashboard() {
        const data = this.getFilteredData();
        const txs = data.filter(d => d.type === 'transaction');
        
        const income = txs.filter(t => t.amount > 0 && t.category !== 'Transfer').reduce((sum, t) => sum + t.amount, 0);
        const expense = txs.filter(t => t.amount < 0 && t.category !== 'Transfer' && t.category !== "Owner's Draw").reduce((sum, t) => sum + t.amount, 0);
        const net = txs.reduce((sum, t) => sum + t.amount, 0); 
        const ar = data.filter(d => d.type === 'ar' && d.status === 'unpaid').reduce((sum, t) => sum + t.amount, 0);

        document.getElementById('dash-income').textContent = Utils.formatCurrency(income);
        document.getElementById('dash-expense').textContent = Utils.formatCurrency(Math.abs(expense));
        const netEl = document.getElementById('dash-net');
        netEl.textContent = Utils.formatCurrency(net);
        netEl.className = `text-2xl font-bold mt-1 ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
        document.getElementById('dash-ar').textContent = Utils.formatCurrency(ar);

        document.getElementById('upload-prompt').classList.toggle('hidden', txs.length > 0);
        this.updateCharts(txs);
    },

    setupCharts() {
        const ctxMain = document.getElementById('mainChart').getContext('2d');
        this.charts.main = new Chart(ctxMain, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const ctxExp = document.getElementById('expenseChart').getContext('2d');
        this.charts.expense = new Chart(ctxExp, {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    },

    updateCharts(txs) {
        // Monthly Data
        const monthlyData = {};
        txs.forEach(t => {
            const month = new Date(t.date).toLocaleString('default', { month: 'short' });
            if(!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
            if(t.amount > 0 && t.category !== 'Transfer') monthlyData[month].income += t.amount;
            if(t.amount < 0 && t.category !== 'Transfer' && t.category !== "Owner's Draw") monthlyData[month].expense += Math.abs(t.amount);
        });
        const labels = Object.keys(monthlyData).reverse();
        
        this.charts.main.data = {
            labels: labels,
            datasets: [
                { label: 'Income', data: labels.map(l => monthlyData[l].income), backgroundColor: '#10b981' },
                { label: 'Expenses', data: labels.map(l => monthlyData[l].expense), backgroundColor: '#ef4444' }
            ]
        };
        this.charts.main.update();

        // Expense Breakdown
        const expenseCats = {};
        txs.filter(t => t.amount < 0 && t.category !== 'Transfer' && t.category !== "Owner's Draw").forEach(t => {
            expenseCats[t.category] = (expenseCats[t.category] || 0) + Math.abs(t.amount);
        });
        this.charts.expense.data = {
            labels: Object.keys(expenseCats),
            datasets: [{
                data: Object.values(expenseCats),
                backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e']
            }]
        };
        this.charts.expense.update();
    },

    renderTransactions() {
        const data = this.getFilteredData().filter(d => d.type === 'transaction');
        const tbody = document.getElementById('tx-table-body');
        const search = document.getElementById('tx-search').value.toLowerCase();
        
        const filtered = data.filter(t => 
            !search || 
            t.description.toLowerCase().includes(search) || 
            t.category.toLowerCase().includes(search) ||
            t.amount.toString().includes(search)
        );

        tbody.innerHTML = filtered.map(t => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <input type="checkbox" data-id="${t.id}" class="reconcile-checkbox rounded text-brand-600 focus:ring-brand-500" ${t.reconciled ? 'checked' : ''}>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-slate-600">${new Date(t.date).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-slate-900 font-medium truncate max-w-xs" title="${t.description}">${t.description}</td>
                <td class="px-6 py-4 whitespace-nowrap font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-slate-800'}">${Utils.formatCurrency(t.amount)}</td>
                <td class="px-6 py-4 whitespace-nowrap"><span class="px-2 py-1 rounded-full text-xs font-semibold ${t.category === 'Uncategorized' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-700'}">${t.category}</span></td>
                <td class="px-6 py-4 whitespace-nowrap text-slate-500">${t.job || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    <button class="edit-btn text-brand-600 hover:text-brand-900 font-medium" data-id="${t.id}">Edit</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="px-6 py-8 text-center text-slate-500">No transactions found.</td></tr>';
        
        // Re-attach listeners for the dynamic buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => Handlers.editTransaction(e.target.dataset.id));
        });
        document.querySelectorAll('.reconcile-checkbox').forEach(box => {
            box.addEventListener('change', (e) => Handlers.toggleReconcile(e.target.dataset.id));
        });
    },

    renderJobs() {
        const data = this.getFilteredData().filter(d => d.type === 'transaction');
        const jobs = {};
        data.forEach(t => {
            if(t.job) {
                if(!jobs[t.job]) jobs[t.job] = { income: 0, expense: 0 };
                t.amount >= 0 ? jobs[t.job].income += t.amount : jobs[t.job].expense += t.amount;
            }
        });

        const html = Object.keys(jobs).length ? `<table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Job</th><th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase">Income</th><th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase">Expense</th><th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase">Net Profit</th></tr></thead><tbody class="bg-white divide-y divide-slate-200">
        ${Object.keys(jobs).map(j => {
            const net = jobs[j].income + jobs[j].expense;
            return `<tr>
                <td class="px-6 py-4 font-medium text-slate-900">${j}</td>
                <td class="px-6 py-4 text-right text-emerald-600">${Utils.formatCurrency(jobs[j].income)}</td>
                <td class="px-6 py-4 text-right text-red-600">${Utils.formatCurrency(Math.abs(jobs[j].expense))}</td>
                <td class="px-6 py-4 text-right font-bold ${net>=0?'text-emerald-700':'text-red-700'}">${Utils.formatCurrency(net)}</td>
            </tr>`
        }).join('')}</tbody></table>` : '<div class="p-8 text-center text-slate-500">No job data found. Assign jobs in the Transactions tab.</div>';
        
        document.getElementById('jobs-container').innerHTML = html;
    },

    renderAR() { this.renderSimpleTable('ar', 'ar-container', 'Customer', 'Invoices'); },
    renderAP() { this.renderSimpleTable('ap', 'ap-container', 'Vendor', 'Bills'); },

    renderSimpleTable(type, containerId, partyLabel, emptyLabel) {
        const data = this.getFilteredData().filter(d => d.type === type);
        const container = document.getElementById(containerId);
        
        if(!data.length) {
            container.innerHTML = `<div class="p-8 text-center text-slate-500">No ${emptyLabel} found.</div>`;
            return;
        }

        container.innerHTML = `<table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-50">
            <tr>
                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">${partyLabel}</th>
                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Date</th>
                <th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase">Amount</th>
                <th class="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase">Status</th>
            </tr>
        </thead><tbody class="bg-white divide-y divide-slate-200">
            ${data.map(item => `
                <tr>
                    <td class="px-6 py-4 font-medium text-slate-900">${item.party || 'Unknown'}</td>
                    <td class="px-6 py-4 text-slate-500">${new Date(item.date).toLocaleDateString()}</td>
                    <td class="px-6 py-4 text-right font-bold">${Utils.formatCurrency(item.amount)}</td>
                    <td class="px-6 py-4 text-center"><span class="px-2 py-1 rounded text-xs ${item.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">${item.status}</span></td>
                </tr>
            `).join('')}
        </tbody></table>`;
    },

    renderReports() {
        const txs = this.getFilteredData().filter(d => d.type === 'transaction');
        // Simple P&L Logic
        let income = 0, expenses = 0;
        const cats = {};
        
        txs.forEach(t => {
            if(t.category === 'Transfer') return;
            if(!cats[t.category]) cats[t.category] = 0;
            cats[t.category] += t.amount;
            if(t.amount > 0) income += t.amount;
            else if (t.category !== "Owner's Draw") expenses += t.amount;
        });

        let html = `<div class="space-y-4">
            <h3 class="font-bold text-lg">Profit & Loss Statement</h3>
            <div class="flex justify-between font-bold text-emerald-600 border-b pb-2"><span>Total Income</span><span>${Utils.formatCurrency(income)}</span></div>
            <div class="flex justify-between font-bold text-red-600 border-b pb-2"><span>Total Expenses</span><span>${Utils.formatCurrency(Math.abs(expenses))}</span></div>
            <div class="flex justify-between font-bold text-xl pt-2"><span>Net Profit</span><span>${Utils.formatCurrency(income + expenses)}</span></div>
            <h4 class="font-bold mt-6 mb-2">Category Breakdown</h4>
            <div class="space-y-2 text-sm">`;
            
        Object.keys(cats).sort().forEach(c => {
            html += `<div class="flex justify-between"><span>${c}</span><span>${Utils.formatCurrency(cats[c])}</span></div>`;
        });
        html += `</div></div>`;
        document.getElementById('report-content').innerHTML = html;
    },

    renderDateFilters() {
        const yearSelect = document.getElementById('year-filter');
        const monthSelect = document.getElementById('month-filter');
        
        const years = [...new Set(State.data.map(d => new Date(d.date).getFullYear()))].filter(y => !isNaN(y)).sort().reverse();
        yearSelect.innerHTML = '<option value="all">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        
        monthSelect.innerHTML = '<option value="all">All Months</option>' + 
            ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            .map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
    }
};
