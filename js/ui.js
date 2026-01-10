// js/ui.js
import { state } from "./state.js";
import { formatCurrency } from "./utils.js";

// --- Dashboard ---
export const renderDashboard = () => {
    const activeTxs = state.transactions.filter(t => filterByDate(t));
    
    const income = activeTxs.filter(t => t.amount >= 0 && t.category !== 'Transfer').reduce((sum, t) => sum + t.amount, 0);
    const expense = activeTxs.filter(t => t.amount < 0 && t.category !== "Owner's Draw" && t.category !== "Transfer").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const draws = activeTxs.filter(t => t.amount < 0 && t.category === "Owner's Draw").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // AR Totals
    const arTotal = state.transactions.filter(t => t.type === 'ar' && t.status === 'unpaid').reduce((sum, t) => sum + t.amount, 0);

    document.getElementById('total-income').textContent = formatCurrency(income);
    document.getElementById('total-expense').textContent = formatCurrency(expense);
    document.getElementById('total-draws').textContent = formatCurrency(draws);
    document.getElementById('net-total').textContent = formatCurrency(income - expense);
    document.getElementById('total-ar').textContent = formatCurrency(arTotal);
};

// --- Transactions ---
export const renderTransactions = () => {
    const tbody = document.getElementById('transaction-table');
    tbody.innerHTML = '';
    
    const sorted = state.transactions
        .filter(t => !t.type || t.type === 'transaction') // Only normal transactions
        .filter(t => filterByDate(t))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(tx => {
        const row = document.createElement('tr');
        const amountClass = tx.amount >= 0 ? 'text-green-600' : 'text-red-600';
        
        row.innerHTML = `
            <td class="px-6 py-4"><input type="checkbox" class="rec-check" data-id="${tx.id}" ${tx.reconciled ? 'checked' : ''}></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(tx.date).toLocaleDateString()}</td>
            <td class="px-6 py-4 text-sm text-gray-900 truncate max-w-xs" title="${tx.description}">${tx.description}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${amountClass}">${formatCurrency(tx.amount)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm"><span class="px-2 py-1 rounded bg-gray-100 text-xs">${tx.category}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${tx.job || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                <button class="edit-btn text-indigo-600 hover:text-indigo-900" data-id="${tx.id}">Edit</button>
            </td>
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
        const data = jobs[job];
        const profit = data.income - data.expense;
        tbody.innerHTML += `
            <tr>
                <td class="px-6 py-4 text-sm font-medium">${job}</td>
                <td class="px-6 py-4 text-sm text-green-600">${formatCurrency(data.income)}</td>
                <td class="px-6 py-4 text-sm text-red-600">${formatCurrency(data.expense)}</td>
                <td class="px-6 py-4 text-sm font-bold ${profit >= 0 ? 'text-green-800' : 'text-red-800'}">${formatCurrency(profit)}</td>
            </tr>
        `;
    });
};

// --- AP / AR ---
export const renderAPAR = (type) => {
    const tbody = document.getElementById(type === 'ar' ? 'ar-table' : 'ap-table');
    tbody.innerHTML = '';
    
    state.transactions
        .filter(t => t.type === type && filterByDate(t))
        .forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 text-sm">${item.party}</td>
                <td class="px-6 py-4 text-sm">${item.number}</td>
                <td class="px-6 py-4 text-sm">${new Date(item.date).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-sm font-bold">${formatCurrency(item.amount)}</td>
                <td class="px-6 py-4 text-sm"><span class="px-2 py-1 rounded text-xs ${item.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${item.status}</span></td>
                <td class="px-6 py-4 text-right text-sm">
                    <button class="toggle-status-btn text-blue-600 mr-2" data-id="${item.id}">${item.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}</button>
                    <button class="edit-apar-btn text-gray-600" data-id="${item.id}">Edit</button>
                </td>
            `;
            tbody.appendChild(row);
        });
};

// --- Taxes ---
export const renderTaxes = () => {
    const activeTxs = state.transactions.filter(t => filterByDate(t));
    const income = activeTxs.filter(t => t.amount >= 0 && t.category !== 'Transfer').reduce((sum, t) => sum + t.amount, 0);
    const expense = activeTxs.filter(t => t.amount < 0 && t.category !== "Owner's Draw" && t.category !== "Transfer").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const net = income - expense;
    const estTax = net > 0 ? net * 0.25 : 0;

    document.getElementById('tax-net-profit').textContent = formatCurrency(net);
    document.getElementById('tax-total-due').textContent = formatCurrency(estTax);
};

// --- Helper: Date Filtering ---
const filterByDate = (tx) => {
    const yearSelect = document.getElementById('year-filter').value;
    const monthSelect = document.getElementById('month-filter').value;
    if (!tx.date) return false;
    const d = new Date(tx.date);
    if (yearSelect && yearSelect !== 'all' && d.getFullYear().toString() !== yearSelect) return false;
    if (monthSelect && monthSelect !== 'all' && (d.getMonth() + 1).toString() !== monthSelect) return false;
    return true;
};

// --- Helper: Dropdowns ---
export const populateCategorySelect = (selectId) => {
    const select = document.getElementById(selectId);
    if(select) select.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
};

export const populateCategoryList = () => {
    const div = document.getElementById('category-list');
    div.innerHTML = state.categories.map(c => `
        <div class="flex justify-between items-center p-2 hover:bg-gray-50 border-b">
            <span>${c}</span>
            ${c !== 'Uncategorized' ? `<button class="del-cat-btn text-red-500" data-cat="${c}">x</button>` : ''}
        </div>
    `).join('');
};

export const populateDateDropdowns = () => {
    const years = [...new Set(state.transactions.map(t => new Date(t.date).getFullYear()))].sort().reverse();
    const ySel = document.getElementById('year-filter');
    if (ySel.options.length <= 1) { // Only populate if empty
        ySel.innerHTML = '<option value="all">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        const mSel = document.getElementById('month-filter');
        mSel.innerHTML = '<option value="all">All Months</option>' + 
            ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            .map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    }
};
