// UPDATE THIS URL TO MATCH YOUR DEPLOYED BACKEND
const BACKEND_URL = "https://giftmart-api.onrender.com"; 
// The backend code is running Razorpay checkout.

document.addEventListener('DOMContentLoaded', () => {
    
    const buyButtons = document.querySelectorAll('.add-to-cart');

    buyButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const cardElement = e.target.closest('.card');
            const amountInput = cardElement.querySelector('.card-amount-input');
            const itemName = e.target.getAttribute('data-name');
            const amount = amountInput ? parseInt(amountInput.value) : 2000;

            if (amount < 2000) {
                alert("Minimum purchase amount is ₹2,000");
                return;
            }

            // UI Feedback
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            button.disabled = true;

            try {
                // 1. Create Order on Backend
                const response = await fetch(`${BACKEND_URL}/api/create-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        amount: amount,
                        item_name: itemName
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Failed to create order");
                }

                // 2. Initialize Razorpay Checkout
                const options = {
                    key: "rzp_test_SqIqdftmnGJN83", // Using Test Key provided by user
                    amount: data.amount, // Amount is in currency subunits (paise)
                    currency: data.currency,
                    name: "GiftMart",
                    description: `Purchase: ${itemName} Gift Card`,
                    image: "https://example.com/your_logo.png", // Optional
                    order_id: data.order_id,
                    handler: async function (response) {
                        // 3. Verify Payment Signature
                        try {
                            const verifyRes = await fetch(`${BACKEND_URL}/api/verify-payment`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature
                                })
                            });

                            const verifyData = await verifyRes.json();

                            if (verifyData.status === 'success') {
                                alert(`Payment Successful! Payment ID: ${response.razorpay_payment_id}`);
                                window.location.href = "success.html";
                            } else {
                                alert("Payment verification failed!");
                                window.location.href = "failure.html";
                            }
                        } catch (err) {
                            console.error("Verification error:", err);
                            alert("Payment successful, but verification failed. Please contact support.");
                        }
                    },
                    prefill: {
                        name: "GiftMart Customer",
                        email: "customer@example.com",
                        contact: "9999999999"
                    },
                    theme: {
                        color: "#4f46e5"
                    }
                };

                const rzp1 = new window.Razorpay(options);
                
                rzp1.on('payment.failed', function (response){
                    alert(`Payment Failed: ${response.error.description}`);
                });

                rzp1.open();

            } catch (error) {
                console.error("Payment Error:", error);
                alert(`Error: ${error.message}. Please ensure the backend server is running.`);
            } finally {
                // Restore Button State
                button.innerHTML = originalText;
                button.disabled = false;
            }
        });
    });

    // Handle real-time value calculation
    const amountInputs = document.querySelectorAll('.card-amount-input');
    amountInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const card = e.target.closest('.card');
            const valueBadge = card.querySelector('.get-value-badge');
            let amount = parseInt(e.target.value);
            
            if (isNaN(amount) || amount < 2000) {
                valueBadge.style.color = "var(--error)";
                valueBadge.textContent = "Min ₹2,000";
            } else {
                valueBadge.style.color = "var(--success)";
                valueBadge.textContent = `₹${amount.toLocaleString('en-IN')}`;
            }
        });
    });
});
