const today = new Date();

export const State = {
    user: null,
    data: [],
    rules: [
        { keyword: 'Speedway', category: 'Vehicle Expenses' },
        { keyword: 'Home Depot', category: 'Materials' }
    ],
    currentView: 'dashboard',
    
    // CHANGE: Defaults to Current Month/Year
    filters: { 
        year: today.getFullYear().toString(), 
        month: (today.getMonth() + 1).toString(), 
        search: '' 
    },
    
    // Default Categories
    categories: [
        'Income (Sales)', 'COGS - Equipment', 'COGS - Materials', 'Subcontractors',
        'Payroll', 'Vehicle Expenses', 'Tools', 'Marketing', 'Insurance',
        'Office Supplies', 'Rent', 'Utilities', 'Owner\'s Draw', 'Transfer', 'Uncategorized'
    ]
};
