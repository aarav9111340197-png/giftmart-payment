document.addEventListener('DOMContentLoaded', () => {
    const addToCartBtns = document.querySelectorAll('.add-to-cart');
    
    // Real-time value update and validation
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('card-amount-input')) {
            const card = e.target.closest('.card');
            const getValBadge = card.querySelector('.get-value-badge');
            const val = parseInt(e.target.value) || 0;
            
            if (val >= 2000) {
                getValBadge.innerText = '₹' + val.toLocaleString();
                getValBadge.style.color = 'var(--success)';
                e.target.style.borderColor = 'var(--border)';
            } else {
                getValBadge.innerText = 'Min ₹2,000';
                getValBadge.style.color = '#ef4444'; 
                e.target.style.borderColor = '#ef4444';
            }
        }
    });

    // --- BaseUPI Integration ---
    // Make sure this matches your exact Render.com deployed URL!
    const BACKEND_URL = 'https://giftmart-baseupi.onrender.com';

    addToCartBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.card');
            const name = card.querySelector('.card-title').innerText;
            const amountInput = card.querySelector('.card-amount-input');
            const amount = parseInt(amountInput.value) || 0;
            
            if (amount < 2000) {
                alert('Minimum order value is ₹2,000. Please enter a higher amount.');
                amountInput.focus();
                return;
            }

            // Show smooth loading state
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            btn.disabled = true;

            try {
                // Create Payment via Backend
                const response = await fetch(`${BACKEND_URL}/api/create-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, currency: 'INR', item_name: name })
                });
                
                const data = await response.json();

                if (!response.ok) {
                    // Alert the specific error returned by the backend
                    throw new Error(data.error || 'Failed to create payment intent');
                }
                
                if (data.payment_url) {
                    // Redirect to BaseUPI checkout
                    window.location.href = data.payment_url;
                } else {
                    throw new Error('Invalid payment URL received from server');
                }

            } catch (error) {
                console.error("Checkout Error:", error);
                // Differentiate between network errors and backend errors
                if (error.message.includes('Failed to fetch')) {
                    alert("Error: Payment Service is currently unreachable. Please ensure the backend server is running.");
                } else {
                    alert(`Payment Error: ${error.message}`);
                }
            } finally {
                // Reset button state
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    });
});
