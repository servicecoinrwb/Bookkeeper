import { State } from './state.js';
import { Utils } from './utils.js';
import { Handlers } from './handlers.js';

export const UI = {
    charts: {},

    init() {
        lucide.createIcons();
        this.renderDateFilters();
        this.setupCharts();
        this.updateDashboard();
        this.populateRuleCategories();
        this.renderRulesList();
        this.renderCategoryManagementList();
        this.renderGuide();
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        if(!toast) return;
        toast.textContent = msg;
        toast.className = `fixed top-5 right-5 z-50 transform transition-all duration-300 px-4 py-3 rounded-lg shadow-lg text-white font-medium text-sm flex items-center gap-2 ${type === 'error' ? 'bg-red-600' : 'bg-slate-800'}`;
        toast.classList.remove('translate-x-full');
        setTimeout(() => toast.classList.add('translate-x-full'), 3000);
    },

    openModal(id) { const el = document.getElementById(id); if(el) el.classList.remove('hidden'); },
    closeModal(id) { const el = document.getElementById(id); if(el) el.classList.add('hidden'); },

    switchTab(tabName) {
        document.querySelectorAll('.nav-item').forEach(btn => {
            const isActive = btn.id === `nav-${tabName}`;
            btn.className = isActive 
                ? 'nav-item w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-brand-100 bg-brand-900/50 border border-brand-700'
                : 'nav-item w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors';
        });

        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${tabName}`);
        if(target) {
            target.classList.remove('hidden');
            const title = document.getElementById('page-title');
            if(title) title.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);
        
            if(tabName === 'transactions') this.renderTransactions();
            if(tabName === 'jobs') this.renderJobs();
            if(tabName === 'ar') this.renderSimpleTable('ar', 'ar-container');
            if(tabName === 'ap') this.renderSimpleTable('ap', 'ap-container');
            if(tabName === 'reports') this.renderPL();
            if(tabName === 'taxes') this.renderTaxes();
            
            State.currentView = tabName;
        }
    },

    // --- Data Filtering ---
    getFilteredData() {
        return State.data.filter(d => {
            const date = new Date(d.date);
            const yearMatch = State.filters.year === 'all' || date.getFullYear().toString() === State.filters.year;
            const monthMatch = State.filters.month === 'all' || (date.getMonth() + 1).toString() === State.filters.month;
            return yearMatch && monthMatch;
        }).sort((a,b) => new Date(b.date) - new Date(a.date));
    },

    // --- Tax Render Logic ---
    renderTaxes() {
        const selectedYear = State.filters.year;
        const txs = State.data.filter(d => {
            if (d.type !== 'transaction') return false;
            if (selectedYear !== 'all') {
                const txYear = new Date(d.date).getFullYear().toString();
                if (txYear !== selectedYear) return false;
            }
            return true;
        });

        let taxableProfit = 0;
        txs.forEach(t => { 
            const isTransfer = t.category === 'Transfer';
            const isDraw = t.amount < 0 && t.category === "Owner's Draw";
            if (!isTransfer && !isDraw) {
                taxableProfit += t.amount;
            }
        });

        const rateEl = document.getElementById('tax-rate-input');
        const rate = rateEl ? (parseFloat(rateEl.value) || 30) : 30;
        const taxDue = Math.max(0, taxableProfit * (rate / 100));
        
        const elProfit = document.getElementById('tax-profit');
        if(elProfit) elProfit.textContent = Utils.formatCurrency(taxableProfit);
        
        const elDue = document.getElementById('tax-due');
        if(elDue) elDue.textContent = Utils.formatCurrency(taxDue);
        
        ['q1','q2','q3','q4'].forEach(q => {
            const el = document.getElementById(`tax-${q}`);
            if(el) {
                if(selectedYear === 'all') el.textContent = '---';
                else el.textContent = Utils.formatCurrency(taxDue/4);
            }
        });
    },

    updateDashboard() {
        const data = this.getFilteredData();
        const txs = data.filter(d => d.type === 'transaction');
        
        const income = txs.filter(t => t.amount > 0 && t.category !== 'Transfer').reduce((sum, t) => sum + t.amount, 0);
        const expense = txs.filter(t => t.amount < 0 && t.category !== 'Transfer' && t.category !== "Owner's Draw").reduce((sum, t) => sum + t.amount, 0);
        const net = txs.reduce((sum, t) => sum + t.amount, 0); 
        const ar = data.filter(d => d.type === 'ar' && d.status === 'unpaid').reduce((sum, t) => sum + t.amount, 0);

        const elIncome = document.getElementById('dash-income');
        if(elIncome) elIncome.textContent = Utils.formatCurrency(income);
        
        const elExpense = document.getElementById('dash-expense');
        if(elExpense) elExpense.textContent = Utils.formatCurrency(Math.abs(expense));
        
        const elNet = document.getElementById('dash-net');
        if(elNet) {
            elNet.textContent = Utils.formatCurrency(net);
            elNet.className = `text-2xl font-bold mt-1 ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
        }
        
        const elAr = document.getElementById('dash-ar');
        if(elAr) elAr.textContent = Utils.formatCurrency(ar);

        const prompt = document.getElementById('upload-prompt');
        if(prompt) prompt.classList.toggle('hidden', txs.length > 0);
        
        this.updateCharts(txs);
        
        if(State.currentView === 'taxes') this.renderTaxes();
    },

    // --- Charts ---
    setupCharts() {
        const createChart = (id, type, options = {}) => {
            const el = document.getElementById(id);
            if (!el) return null;
            return new Chart(el.getContext('2d'), { type, data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, ...options } });
        };
        this.charts.main = createChart('mainChart', 'bar');
        this.charts.profit = createChart('profitChart', 'line', { plugins: { legend: { display: false }, title: { display: true, text: 'Net Profit Trend' } } });
        this.charts.income = createChart('incomeChart', 'pie', { plugins: { legend: { position: 'right' }, title: { display: true, text: 'Income Sources' } } });
        this.charts.expense = createChart('expenseChart', 'doughnut', { plugins: { legend: { position: 'right' }, title: { display: true, text: 'Expense Breakdown' } } });
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

        if (this.charts.main) {
            this.charts.main.data = {
                labels: labels,
                datasets: [ { label: 'Income', data: labels.map(l => monthlyData[l].income), backgroundColor: '#10b981' }, { label: 'Expenses', data: labels.map(l => monthlyData[l].expense), backgroundColor: '#ef4444' } ]
            };
            this.charts.main.update();
        }
        if (this.charts.profit) {
            this.charts.profit.data = {
                labels: labels,
                datasets: [{ label: 'Net Profit', data: labels.map(l => monthlyData[l].income - monthlyData[l].expense), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3, fill: false }]
            };
            this.charts.profit.update();
        }
        if (this.charts.income) {
            const incomeCats = {};
            txs.filter(t => t.amount > 0 && t.category !== 'Transfer').forEach(t => { incomeCats[t.category] = (incomeCats[t.category] || 0) + t.amount; });
            this.charts.income.data = { labels: Object.keys(incomeCats), datasets: [{ data: Object.values(incomeCats), backgroundColor: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#065f46'] }] };
            this.charts.income.update();
        }
        if (this.charts.expense) {
            const expenseCats = {};
            txs.filter(t => t.amount < 0 && t.category !== 'Transfer' && t.category !== "Owner's Draw").forEach(t => { expenseCats[t.category] = (expenseCats[t.category] || 0) + Math.abs(t.amount); });
            this.charts.expense.data = { labels: Object.keys(expenseCats), datasets: [{ data: Object.values(expenseCats), backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#f43f5e', '#a855f7'] }] };
            this.charts.expense.update();
        }
    },

    // --- Rules & Categories ---
    renderRulesList() {
        const div = document.getElementById('rules-list');
        if(div) {
            div.innerHTML = State.rules.length ? State.rules.map((r, i) => `
                <div class="flex justify-between items-center bg-slate-50 p-2 rounded text-sm mb-2 border border-slate-100">
                    <div>
                        <span class="text-slate-500 text-xs mr-2">Contains</span>
                        <span class="font-bold text-slate-700">"${r.keyword}"</span>
                        <span class="text-slate-400 mx-2">&rarr;</span>
                        <span class="bg-white border px-2 py-0.5 rounded text-xs font-medium text-brand-600">${r.category}</span>
                    </div>
                    <button class="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded" onclick="App.handlers.deleteRule(${i})"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `).join('') : '<p class="text-xs text-slate-400 text-center py-4">No rules added yet.</p>';
            lucide.createIcons();
        }
    },

    renderCategoryManagementList() {
        const div = document.getElementById('category-list-manage');
        if(div) {
            div.innerHTML = State.categories.map(c => `
                <div class="flex justify-between items-center p-2 hover:bg-slate-50 rounded group border-b border-slate-50 last:border-0">
                    <span class="text-sm text-slate-700">${c}</span>
                    ${c !== 'Uncategorized' ? `<button onclick="App.handlers.deleteCategory('${c}')" class="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="x" class="w-3 h-3"></i></button>` : ''}
                </div>
            `).join('');
            lucide.createIcons();
        }
    },

    populateRuleCategories() {
        const opts = State.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        const select = document.getElementById('rule-category');
        if(select) select.innerHTML = opts;
        const dl = document.getElementById('category-list');
        if(dl) dl.innerHTML = opts;
    },

    // --- Other Renders ---
    renderDateFilters() {
        const years = [...new Set(State.data.map(d => new Date(d.date).getFullYear()))].filter(y => !isNaN(y)).sort().reverse();
        const currentYear = new Date().getFullYear();
        if (!years.includes(currentYear)) years.unshift(currentYear);

        const yearHTML = '<option value="all">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        const monthHTML = '<option value="all">All Months</option>' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => `<option value="${i+1}">${m}</option>`).join('');

        const setFilter = (id, html, val) => {
            const el = document.getElementById(id);
            if(el) { el.innerHTML = html; el.value = val; }
        };

        setFilter('year-filter', yearHTML, State.filters.year);
        setFilter('month-filter', monthHTML, State.filters.month);
        setFilter('mobile-year-filter', yearHTML, State.filters.year);
        setFilter('mobile-month-filter', monthHTML, State.filters.month);
    },

    switchReport(type) {
        document.querySelectorAll('.rep-tab').forEach(b => {
            b.className = (b.id === `rep-tab-${type}`) 
                ? 'rep-tab text-sm font-medium px-4 py-2 text-brand-600 border-b-2 border-brand-600 bg-brand-50/50 rounded-t-lg' 
                : 'rep-tab text-sm font-medium px-4 py-2 text-slate-500 border-b-2 border-transparent hover:text-slate-700 hover:bg-slate-50 rounded-t-lg';
        });
        document.querySelectorAll('.report-view').forEach(el => el.classList.add('hidden'));
        
        const target = document.getElementById(`report-${type}`);
        if(target) {
            target.classList.remove('hidden');
            if(type === 'pl') this.renderPL();
            if(type === 'aging-ar') this.renderAging('ar', 'report-aging-ar');
            if(type === 'aging-ap') this.renderAging('ap', 'report-aging-ap');
            if(type === 'vendors') this.renderVendorReport('report-vendors');
        }
    },

    renderPL() {
        const container = document.getElementById('report-pl');
        if(!container) return;
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

        const html = `
            <div class="grid grid-cols-3 gap-4 mb-8 text-center">
                <div class="p-4 bg-emerald-50 rounded border border-emerald-100"><div class="text-emerald-600 text-xs uppercase">Income</div><div class="text-xl font-bold">${Utils.formatCurrency(income)}</div></div>
                <div class="p-4 bg-red-50 rounded border border-red-100"><div class="text-red-600 text-xs uppercase">Expenses</div><div class="text-xl font-bold">${Utils.formatCurrency(Math.abs(expenses))}</div></div>
                <div class="p-4 bg-slate-50 rounded border border-slate-200"><div class="text-slate-600 text-xs uppercase">Net</div><div class="text-xl font-bold">${Utils.formatCurrency(income + expenses)}</div></div>
            </div>
            <h4 class="font-bold mb-2 text-slate-800">Category Breakdown</h4>
            <div class="space-y-1 text-sm bg-slate-50 p-4 rounded border border-slate-100">
                ${Object.keys(cats).sort().map(c => `<div class="flex justify-between py-1 border-b border-slate-200 last:border-0"><span>${c}</span><span class="${cats[c]>=0?'text-emerald-600':'text-slate-600'} font-mono">${Utils.formatCurrency(cats[c])}</span></div>`).join('')}
            </div>
        `;
        container.innerHTML = html;
    },

    renderAging(type, containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;
        const data = this.getFilteredData().filter(d => d.type === type && d.status === 'unpaid');
        const buckets = { 'Current': [], '1-30 Days': [], '31-60 Days': [], '61-90 Days': [], '90+ Days': [] };
        const today = new Date();

        data.forEach(item => {
            const diffDays = Math.floor((today - new Date(item.date)) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) buckets['Current'].push(item);
            else if (diffDays <= 30) buckets['1-30 Days'].push(item);
            else if (diffDays <= 60) buckets['31-60 Days'].push(item);
            else if (diffDays <= 90) buckets['61-90 Days'].push(item);
            else buckets['90+ Days'].push(item);
        });

        let html = '';
        let hasData = false;
        Object.keys(buckets).forEach(bucket => {
            const items = buckets[bucket];
            if(items.length === 0) return;
            hasData = true;
            const total = items.reduce((sum, i) => sum + i.amount, 0);
            html += `<div class="border border-slate-200 rounded-lg mb-6 overflow-hidden"><div class="bg-slate-50 px-4 py-2 font-bold text-sm flex justify-between items-center text-slate-700"><span>${bucket} Overdue</span><span class="bg-white px-2 py-1 rounded border shadow-sm">${Utils.formatCurrency(total)}</span></div><table class="w-full text-sm"><tbody class="divide-y divide-slate-100">${items.map(i => `<tr><td class="p-3">${i.party}</td><td class="p-3 text-slate-500">${i.date}</td><td class="p-3 text-right font-mono">${Utils.formatCurrency(i.amount)}</td></tr>`).join('')}</tbody></table></div>`;
        });
        container.innerHTML = hasData ? html : `<div class="p-10 text-center text-slate-400 border-2 border-dashed rounded-xl">No overdue items.</div>`;
    },

    renderVendorReport(containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;
        const txs = this.getFilteredData().filter(d => d.type === 'transaction' && d.amount < 0 && d.category !== "Owner's Draw" && d.category !== "Transfer");
        const vendors = {};
        let total = 0;
        txs.forEach(t => {
            const name = t.description.replace(/[0-9#*-]/g, '').trim() || 'Unknown';
            vendors[name] = (vendors[name] || 0) + Math.abs(t.amount);
            total += Math.abs(t.amount);
        });
        const sorted = Object.keys(vendors).map(v => ({ name: v, amount: vendors[v] })).sort((a,b) => b.amount - a.amount);
        const html = `<div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm text-left"><thead class="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th class="p-3">Vendor</th><th class="p-3 text-right">Total Spent</th><th class="p-3 text-right">% of Total</th></tr></thead><tbody class="divide-y divide-slate-100 bg-white">${sorted.map(v => `<tr class="hover:bg-slate-50"><td class="p-3 font-medium text-slate-700">${v.name}</td><td class="p-3 text-right font-mono">${Utils.formatCurrency(v.amount)}</td><td class="p-3 text-right text-slate-500">${total > 0 ? ((v.amount/total)*100).toFixed(1) : 0}%</td></tr>`).join('')}</tbody></table></div>`;
        container.innerHTML = sorted.length ? html : '<div class="p-10 text-center text-slate-500">No expenses found.</div>';
    },

    renderJobs() {
        const jobs = {};
        this.getFilteredData().filter(d => d.type === 'transaction' && d.job).forEach(t => { if(!jobs[t.job]) jobs[t.job] = 0; jobs[t.job] += t.amount; });
        const container = document.getElementById('jobs-container');
        if(container) {
            container.innerHTML = Object.keys(jobs).length ? `<table class="w-full text-sm text-left"><thead class="bg-slate-50"><tr><th class="p-3">Job</th><th class="p-3 text-right">Net</th></tr></thead><tbody>${Object.keys(jobs).map(j => `<tr><td class="p-3 border-b">${j}</td><td class="p-3 border-b text-right font-bold ${jobs[j]>=0?'text-emerald-600':'text-red-600'}">${Utils.formatCurrency(jobs[j])}</td></tr>`).join('')}</tbody></table>` : '<div class="p-10 text-center text-slate-500">No job data.</div>';
        }
    },

    renderSimpleTable(type, containerId) {
        let data = this.getFilteredData().filter(d => d.type === type);
        const searchEl = document.getElementById(`${type}-search`);
        if (searchEl && searchEl.value) {
            const term = searchEl.value.toLowerCase();
            data = data.filter(d => (d.party && d.party.toLowerCase().includes(term)) || (d.number && d.number.toLowerCase().includes(term)));
        }
        const container = document.getElementById(containerId);
        if(container) {
            container.innerHTML = data.length ? `<table class="w-full text-sm text-left"><thead class="bg-slate-50"><tr><th class="p-3">Name</th><th class="p-3">Date</th><th class="p-3 text-right">Amount</th><th class="p-3 text-center">Status</th><th class="p-3 text-right">Action</th></tr></thead><tbody>${data.map(i => `<tr><td class="p-3 border-b">${i.party}</td><td class="p-3 border-b text-slate-500">${i.date}</td><td class="p-3 border-b text-right font-bold">${Utils.formatCurrency(i.amount)}</td><td class="p-3 border-b text-center"><span class="px-2 py-1 rounded text-xs ${i.status==='paid'?'bg-emerald-100 text-emerald-800':'bg-red-100 text-red-800'}">${i.status}</span></td><td class="p-3 border-b text-right"><button onclick="App.handlers.toggleApArStatus('${i.id}')" class="text-xs text-brand-600 hover:underline">Toggle Status</button></td></tr>`).join('')}</tbody></table>` : '<div class="p-10 text-center text-slate-500">No data found.</div>';
        }
    },

    renderGuide() {
        const guide = [
            { title: "1. Bank Reconciliation", content: "Compare your bank statement to the Transactions tab. Check 'Rec' on matching items. Use the Reconcile button to verify balance." },
            { title: "2. Job Costing", content: "Edit transactions to assign a 'Job Name'. View profitability in the Job Profit tab." },
            { title: "3. AR & AP", content: "Enter bills/invoices manually in the specific tabs. Mark them paid when money moves." }
        ];
        const container = document.getElementById('guide-content');
        if(container) container.innerHTML = guide.map(i => `<div class="border rounded p-4"><h4 class="font-bold mb-2">${i.title}</h4><p class="text-sm text-slate-600">${i.content}</p></div>`).join('');
    },
    
    updateReconCalc() {
        const cleared = State.data.filter(d => d.type === 'transaction' && d.reconciled).reduce((sum, t) => sum + t.amount, 0);
        const elCleared = document.getElementById('recon-cleared');
        if(elCleared) elCleared.textContent = Utils.formatCurrency(cleared);
        
        const elInput = document.getElementById('recon-input');
        const input = elInput ? (parseFloat(elInput.value) || 0) : 0;
        
        const diff = input - cleared;
        const elDiff = document.getElementById('recon-diff');
        if(elDiff) elDiff.textContent = Utils.formatCurrency(diff);
        
        const msgEl = document.getElementById('recon-msg');
        if(msgEl) {
            msgEl.className = `p-2 rounded text-center text-sm font-bold ${Math.abs(diff) < 0.01 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`;
            msgEl.textContent = Math.abs(diff) < 0.01 ? "Balanced! ✅" : "Off Balance ❌";
            msgEl.classList.remove('hidden');
        }
    }
};
