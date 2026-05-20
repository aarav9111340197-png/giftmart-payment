<?php
require_once 'config.php';

// Check if parameters passed from frontend redirection
$pre_amount = sanitizeInput($_GET['amount'] ?? '');
$pre_item = sanitizeInput($_GET['item'] ?? '');
$pre_email = sanitizeInput($_GET['email'] ?? '');

$error_msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $amount = sanitizeInput($_POST['amount'] ?? '');
    $email = sanitizeInput($_POST['email'] ?? '');
    $name = sanitizeInput($_POST['name'] ?? '');
    $phone = sanitizeInput($_POST['phone'] ?? '');
    $item_name = sanitizeInput($_POST['item_name'] ?? 'Gift Card');

    if (empty($amount) || empty($email) || empty($name) || empty($phone)) {
        $error_msg = 'All payment fields are required.';
    } elseif (!is_numeric($amount) || $amount < 2000) {
        $error_msg = 'Minimum purchase amount is ₹2,000.';
    } else {
        // Generate unique order ID
        $order_id = 'ORD_' . time() . rand(100, 999);
        
        $callback_url = APP_URL . '/backend/callback.php';
        $return_url = APP_URL . '/backend/success.php?order_id=' . $order_id;
        $fail_url = APP_URL . '/backend/failed.php?order_id=' . $order_id;

        // MD5 Signature calculation
        // md5(amount + callback_url + merchant_id + order_id + payin_key)
        $raw_sig_str = $amount . $callback_url . MERCHANT_ID . $order_id . PAYIN_KEY;
        $signature = md5($raw_sig_str);

        // Save transaction to local JSON database as PENDING
        $txnData = [
            'type' => 'PAYIN',
            'amount' => $amount,
            'customer_name' => $name,
            'customer_email' => $email,
            'customer_phone' => $phone,
            'item_name' => $item_name,
            'status' => 'PENDING',
            'gateway_txn_id' => '',
            'created_at' => date('Y-m-d H:i:s')
        ];
        saveTransaction($order_id, $txnData);

        writeLog("Initiated Payin Order: $order_id | Amount: $amount", 'PAYIN');

        // Payload for Watchpays Payin API
        $payload = [
            'merchant_id' => MERCHANT_ID,
            'order_id' => $order_id,
            'amount' => $amount,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'callback_url' => $callback_url,
            'return_url' => $return_url,
            'fail_url' => $fail_url,
            'signature' => $signature
        ];

        // Call Watchpays API
        $ch = curl_init(PAYIN_URL);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt_array($ch, [
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => false
        ]);

        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_err = curl_error($ch);
        curl_close($ch);

        logApiCall(PAYIN_URL, $payload, $response ?: $curl_err, $response ? 'SUCCESS' : 'FAILED');

        if ($response === false || $http_code !== 200) {
            // Server offline / curl failed, fallback to local sandbox simulator
            writeLog("Watchpays Payin server offline ($curl_err). Redirecting to sandbox.", 'WARNING');
            $_SESSION['sandbox_payload'] = $payload;
            header('Location: payin_sandbox.php');
            exit;
        }

        $resDecoded = json_decode($response, true);
        if (isset($resDecoded['payment_url']) && !empty($resDecoded['payment_url'])) {
            // Redirect to Watchpays payment checkout screen
            header('Location: ' . $resDecoded['payment_url']);
            exit;
        } else {
            // Invalid API response / bad key signature
            $err_msg = $resDecoded['message'] ?? 'Watchpays API error occurred. Redirecting to Sandbox.';
            writeLog("Watchpays Payin API error: $err_msg", 'ERROR');
            $_SESSION['sandbox_payload'] = $payload;
            header('Location: payin_sandbox.php');
            exit;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secure Checkout | GiftMart</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4f46e5;
            --primary-dark: #3730a3;
            --primary-light: rgba(79, 70, 229, 0.1);
            --bg-body: #0b0f19;
            --bg-card: rgba(22, 28, 45, 0.6);
            --text-heading: #ffffff;
            --text-body: #94a3b8;
            --text-muted: #64748b;
            --border: rgba(148, 163, 184, 0.1);
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
                radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
            color: var(--text-body);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }

        .checkout-container {
            width: 100%;
            max-width: 480px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 1.5rem;
            padding: 2.5rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
            text-align: center;
            animation: fadeIn 0.6s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header-section {
            margin-bottom: 2rem;
        }

        .header-section i {
            font-size: 2.5rem;
            color: var(--primary);
            margin-bottom: 0.5rem;
        }

        .header-section h2 {
            font-size: 1.6rem;
            font-weight: 800;
            color: var(--text-heading);
        }

        .header-section p {
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        .error-alert {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: var(--danger);
            padding: 0.85rem;
            border-radius: 0.75rem;
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
            font-weight: 600;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .input-group {
            margin-bottom: 1.25rem;
            text-align: left;
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

        .pay-summary {
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            padding: 1rem;
            margin-bottom: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .pay-summary-label {
            font-weight: 600;
            color: var(--text-body);
        }

        .pay-summary-val {
            font-size: 1.2rem;
            font-weight: 800;
            color: var(--text-heading);
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
            box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4);
        }

        .submit-btn:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 15px 20px -3px rgba(79, 70, 229, 0.5);
        }

        .back-link {
            display: inline-block;
            margin-top: 1.5rem;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 600;
            transition: color 0.2s;
        }

        .back-link:hover {
            color: var(--text-heading);
        }
    </style>
</head>
<body>

    <div class="checkout-container">
        <div class="header-section">
            <i class="fa-solid fa-shield-halved"></i>
            <h2>Secure Checkout</h2>
            <p>Complete your purchase securely via Watchpays</p>
        </div>

        <?php if (!empty($error_msg)): ?>
            <div class="error-alert">
                <i class="fa-solid fa-triangle-exclamation"></i> <?php echo $error_msg; ?>
            </div>
        <?php endif; ?>

        <form action="payment.php" method="POST" onsubmit="document.getElementById('submit-btn').innerHTML = '<i class=\'fa-solid fa-spinner fa-spin\'></i> Connecting Gateway...';">
            <input type="hidden" name="item_name" value="<?php echo htmlspecialchars($pre_item ?: 'Gift Card'); ?>">
            
            <div class="input-group">
                <label for="name">Billing Name</label>
                <div class="input-wrapper">
                    <input type="text" id="name" name="name" class="input-field" placeholder="e.g. Rahul Kumar" required>
                    <i class="fa-solid fa-user"></i>
                </div>
            </div>

            <div class="input-group">
                <label for="email">Email Address</label>
                <div class="input-wrapper">
                    <input type="email" id="email" name="email" class="input-field" placeholder="e.g. rahul@gmail.com" value="<?php echo htmlspecialchars($pre_email); ?>" required>
                    <i class="fa-solid fa-envelope"></i>
                </div>
            </div>

            <div class="input-group">
                <label for="phone">Phone Number</label>
                <div class="input-wrapper">
                    <input type="tel" id="phone" name="phone" class="input-field" placeholder="e.g. 9876543210" pattern="[0-9]{10}" required>
                    <i class="fa-solid fa-phone"></i>
                </div>
            </div>

            <div class="input-group">
                <label for="amount">Order Amount (INR)</label>
                <div class="input-wrapper">
                    <input type="number" id="amount" name="amount" class="input-field" value="<?php echo htmlspecialchars($pre_amount ?: '2000'); ?>" min="2000" required>
                    <i class="fa-solid fa-indian-rupee-sign"></i>
                </div>
            </div>

            <div class="pay-summary">
                <span class="pay-summary-label">Total to Pay</span>
                <span class="pay-summary-val" id="summary-val">₹<?php echo number_format($pre_amount ?: 2000, 2); ?></span>
            </div>

            <button type="submit" class="submit-btn" id="submit-btn">
                <i class="fa-solid fa-credit-card"></i> Pay Securely Now
            </button>
        </form>

        <a href="../index.html" class="back-link"><i class="fa-solid fa-arrow-left"></i> Return to Store</a>
    </div>

    <script>
        const amountInput = document.getElementById('amount');
        const summaryVal = document.getElementById('summary-val');
        
        amountInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
                summaryVal.textContent = '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                summaryVal.textContent = '₹0.00';
            }
        });
    </script>
</body>
</html>
