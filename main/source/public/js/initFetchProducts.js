import fetchProducts from './fetchProducts.js';

function initFetchProducts(event) {
    if (event) event.preventDefault(); // Prevent the default behavior if event is present

    // Retrieve filter parameters
    const selectedCategory = document.getElementById('selectedCategory').value;
    const minPrice = document.getElementById('price_form').getAttribute('data-size');
    const maxPrice = document.getElementById('price_to').getAttribute('data-size');

    // Price sorting order
    const dropdownButton = document.getElementById('dropdownMenuButton1');
    // console.log(dropdownButton.textContent);
    // dropdownButton.textContent = 'Thấp đến cao' || 'Cao đến thấp';
    const priceSortingOrder = dropdownButton.textContent.includes('Thấp đến cao') ? 'low-to-high' : 'high-to-low';
    // console.log(priceSortingOrder);

    // Retrieve search query
    const searchInput = document.querySelector('.search-input');
    const searchKeyword = searchInput ? searchInput.value : '';

    // Update currentState with both search and filter parameters
    currentState.mode = 'all-product';
    currentState.filterParams = {
        selectedCategory,
        minPrice,
        maxPrice,
        priceSortingOrder
    };
    currentState.searchQuery = searchKeyword;
    currentState.page = 1;

    // console.log(currentState);

    fetchProducts(); // This function should now consider both filter and search parameters
}

export default initFetchProducts;