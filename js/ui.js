import { State } from './state.js';
import { Utils } from './utils.js';
import { Handlers } from './handlers.js';

export const UI = {
    charts: {},

    init() {
        lucide.createIcons();
        this.renderFilters();
        this.setupCharts();
        this.updateDashboard();
        this.populateRuleCategories();
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.toggle('bg-red-600', type === 'error');
        toast.classList.toggle('bg-slate-800', type === 'success');
        toast.classList.remove('translate-x-full');
        setTimeout(() => toast.classList.add('translate-x-full'), 3000);
    },

    openModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id).classList.add('hidden'); },

    switchTab(tabName) {
        document.querySelectorAll('.nav-item').forEach(btn => {
            const isActive = btn.id === `nav-${tabName}`;
            btn.className = isActive 
                ? 'nav-item w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-brand-100 bg-brand-900/50 border border-brand-700'
                : 'nav-item w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors';
        });

        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${tabName}`).classList.remove('hidden');
        document.getElementById('page-title').textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);

        if(tabName === 'transactions') this.renderTransactions();
        if(tabName === 'jobs') this.renderJobs();
        if(tabName === 'ar') this.renderAR();
        if(tabName === 'ap') this.renderAP();
        if(tabName === 'reports') this.renderReports();
        if(tabName === 'taxes') this.renderTaxes();
        
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
        document.getElementById('dash-net').textContent = Utils.formatCurrency(net);
        document.getElementById('dash-ar').textContent = Utils.formatCurrency(ar);
        
        const netEl = document.getElementById('dash-net');
        netEl.className = `text-2xl font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`;

        document.getElementById('upload-prompt').classList.toggle('hidden', txs.length > 0);
        this.updateCharts(txs);
    },

    setupCharts() {
        this.charts.main = new Chart(document.getElementById('mainChart').getContext('2d'), { type: 'bar', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
        // (Expense chart is optional, keeping main chart for brevity)
    },

    updateCharts(txs) {
        const monthlyData = {};
        txs.forEach(t => {
            const month = new Date(t.date).toLocaleString('default', { month: 'short' });
            if(!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
            if(t.amount > 0 && t.category !== 'Transfer') monthlyData[month].income += t.amount;
            if(t.amount < 0 && t.category !== 'Transfer') monthlyData[month].expense += Math.abs(t.amount);
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
    },

    renderTransactions() {
        const tbody = document.getElementById('tx-table-body');
        const search = document.getElementById('tx-search').value.toLowerCase();
        const data = this.getFilteredData().filter(d => d.type === 'transaction' && (!search || d.description.toLowerCase().includes(search) || d.category.toLowerCase().includes(search)));

        tbody.innerHTML = data.map(t => `
            <tr class="hover:bg-slate-50 border-b">
                <td class="px-6 py-4"><input type="checkbox" data-id="${t.id}" class="reconcile-checkbox" ${t.reconciled ? 'checked' : ''}></td>
                <td class="px-6 py-4 text-slate-500">${new Date(t.date).toLocaleDateString()}</td>
                <td class="px-6 py-4 font-medium">${t.description}</td>
                <td class="px-6 py-4 font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-slate-800'}">${Utils.formatCurrency(t.amount)}</td>
                <td class="px-6 py-4"><span class="bg-slate-100 px-2 py-1 rounded text-xs">${t.category}</span></td>
                <td class="px-6 py-4 text-right"><button class="edit-btn text-brand-600 hover:underline" data-id="${t.id}">Edit</button></td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-500">No transactions.</td></tr>';

        // Bind events
        tbody.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', e => Handlers.editTransaction(e.target.dataset.id)));
        tbody.querySelectorAll('.reconcile-checkbox').forEach(b => b.addEventListener('change', e => Handlers.toggleReconcile(e.target.dataset.id)));
    },

    renderReports() {
        const txs = this.getFilteredData().filter(d => d.type === 'transaction');
        const cats = {};
        let income = 0, expenses = 0;
        
        txs.forEach(t => {
            if(t.category === 'Transfer') return;
            if(!cats[t.category]) cats[t.category] = 0;
            cats[t.category] += t.amount;
            if(t.amount > 0) income += t.amount;
            else if(t.category !== "Owner's Draw") expenses += t.amount;
        });

        let html = `<h3 class="font-bold text-lg mb-4">Profit & Loss</h3>
        <div class="flex justify-between border-b py-2 text-emerald-600 font-bold"><span>Total Income</span><span>${Utils.formatCurrency(income)}</span></div>
        <div class="flex justify-between border-b py-2 text-red-600 font-bold"><span>Total Expenses</span><span>${Utils.formatCurrency(Math.abs(expenses))}</span></div>
        <div class="flex justify-between py-4 text-xl font-bold"><span>Net Profit</span><span>${Utils.formatCurrency(income + expenses)}</span></div>
        <h4 class="font-bold mt-4 mb-2 text-slate-600">Breakdown</h4>`;
        
        Object.keys(cats).sort().forEach(c => {
            html += `<div class="flex justify-between py-1 text-sm border-b border-slate-100"><span>${c}</span><span>${Utils.formatCurrency(cats[c])}</span></div>`;
        });
        document.getElementById('report-content').innerHTML = html;
    },

    renderTaxes() {
        const txs = State.data.filter(d => d.type === 'transaction'); // Taxes usually annual, ignore filters
        // Only count valid income/expense for taxes (exclude draws/transfers)
        let taxableProfit = 0;
        txs.forEach(t => {
            if(t.category === 'Transfer') return;
            if(t.amount < 0 && t.category === "Owner's Draw") return;
            taxableProfit += t.amount;
        });

        const rate = parseFloat(document.getElementById('tax-rate-input').value) || 30;
        const taxDue = Math.max(0, taxableProfit * (rate / 100));
        const qPayment = taxDue / 4;

        document.getElementById('tax-profit').textContent = Utils.formatCurrency(taxableProfit);
        document.getElementById('tax-due').textContent = Utils.formatCurrency(taxDue);
        ['q1','q2','q3','q4'].forEach(q => document.getElementById(`tax-${q}`).textContent = Utils.formatCurrency(qPayment));
    },

    renderJobs() {
        const jobs = {};
        this.getFilteredData().filter(d => d.type === 'transaction' && d.job).forEach(t => {
            if(!jobs[t.job]) jobs[t.job] = 0;
            jobs[t.job] += t.amount;
        });
        
        const html = Object.keys(jobs).length ? `<table class="w-full text-sm text-left"><thead class="bg-slate-50"><tr><th class="p-3">Job</th><th class="p-3 text-right">Net Profit</th></tr></thead>
        <tbody>${Object.keys(jobs).map(j => `<tr><td class="p-3 border-b">${j}</td><td class="p-3 border-b text-right font-bold ${jobs[j]>=0?'text-emerald-600':'text-red-600'}">${Utils.formatCurrency(jobs[j])}</td></tr>`).join('')}</tbody></table>` : '<div class="p-10 text-center text-slate-500">No job data.</div>';
        document.getElementById('jobs-container').innerHTML = html;
    },

    renderAR() { this.renderSimpleTable('ar', 'ar-container'); },
    renderAP() { this.renderSimpleTable('ap', 'ap-container'); },

    renderSimpleTable(type, containerId) {
        const data = this.getFilteredData().filter(d => d.type === type);
        document.getElementById(containerId).innerHTML = data.length ? `<table class="w-full text-sm text-left"><thead class="bg-slate-50"><tr><th class="p-3">Name</th><th class="p-3">Date</th><th class="p-3 text-right">Amount</th><th class="p-3 text-center">Status</th></tr></thead>
        <tbody>${data.map(i => `<tr><td class="p-3 border-b">${i.party}</td><td class="p-3 border-b text-slate-500">${i.date}</td><td class="p-3 border-b text-right font-bold">${Utils.formatCurrency(i.amount)}</td><td class="p-3 border-b text-center"><span class="px-2 py-1 rounded text-xs ${i.status==='paid'?'bg-emerald-100 text-emerald-800':'bg-red-100 text-red-800'}">${i.status}</span></td></tr>`).join('')}</tbody></table>` : '<div class="p-10 text-center text-slate-500">No data found.</div>';
    },

    populateRuleCategories() {
        const opts = State.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        document.getElementById('rule-category').innerHTML = opts;
    },

    renderRulesList() {
        const div = document.getElementById('rules-list');
        div.innerHTML = State.rules.map((r, i) => `<div class="flex justify-between items-center bg-slate-50 p-2 rounded text-sm"><span>Contains "<b>${r.keyword}</b>" &rarr; ${r.category}</span><button class="text-red-500 hover:text-red-700" onclick="App.handlers.deleteRule(${i})">×</button></div>`).join('');
    },

    updateReconCalc() {
        const cleared = State.data.filter(d => d.type === 'transaction' && d.reconciled).reduce((sum, t) => sum + t.amount, 0);
        document.getElementById('recon-cleared').textContent = Utils.formatCurrency(cleared);
        
        const input = parseFloat(document.getElementById('recon-input').value) || 0;
        const diff = input - cleared;
        const diffEl = document.getElementById('recon-diff');
        diffEl.textContent = Utils.formatCurrency(diff);
        
        const msgEl = document.getElementById('recon-msg');
        msgEl.className = `p-2 rounded text-center text-sm font-bold ${Math.abs(diff) < 0.01 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`;
        msgEl.textContent = Math.abs(diff) < 0.01 ? "Balanced! ✅" : "Off Balance ❌";
        msgEl.classList.remove('hidden');
    },

    renderDateFilters() {
        const yearSelect = document.getElementById('year-filter');
        const monthSelect = document.getElementById('month-filter');
        const years = [...new Set(State.data.map(d => new Date(d.date).getFullYear()))].filter(y => !isNaN(y)).sort().reverse();
        yearSelect.innerHTML = '<option value="all">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        monthSelect.innerHTML = '<option value="all">All Months</option>' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
    }
};
