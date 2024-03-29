let currentState = {
    mode: 'all-product',
    page: 1,
    filterParams: {
        selectedCategory: '', // Category for filtering
        minPrice: 0, // Minimum price for filtering
        maxPrice: 0, // Maximum price for filtering
        priceSortingOrder: 'low-to-high' // Price sorting order
    },
    searchQuery: '' // Search query string
};