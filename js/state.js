const today = new Date();

export const State = {
    user: null,
    data: [],
    rules: [
        { keyword: 'Speedway', category: 'Vehicle Expenses (Fuel, Repairs)' },
        { keyword: 'Home Depot', category: 'COGS - Parts & Materials' },
        { keyword: 'Trane', category: 'COGS - Equipment' }
    ],
    currentView: 'dashboard',
    
    // Filters default to current month/year
    filters: { 
        year: today.getFullYear().toString(), 
        month: (today.getMonth() + 1).toString(), 
        search: '' 
    },
    
    // Hardcoded HVAC Categories so dropdowns are never empty
    categories: [
        'COGS - Equipment',
        'COGS - Parts & Materials',
        'Income (Sales/Service)',
        'Insurance',
        'Marketing & Advertising',
        'Office Supplies & Software',
        'Owner\'s Draw',
        'Payroll Expenses (Wages & Taxes)',
        'Permits & Licenses',
        'Rent/Lease',
        'Subcontractors',
        'Tools & Small Equipment',
        'Transfer',
        'Uncategorized',
        'Utilities',
        'Vehicle Expenses (Fuel, Repairs)'
    ]
};
