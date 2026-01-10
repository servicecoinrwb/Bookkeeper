// js/ui.js
import { state } from "./state.js";
import { formatCurrency } from "./utils.js";

// --- Helpers (Internal) ---
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
    // Remove leading zero from month string if needed
    if (mSel && mSel !== 'all') {
        const mInt = parseInt(txMonth, 10);
        if(mInt.toString() !== mSel) return false;
    }
    return true;
};

// --- 1. Dashboard (Simple Math Logic) ---
export const renderDashboard = () => {
    const activeTxs = state.transactions.filter(t => fastFilterByDate(t));
    
    let income = 0;
    let expense = 0;
    let draws = 0;
    let arTotal = 0;
    let apTotal = 0;

    for (let i = 0; i < activeTxs.length; i++) {
        const t = activeTxs[i];
        const amt = t.amount;

        // Simple Math: Positive is Income, Negative is Expense.
        // We do NOT filter out Owner's Pay from expenses anymore.
        if (amt >= 0 && t.category !== 'Transfer') {
            income += amt;
        } else if (amt < 0 && t.category !== 'Transfer') {
            expense += Math.abs(amt);
        }

        // Just for the Purple Box display (doesn't affect Net/Expense totals)
        if (amt < 0 && t.category === "Owner's Draw") {
            draws += Math.abs(amt);
        }

        // AP/AR Stats
        if (t.status === 'unpaid') {
            if (t.type === 'ar') arTotal += amt;
            if (t.type === 'ap') apTotal += amt;
        }
    }

    const net = income - expense;

    // Update DOM
    const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    
    safeSet('total-income', formatCurrency(income));
    safeSet('total-expense', formatCurrency(expense));
    safeSet('total-draws', formatCurrency(draws));
    safeSet('net-total', formatCurrency(net));
    safeSet('total-ar', formatCurrency(arTotal));
    safeSet('total-ap', formatCurrency(apTotal));
    
    // Color coding for Net
    const netEl = document.getElementById('net-total')?.parentElement;
    if(netEl) {
        if(net < 0) {
            netEl.className = "bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-lg shadow-sm";
        } else {
            netEl.className = "bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 rounded-lg shadow-sm";
        }
    }
};

// --- 2. Transactions Table ---
export const renderTransactions = () => {
    const tbody = document.getElementById('transaction-table');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    
    const sorted = state.transactions
        .filter(t => (!t.type || t.type === 'transaction') && fastFilterByDate(t))
        .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Limit to 100 for speed
    const subset = sorted.slice(0, 100);
    let html = '';

    for (let i = 0; i < subset.length; i++) {
        const tx = subset[i];
        const amountClass = tx.amount >= 0 ? 'text-green-600' : 'text-red-600';
        const dateStr = tx.date.substring(0, 10); 

        html += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-2 py-3 text-center">
                    <input type="checkbox" class="h-4 w-4 text-indigo-600" data-id="${tx.id}" ${tx.reconciled ? 'checked' : ''}>
                </td>
                <td class="px-6 py-3 text-sm text-gray-500">${dateStr}</td>
                <td class="px-6 py-3 text-sm text-gray-900 truncate max-w-xs" title="${tx.description}">${tx.description}</td>
                <td class="px-6 py-3 text-sm font-medium ${amountClass}">${formatCurrency(tx.amount)}</td>
                <td class="px-6 py-3 text-sm"><span class="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">${tx.category}</span></td>
                <td class="px-6 py-3 text-sm text-gray-500">${tx.job || '-'}</td>
                <td class="px-6 py-3 text-right text-sm"><button class="edit-btn text-indigo-600 hover:text-indigo-900 font-medium" data-id="${tx.id}">Edit</button></td>
            </tr>
        `;
    }

    if (sorted.length === 0) {
        html = `<tr><td colspan="7" class="text-center py-8 text-gray-500">No transactions found.</td></tr>`;
    }

    tbody.innerHTML = html;
};

// --- 3. Job Profitability ---
export const renderJobs = () => {
    const tbody = document.getElementById('job-table');
    if(!tbody) return;
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

// --- 4. AP / AR ---
export const renderAPAR = (type) => {
    const tbody = document.getElementById(type === 'ar' ? 'ar-table' : 'ap-table');
    if(!tbody) return;
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

// --- 5. Taxes ---
export const renderTaxes = () => {
    const activeTxs = state.transactions.filter(t => fastFilterByDate(t) && (!t.type || t.type === 'transaction'));
    let net = 0;
    for(const t of activeTxs) {
        if(t.category === 'Transfer') continue;
        // Logic: Include Owner's Draw in expenses for tax estimation if user wants simple math
        net += t.amount;
    }

    const rateInput = document.getElementById('tax-rate-input');
    const rate = rateInput ? rateInput.value / 100 : 0.3;
    const estTax = net > 0 ? net * rate : 0;
    
    const profitEl = document.getElementById('tax-net-profit');
    if(profitEl) profitEl.textContent = formatCurrency(net);
    
    const dueEl = document.getElementById('tax-total-due');
    if(dueEl) dueEl.textContent = formatCurrency(estTax);
    
    [1,2,3,4].forEach(q => {
        const el = document.getElementById(`tax-q${q}`);
        if(el) el.textContent = formatCurrency(estTax/4);
    });
};

// --- 6. Reports ---
export const renderReports = (type) => {
    ['pl', 'vendors', 'ar-aging', 'ap-aging'].forEach(t => {
        const div = document.getElementById(`report-${t}-content`);
        const btn = document.getElementById(`report-tab-${t}`);
        if(div) div.classList.add('hidden');
        if(btn) btn.classList.remove('border-indigo-500', 'text-indigo-600');
    });
    
    const activeDiv = document.getElementById(`report-${type}-content`);
    const activeBtn = document.getElementById(`report-tab-${type}`);
    if(activeDiv) activeDiv.classList.remove('hidden');
    if(activeBtn) activeBtn.classList.add('border-indigo-500', 'text-indigo-600');

    if(type === 'pl') {
        const incomeMap = {}, expenseMap = {};
        let totalInc = 0, totalExp = 0;
        
        state.transactions.filter(t => fastFilterByDate(t) && (!t.type || t.type === 'transaction')).forEach(t => {
            if(t.category === 'Transfer') return;
            if(t.amount >= 0) {
                incomeMap[t.category] = (incomeMap[t.category] || 0) + t.amount;
                totalInc += t.amount;
            } else {
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
        
        if(activeDiv) activeDiv.innerHTML = html;
    }
};

// --- 7. Guide ---
export const renderGuide = () => {
    const container = document.getElementById('accordion-container');
    if(!container || container.children.length > 0) return; 
    
    const guides = [
        { t: "1. Bank Rec", c: "Compare bank statements to your transactions. Check 'Rec' box for matches." },
        { t: "2. Job Costing", c: "Edit transactions to assign a Job. Check Job Profitability tab." },
        { t: "3. AP & AR", c: "Enter unpaid bills in AP and invoices in AR. Mark paid when money moves." }
    ];
    container.innerHTML = guides.map(g => `<div class="border rounded mb-2"><div class="p-3 font-bold bg-gray-50">${g.t}</div><div class="p-3 text-sm">${g.c}</div></div>`).join('');
};

// --- 8. Exports (Fixing the errors) ---

// Populate Dropdowns
export const populateCategorySelect = (id) => {
    const s = document.getElementById(id);
    if(s) s.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
};

// Populate Manage Categories List
export const populateCategoryList = () => {
    const el = document.getElementById('category-list');
    if(el) {
        el.innerHTML = state.categories.map(c => 
            `<div class="flex justify-between p-2 border-b"><span>${c}</span><button class="text-red-500 del-cat-btn" data-cat="${c}">×</button></div>`
        ).join('');
    }
};

// Populate Rules List
export const populateRulesList = () => {
    const el = document.getElementById('rules-list');
    if(el) {
        el.innerHTML = state.rules.map((r,i) => 
            `<div class="flex justify-between p-2 border-b text-sm"><span>"${r.keyword}" → ${r.category}</span></div>`
        ).join('');
    }
};

// Populate Year/Month Filters
export const populateDateDropdowns = () => {
    if (state.transactions.length === 0) return;
    const years = new Set();
    state.transactions.forEach(t => {
        if(t.date) years.add(t.date.substring(0,4));
    });
    
    const ySel = document.getElementById('year-filter');
    if (ySel && ySel.options.length <= 1) {
        ySel.innerHTML = '<option value="all">All Years</option>' + [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
        document.getElementById('month-filter').innerHTML = '<option value="all">All Months</option>' + 
            ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    }
};
