// js/ui.js
import { state } from "./state.js";
import { formatCurrency } from "./utils.js";

// --- Dashboard (Optimized: Single Loop) ---
export const renderDashboard = () => {
    // 1. Get active transactions based on date filters
    const activeTxs = state.transactions.filter(t => fastFilterByDate(t));
    
    // 2. Calculate everything in ONE pass for speed
    let income = 0;
    let expense = 0;
    let draws = 0;
    let arTotal = 0;
    let apTotal = 0;

    for (let i = 0; i < activeTxs.length; i++) {
        const t = activeTxs[i];
        const amt = t.amount;
        const absAmt = Math.abs(amt);

        // Dashboard Stats
        if (amt >= 0 && t.category !== 'Transfer') {
            income += amt;
        } else if (amt < 0 && t.category !== "Owner's Draw" && t.category !== "Transfer") {
            expense += absAmt;
        } else if (amt < 0 && t.category === "Owner's Draw") {
            draws += absAmt;
        }

        // AP/AR Stats (Only unpaid)
        if (t.status === 'unpaid') {
            if (t.type === 'ar') arTotal += amt;
            if (t.type === 'ap') apTotal += amt;
        }
    }

    // 3. Update DOM
    document.getElementById('total-income').textContent = formatCurrency(income);
    document.getElementById('total-expense').textContent = formatCurrency(expense);
    document.getElementById('total-draws').textContent = formatCurrency(draws);
    document.getElementById('net-total').textContent = formatCurrency(income - expense);
    document.getElementById('total-ar').textContent = formatCurrency(arTotal);
    document.getElementById('total-ap').textContent = formatCurrency(apTotal);
    
    // Color coding for Net
    const netEl = document.getElementById('net-total').parentElement;
    const netVal = income - expense;
    if(netVal < 0) {
        netEl.className = "bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-lg shadow-sm";
    } else {
        netEl.className = "bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 rounded-lg shadow-sm";
    }
};

// --- Transactions (Optimized: Limit to 100) ---
export const renderTransactions = () => {
    const tbody = document.getElementById('transaction-table');
    tbody.innerHTML = ''; // Clear existing
    
    // Sort and Filter
    const sorted = state.transactions
        .filter(t => (!t.type || t.type === 'transaction') && fastFilterByDate(t))
        .sort((a, b) => (a.date < b.date ? 1 : -1)); // Fast sort descending

    // SAFETY LIMIT: Only render the first 100 rows to prevent freezing
    const limit = 100;
    const subset = sorted.slice(0, limit);

    // Build one big HTML string (faster than creating elements)
    let html = '';
    for (let i = 0; i < subset.length; i++) {
        const tx = subset[i];
        const amountClass = tx.amount >= 0 ? 'text-green-600' : 'text-red-600';
        // Simple date formatting
        const dateStr = tx.date.substring(0, 10); 

        html += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-2 py-3 text-center"><input type="checkbox" class="h-4 w-4 text-indigo-600" ${tx.reconciled ? 'checked' : ''}></td>
                <td class="px-6 py-3 text-sm text-gray-500">${dateStr}</td>
                <td class="px-6 py-3 text-sm text-gray-900 truncate max-w-xs" title="${tx.description}">${tx.description}</td>
                <td class="px-6 py-3 text-sm font-medium ${amountClass}">${formatCurrency(tx.amount)}</td>
                <td class="px-6 py-3 text-sm"><span class="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">${tx.category}</span></td>
                <td class="px-6 py-3 text-sm text-gray-500">${tx.job || '-'}</td>
                <td class="px-6 py-3 text-right text-sm"><button class="edit-btn text-indigo-600 hover:text-indigo-900 font-medium" data-id="${tx.id}">Edit</button></td>
            </tr>
        `;
    }

    if (sorted.length > limit) {
        html += `<tr><td colspan="7" class="text-center py-4 text-gray-500 text-sm">Showing recent 100 of ${sorted.length} transactions. Use filters to see more.</td></tr>`;
    } else if (sorted.length === 0) {
        html += `<tr><td colspan="7" class="text-center py-8 text-gray-500">No transactions found for this period.</td></tr>`;
    }

    tbody.innerHTML = html;
};

// --- Job Profitability ---
export const renderJobs = () => {
    const tbody = document.getElementById('job-table');
    const jobs = {};
    
    state.transactions.filter(t => fastFilterByDate(t) && t.job).forEach(tx => {
        if (!jobs[tx.job]) jobs[tx.job] = { income: 0, expense: 0 };
        if (tx.amount >= 0) jobs[tx.job].income += tx.amount;
        else jobs[tx.job].expense += Math.abs(tx.amount);
    });

    let html = '';
    Object.keys(jobs).sort().forEach(job => {
        const d = jobs[job];
        const profit = d.income - d.expense;
        html += `<tr>
            <td class="px-6 py-4 text-sm font-medium">${job}</td>
            <td class="px-6 py-4 text-sm text-green-600">${formatCurrency(d.income)}</td>
            <td class="px-6 py-4 text-sm text-red-600">${formatCurrency(d.expense)}</td>
            <td class="px-6 py-4 text-sm font-bold ${profit >= 0 ? 'text-green-800' : 'text-red-800'}">${formatCurrency(profit)}</td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="4" class="text-center py-4 text-gray-500">No active jobs.</td></tr>';
};

// --- AP / AR ---
export const renderAPAR = (type) => {
    const tbody = document.getElementById(type === 'ar' ? 'ar-table' : 'ap-table');
    let html = '';
    
    state.transactions.filter(t => t.type === type && fastFilterByDate(t)).forEach(item => {
        html += `<tr>
            <td class="px-6 py-4 text-sm font-medium">${item.party}</td>
            <td class="px-6 py-4 text-sm">${item.number}</td>
            <td class="px-6 py-4 text-sm">${item.date.substring(0,10)}</td>
            <td class="px-6 py-4 text-sm font-bold">${formatCurrency(item.amount)}</td>
            <td class="px-6 py-4 text-sm"><span class="px-2 py-1 rounded text-xs ${item.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${item.status}</span></td>
            <td class="px-6 py-4 text-right text-sm"><button class="edit-apar-btn text-gray-600 hover:text-indigo-600" data-id="${item.id}">Edit</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-gray-500">No items found.</td></tr>';
};

// --- Taxes ---
export const renderTaxes = () => {
    // Only calculate tax on transactions, exclude transfers/draws
    const activeTxs = state.transactions.filter(t => fastFilterByDate(t) && (!t.type || t.type === 'transaction'));
    
    let net = 0;
    for(const t of activeTxs) {
        if(t.category === 'Transfer') continue;
        if(t.amount < 0 && t.category === "Owner's Draw") continue;
        net += t.amount;
    }

    const estTax = net > 0 ? net * (document.getElementById('tax-rate-input').value / 100) : 0;
    
    document.getElementById('tax-net-profit').textContent = formatCurrency(net);
    document.getElementById('tax-total-due').textContent = formatCurrency(estTax);
    [1,2,3,4].forEach(q => document.getElementById(`tax-q${q}`).textContent = formatCurrency(estTax/4));
};

// --- Reports ---
export const renderReports = (type) => {
    ['pl', 'vendors', 'ar-aging', 'ap-aging'].forEach(t => {
        document.getElementById(`report-${t}-content`).classList.add('hidden');
        document.getElementById(`report-tab-${t}`).classList.remove('border-indigo-500', 'text-indigo-600');
    });
    document.getElementById(`report-${type}-content`).classList.remove('hidden');
    document.getElementById(`report-tab-${type}`).classList.add('border-indigo-500', 'text-indigo-600');

    if(type === 'pl') {
        const incomeMap = {}, expenseMap = {};
        let totalInc = 0, totalExp = 0;
        
        state.transactions.filter(t => fastFilterByDate(t) && (!t.type || t.type === 'transaction')).forEach(t => {
            if(t.category === 'Transfer') return;
            if(t.amount >= 0) {
                incomeMap[t.category] = (incomeMap[t.category] || 0) + t.amount;
                totalInc += t.amount;
            } else if(t.category !== "Owner's Draw") {
                expenseMap[t.category] = (expenseMap[t.category] || 0) + Math.abs(t.amount);
                totalExp += Math.abs(t.amount);
            }
        });
        
        let html = '<div class="space-y-6"><div><h4 class="font-bold text-lg">Income</h4>';
        Object.keys(incomeMap).sort().forEach(k => html += `<div class="flex justify-between border-b py-1"><span>${k}</span><span>${formatCurrency(incomeMap[k])}</span></div>`);
        html += `<div class="flex justify-between font-bold pt-2"><span>Total</span><span>${formatCurrency(totalInc)}</span></div></div>`;
        
        html += '<div><h4 class="font-bold text-lg">Expenses</h4>';
        Object.keys(expenseMap).sort().forEach(k => html += `<div class="flex justify-between border-b py-1"><span>${k}</span><span>${formatCurrency(expenseMap[k])}</span></div>`);
        html += `<div class="flex justify-between font-bold pt-2"><span>Total</span><span>${formatCurrency(totalExp)}</span></div></div>`;
        
        html += `<div class="flex justify-between font-extrabold text-xl pt-4 border-t-2"><span>Net Profit</span><span class="${totalInc-totalExp >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(totalInc-totalExp)}</span></div></div>`;
        document.getElementById('report-pl-content').innerHTML = html;
    }
    // (Other report types omitted for brevity, logic follows same pattern)
};

// --- Guide ---
export const renderGuide = () => {
    const container = document.getElementById('accordion-container');
    if(container.children.length > 0) return; // Render once
    
    const guides = [
        { t: "1. Bank Rec", c: "Compare bank statements to your transactions. Check 'Rec' box for matches." },
        { t: "2. Job Costing", c: "Edit transactions to assign a Job. Check Job Profitability tab." },
        { t: "3. AP & AR", c: "Enter unpaid bills in AP and invoices in AR. Mark paid when money moves." }
    ];
    container.innerHTML = guides.map(g => `<div class="border rounded mb-2"><div class="p-3 font-bold bg-gray-50">${g.t}</div><div class="p-3 text-sm">${g.c}</div></div>`).join('');
};

// --- Fast Filter (Replaces new Date()) ---
const fastFilterByDate = (tx) => {
    if(!tx.date) return false;
    const ySel = document.getElementById('year-filter').value;
    const mSel = document.getElementById('month-filter').value;
    
    // Optimization: Don't parse if filters are 'all'
    if((!ySel || ySel === 'all') && (!mSel || mSel === 'all')) return true;

    // Date format is YYYY-MM-DD
    const txYear = tx.date.substring(0, 4); 
    const txMonth = tx.date.substring(5, 7); 
    
    if (ySel && ySel !== 'all' && txYear !== ySel) return false;
    // Remove leading zero from month string if needed to match filter values (1-12)
    if (mSel && mSel !== 'all') {
        const mInt = parseInt(txMonth, 10);
        if(mInt.toString() !== mSel) return false;
    }
    return true;
};

// --- Helpers ---
export const populateCategorySelect = (id) => {
    const s = document.getElementById(id);
    if(s) s.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
};

export const populateCategoryList = () => {
    document.getElementById('category-list').innerHTML = state.categories.map(c => 
        `<div class="flex justify-between p-2 border-b"><span>${c}</span><button class="text-red-500 del-cat-btn" data-cat="${c}">×</button></div>`
    ).join('');
};

export const populateRulesList = () => {
    document.getElementById('rules-list').innerHTML = state.rules.map((r,i) => 
        `<div class="flex justify-between p-2 border-b text-sm"><span>"${r.keyword}" → ${r.category}</span></div>`
    ).join('');
};

export const populateDateDropdowns = () => {
    // Only run if we actually have data
    if (state.transactions.length === 0) return;
    
    const years = new Set();
    state.transactions.forEach(t => {
        if(t.date) years.add(t.date.substring(0,4));
    });
    
    const ySel = document.getElementById('year-filter');
    if (ySel.options.length <= 1) {
        ySel.innerHTML = '<option value="all">All Years</option>' + [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
        document.getElementById('month-filter').innerHTML = '<option value="all">All Months</option>' + 
            ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    }
};
