<?php
require_once 'config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watchpays Payout Dashboard | GiftMart</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #6366f1;
            --primary-dark: #4f46e5;
            --primary-light: rgba(99, 102, 241, 0.1);
            --bg-body: #0b0f19;
            --bg-card: rgba(22, 28, 45, 0.6);
            --text-heading: #ffffff;
            --text-body: #94a3b8;
            --text-muted: #64748b;
            --border: rgba(148, 163, 184, 0.1);
            --success: #10b981;
            --danger: #ef4444;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background-color: var(--bg-body);
            background-image: 
                radial-gradient(at 100% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
                radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
            color: var(--text-body);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }

        .payout-container {
            width: 100%;
            max-width: 550px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 1.5rem;
            padding: 2.5rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.6s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header-section {
            text-align: center;
            margin-bottom: 2rem;
        }

        .header-section i {
            font-size: 3rem;
            color: var(--primary);
            margin-bottom: 0.5rem;
            filter: drop-shadow(0 0 10px rgba(99, 102, 241, 0.5));
        }

        .header-section h2 {
            font-size: 1.75rem;
            font-weight: 800;
            color: var(--text-heading);
            letter-spacing: -0.5px;
        }

        .header-section p {
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        .alert {
            padding: 1rem;
            border-radius: 0.75rem;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
            font-weight: 600;
            display: none;
            align-items: center;
            gap: 0.5rem;
        }

        .alert-danger {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: var(--danger);
        }

        .alert-success {
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: var(--success);
        }

        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        @media (max-width: 480px) {
            .form-grid {
                grid-template-columns: 1fr;
            }
        }

        .input-group {
            margin-bottom: 1.25rem;
            text-align: left;
        }

        .input-group.full-width {
            grid-column: span 2;
        }

        @media (max-width: 480px) {
            .input-group.full-width {
                grid-column: span 1;
            }
        }

        .input-group label {
            display: block;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-muted);
            margin-bottom: 0.5rem;
        }

        .input-wrapper {
            position: relative;
        }

        .input-wrapper i {
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            transition: color 0.3s;
        }

        .input-field {
            width: 100%;
            padding: 0.85rem 1rem 0.85rem 2.75rem;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            font-size: 1rem;
            color: var(--text-heading);
            outline: none;
            transition: all 0.3s;
        }

        .input-field:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px var(--primary-light);
            background: rgba(15, 23, 42, 0.8);
        }

        .input-field:focus + i {
            color: var(--primary);
        }

        .submit-btn {
            width: 100%;
            background: var(--primary);
            color: white;
            padding: 1rem;
            border: none;
            border-radius: 0.75rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4);
            margin-top: 1.5rem;
            grid-column: span 2;
        }

        @media (max-width: 480px) {
            .submit-btn {
                grid-column: span 1;
            }
        }

        .submit-btn:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 15px 20px -3px rgba(99, 102, 241, 0.5);
        }

        .footer-links {
            margin-top: 2rem;
            text-align: center;
            font-size: 0.85rem;
            display: flex;
            justify-content: space-between;
            width: 100%;
        }

        .footer-links a {
            color: var(--primary);
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s;
        }

        .footer-links a:hover {
            color: var(--primary-dark);
            text-decoration: underline;
        }

        /* Loading animation */
        .loading-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(11, 15, 25, 0.9);
            z-index: 9999;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            gap: 1.5rem;
            backdrop-filter: blur(5px);
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid var(--border);
            border-top: 4px solid var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .loading-text {
            color: var(--text-heading);
            font-size: 1.2rem;
            font-weight: 600;
        }
    </style>
</head>
<body>

    <div class="payout-container">
        <div class="header-section">
            <i class="fa-solid fa-money-bill-transfer"></i>
            <h2>Secure Payout</h2>
            <p>Initiate a direct merchant payout transfer instantly</p>
        </div>

        <div class="alert alert-danger" id="errorAlert"></div>
        <div class="alert alert-success" id="successAlert"></div>

        <form id="payoutForm" onsubmit="handlePayoutSubmit(event)">
            <div class="form-grid">
                <div class="input-group full-width">
                    <label for="name">Account Holder Name</label>
                    <div class="input-wrapper">
                        <input type="text" id="name" name="name" class="input-field" placeholder="e.g. Rahul Kumar" required>
                        <i class="fa-solid fa-user"></i>
                    </div>
                </div>

                <div class="input-group full-width">
                    <label for="account_number">Bank Account Number</label>
                    <div class="input-wrapper">
                        <input type="text" id="account_number" name="account_number" class="input-field" placeholder="e.g. 1234567890" pattern="[0-9]{9,18}" required>
                        <i class="fa-solid fa-file-invoice"></i>
                    </div>
                </div>

                <div class="input-group">
                    <label for="bank_name">Bank Name</label>
                    <div class="input-wrapper">
                        <input type="text" id="bank_name" name="bank_name" class="input-field" placeholder="e.g. HDFC Bank" required>
                        <i class="fa-solid fa-building-columns"></i>
                    </div>
                </div>

                <div class="input-group">
                    <label for="ifsc">IFSC Code</label>
                    <div class="input-wrapper">
                        <input type="text" id="ifsc" name="ifsc" class="input-field" placeholder="e.g. HDFC0001234" pattern="^[A-Z]{4}0[A-Z0-9]{6}$" required>
                        <i class="fa-solid fa-shield"></i>
                    </div>
                </div>

                <div class="input-group full-width">
                    <label for="amount">Withdrawal Amount (INR)</label>
                    <div class="input-wrapper">
                        <input type="number" id="amount" name="amount" class="input-field" placeholder="Minimum: ₹100" min="100" step="any" required>
                        <i class="fa-solid fa-indian-rupee-sign"></i>
                    </div>
                </div>

                <button type="submit" class="submit-btn" id="submitBtn">
                    <i class="fa-solid fa-paper-plane"></i> Request Withdrawal
                </button>
            </div>
        </form>

        <div class="footer-links">
            <a href="../index.html"><i class="fa-solid fa-arrow-left"></i> Return to Store</a>
            <a href="payout_logs.php"><i class="fa-solid fa-chart-line"></i> Payout Logs <i class="fa-solid fa-arrow-right"></i></a>
        </div>
    </div>

    <!-- Loading Indicator -->
    <div class="loading-overlay" id="loadingOverlay">
        <div class="spinner"></div>
        <div class="loading-text" id="loadingText">Processing payout transaction...</div>
    </div>

    <script>
        const errorAlert = document.getElementById('errorAlert');
        const successAlert = document.getElementById('successAlert');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const payoutForm = document.getElementById('payoutForm');

        async function handlePayoutSubmit(event) {
            event.preventDefault();
            
            errorAlert.style.display = 'none';
            successAlert.style.display = 'none';
            loadingOverlay.style.display = 'flex';

            const formData = new FormData(payoutForm);
            
            try {
                const response = await fetch('withdrawal_api.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                loadingOverlay.style.display = 'none';

                if (result.status === 'SUCCESS' || result.status === 'PENDING') {
                    successAlert.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${result.message}`;
                    successAlert.style.display = 'flex';
                    payoutForm.reset();
                    
                    if (result.redirect_sandbox) {
                        setTimeout(() => {
                            window.location.href = result.redirect_sandbox;
                        }, 1500);
                    }
                } else {
                    errorAlert.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${result.message || 'Withdrawal request failed.'}`;
                    errorAlert.style.display = 'flex';
                }
            } catch (error) {
                loadingOverlay.style.display = 'none';
                errorAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Network error occurred. Please try again.`;
                errorAlert.style.display = 'flex';
                console.error('Payout Request Error:', error);
            }
        }
    </script>
</body>
</html>
