// js/ui.js
import { state } from "./state.js";
import { formatCurrency } from "./utils.js";

// --- Dashboard ---
export const renderDashboard = () => {
    const activeTxs = state.transactions.filter(t => filterByDate(t));
    
    const income = activeTxs.filter(t => t.amount >= 0 && t.category !== 'Transfer').reduce((sum, t) => sum + t.amount, 0);
    const expense = activeTxs.filter(t => t.amount < 0 && t.category !== "Owner's Draw" && t.category !== "Transfer").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const draws = activeTxs.filter(t => t.amount < 0 && t.category === "Owner's Draw").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const arTotal = state.transactions.filter(t => t.type === 'ar' && t.status === 'unpaid').reduce((sum, t) => sum + t.amount, 0);
    const apTotal = state.transactions.filter(t => t.type === 'ap' && t.status === 'unpaid').reduce((sum, t) => sum + t.amount, 0);

    document.getElementById('total-income').textContent = formatCurrency(income);
    document.getElementById('total-expense').textContent = formatCurrency(expense);
    document.getElementById('total-draws').textContent = formatCurrency(draws);
    document.getElementById('net-total').textContent = formatCurrency(income - expense);
    document.getElementById('total-ar').textContent = formatCurrency(arTotal);
    document.getElementById('total-ap').textContent = formatCurrency(apTotal);
};

// --- Transactions ---
export const renderTransactions = () => {
    const tbody = document.getElementById('transaction-table');
    tbody.innerHTML = '';
    const sorted = state.transactions.filter(t => t.type === 'transaction' && filterByDate(t))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(tx => {
        const row = document.createElement('tr');
        const amountClass = tx.amount >= 0 ? 'text-green-600' : 'text-red-600';
        row.innerHTML = `
            <td class="px-2 py-4 text-center"><input type="checkbox" ${tx.reconciled ? 'checked' : ''}></td>
            <td class="px-6 py-4 text-sm text-gray-500">${new Date(tx.date).toLocaleDateString()}</td>
            <td class="px-6 py-4 text-sm text-gray-900 truncate max-w-xs">${tx.description}</td>
            <td class="px-6 py-4 text-sm font-medium ${amountClass}">${formatCurrency(tx.amount)}</td>
            <td class="px-6 py-4 text-sm"><span class="px-2 py-1 rounded bg-gray-100 text-xs">${tx.category}</span></td>
            <td class="px-6 py-4 text-sm text-gray-500">${tx.job || ''}</td>
            <td class="px-6 py-4 text-right text-sm"><button class="edit-btn text-indigo-600 hover:text-indigo-900" data-id="${tx.id}">Edit</button></td>
        `;
        tbody.appendChild(row);
    });
};

// --- Job Profitability ---
export const renderJobs = () => {
    const tbody = document.getElementById('job-table');
    tbody.innerHTML = '';
    const jobs = {};
    state.transactions.filter(t => filterByDate(t) && t.job).forEach(tx => {
        if (!jobs[tx.job]) jobs[tx.job] = { income: 0, expense: 0 };
        if (tx.amount >= 0) jobs[tx.job].income += tx.amount;
        else jobs[tx.job].expense += Math.abs(tx.amount);
    });
    Object.keys(jobs).sort().forEach(job => {
        const d = jobs[job];
        const profit = d.income - d.expense;
        tbody.innerHTML += `<tr>
            <td class="px-6 py-4 text-sm font-medium">${job}</td>
            <td class="px-6 py-4 text-sm text-green-600">${formatCurrency(d.income)}</td>
            <td class="px-6 py-4 text-sm text-red-600">${formatCurrency(d.expense)}</td>
            <td class="px-6 py-4 text-sm font-bold ${profit >= 0 ? 'text-green-800' : 'text-red-800'}">${formatCurrency(profit)}</td>
        </tr>`;
    });
};

// --- AP / AR ---
export const renderAPAR = (type) => {
    const tbody = document.getElementById(type === 'ar' ? 'ar-table' : 'ap-table');
    tbody.innerHTML = '';
    state.transactions.filter(t => t.type === type && filterByDate(t)).forEach(item => {
        tbody.innerHTML += `<tr>
            <td class="px-6 py-4 text-sm font-medium">${item.party}</td>
            <td class="px-6 py-4 text-sm">${item.number}</td>
            <td class="px-6 py-4 text-sm">${new Date(item.date).toLocaleDateString()}</td>
            <td class="px-6 py-4 text-sm font-bold">${formatCurrency(item.amount)}</td>
            <td class="px-6 py-4 text-sm"><span class="px-2 py-1 rounded text-xs ${item.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${item.status}</span></td>
            <td class="px-6 py-4 text-right text-sm"><button class="edit-apar-btn text-gray-600" data-id="${item.id}">Edit</button></td>
        </tr>`;
    });
};

// --- Taxes ---
export const renderTaxes = () => {
    const activeTxs = state.transactions.filter(t => filterByDate(t));
    const income = activeTxs.filter(t => t.amount >= 0 && t.category !== 'Transfer').reduce((sum, t) => sum + t.amount, 0);
    const expense = activeTxs.filter(t => t.amount < 0 && t.category !== "Owner's Draw" && t.category !== "Transfer").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const net = income - expense;
    const estTax = net > 0 ? net * (document.getElementById('tax-rate-input').value / 100) : 0;
    
    document.getElementById('tax-net-profit').textContent = formatCurrency(net);
    document.getElementById('tax-total-due').textContent = formatCurrency(estTax);
    
    // Quarters
    [1,2,3,4].forEach(q => document.getElementById(`tax-q${q}`).textContent = formatCurrency(estTax/4));
};

// --- Reports ---
export const renderReports = (type) => {
    // Hide all
    ['pl', 'vendors', 'ar-aging', 'ap-aging'].forEach(t => {
        document.getElementById(`report-${t}-content`).classList.add('hidden');
        document.getElementById(`report-tab-${t}`).classList.remove('border-indigo-500', 'text-indigo-600');
    });
    // Show active
    document.getElementById(`report-${type}-content`).classList.remove('hidden');
    document.getElementById(`report-tab-${type}`).classList.add('border-indigo-500', 'text-indigo-600');

    if(type === 'pl') {
        const incomeMap = {}, expenseMap = {};
        let totalInc = 0, totalExp = 0;
        state.transactions.filter(t => filterByDate(t) && t.type === 'transaction').forEach(t => {
            if(t.category === 'Transfer') return;
            if(t.amount >= 0) {
                incomeMap[t.category] = (incomeMap[t.category] || 0) + t.amount;
                totalInc += t.amount;
            } else if(t.category !== "Owner's Draw") {
                expenseMap[t.category] = (expenseMap[t.category] || 0) + Math.abs(t.amount);
                totalExp += Math.abs(t.amount);
            }
        });
        
        let html = '<div class="space-y-6"><div><h4 class="font-bold">Income</h4>';
        Object.keys(incomeMap).forEach(k => html += `<div class="flex justify-between border-b py-1"><span>${k}</span><span>${formatCurrency(incomeMap[k])}</span></div>`);
        html += `<div class="flex justify-between font-bold pt-2"><span>Total</span><span>${formatCurrency(totalInc)}</span></div></div>`;
        
        html += '<div><h4 class="font-bold">Expenses</h4>';
        Object.keys(expenseMap).forEach(k => html += `<div class="flex justify-between border-b py-1"><span>${k}</span><span>${formatCurrency(expenseMap[k])}</span></div>`);
        html += `<div class="flex justify-between font-bold pt-2"><span>Total</span><span>${formatCurrency(totalExp)}</span></div></div>`;
        
        html += `<div class="flex justify-between font-extrabold text-xl pt-4 border-t-2"><span>Net Profit</span><span class="${totalInc-totalExp >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(totalInc-totalExp)}</span></div></div>`;
        
        document.getElementById('report-pl-content').innerHTML = html;
    }
};

// --- Guide ---
export const renderGuide = () => {
    const guideContent = [
        { title: "1. Bank Reconciliation", content: "Compare bank statements to your transactions record. Check the 'Rec' box for matches." },
        { title: "2. Job Costing", content: "Edit transactions to assign a Job name. Check Job Profitability tab to see Net Profit per job." },
        { title: "3. AP & AR", content: "Enter unpaid bills in AP and invoices in AR. Mark them paid when money moves." }
    ];
    document.getElementById('accordion-container').innerHTML = guideContent.map(item => `
        <div class="border rounded-lg">
            <button class="w-full text-left p-4 bg-gray-50 font-medium">${item.title}</button>
            <div class="p-4 border-t text-sm text-gray-600">${item.content}</div>
        </div>
    `).join('');
};

// --- Helpers ---
const filterByDate = (tx) => {
    const y = document.getElementById('year-filter').value;
    const m = document.getElementById('month-filter').value;
    if(!tx.date) return false;
    const d = new Date(tx.date);
    if(y && y !== 'all' && d.getFullYear().toString() !== y) return false;
    if(m && m !== 'all' && (d.getMonth()+1).toString() !== m) return false;
    return true;
};

export const populateCategorySelect = (id) => {
    const s = document.getElementById(id);
    if(s) s.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
};

export const populateCategoryList = () => {
    document.getElementById('category-list').innerHTML = state.categories.map(c => 
        `<div class="flex justify-between p-2 border-b"><span>${c}</span></div>`
    ).join('');
};

export const populateRulesList = () => {
    document.getElementById('rules-list').innerHTML = state.rules.map(r => 
        `<div class="flex justify-between p-2 border-b text-sm"><span>"${r.keyword}" -> ${r.category}</span></div>`
    ).join('');
};

export const populateDateDropdowns = () => {
    const years = [...new Set(state.transactions.map(t => new Date(t.date).getFullYear()))].sort().reverse();
    const ySel = document.getElementById('year-filter');
    if (ySel.options.length <= 1 && years.length > 0) {
        ySel.innerHTML = '<option value="all">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        document.getElementById('month-filter').innerHTML = '<option value="all">All Months</option>' + 
            ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    }
};
