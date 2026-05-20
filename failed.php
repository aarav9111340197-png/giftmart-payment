<?php
require_once 'config.php';

$order_id = sanitizeInput($_GET['order_id'] ?? '');
$transaction = getTransaction($order_id);

$amount = $transaction ? $transaction['amount'] : 0.00;
$name = $transaction ? $transaction['customer_name'] : 'Customer';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Failed | GiftMart</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #ef4444;
            --primary-dark: #dc2626;
            --primary-light: rgba(239, 68, 68, 0.1);
            --bg-body: #0b0f19;
            --bg-card: rgba(22, 28, 45, 0.6);
            --text-heading: #ffffff;
            --text-body: #94a3b8;
            --text-muted: #64748b;
            --border: rgba(148, 163, 184, 0.1);
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
                radial-gradient(at 50% 0%, rgba(239, 68, 68, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.05) 0px, transparent 50%);
            color: var(--text-body);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }

        .failed-card {
            width: 100%;
            max-width: 480px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 1.5rem;
            padding: 3rem 2.5rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
            text-align: center;
            animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .icon-circle {
            width: 80px;
            height: 80px;
            background: var(--primary-light);
            border: 2px solid rgba(239, 68, 68, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 2rem;
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
            animation: shake 0.5s ease-in-out;
        }

        .icon-circle i {
            font-size: 2.5rem;
            color: var(--primary);
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-8px); }
            40%, 80% { transform: translateX(8px); }
        }

        .title {
            font-size: 1.8rem;
            font-weight: 800;
            color: var(--text-heading);
            margin-bottom: 0.5rem;
        }

        .subtitle {
            font-size: 0.95rem;
            color: var(--text-body);
            margin-bottom: 2rem;
        }

        .receipt-box {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 2.5rem;
            text-align: left;
        }

        .receipt-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.85rem;
            font-size: 0.95rem;
        }

        .receipt-row:last-child {
            margin-bottom: 0;
            padding-top: 0.85rem;
            border-top: 1px solid var(--border);
        }

        .label {
            color: var(--text-muted);
            font-weight: 500;
        }

        .val {
            color: var(--text-heading);
            font-weight: 700;
        }

        .val.danger-text {
            color: var(--primary);
        }

        .btn-action-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .btn-retry {
            display: inline-flex;
            width: 100%;
            background: var(--primary);
            color: white;
            padding: 1rem;
            border-radius: 0.75rem;
            font-size: 1rem;
            font-weight: 700;
            text-decoration: none;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s;
            box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3);
        }

        .btn-retry:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 15px 20px -3px rgba(239, 68, 68, 0.4);
        }

        .btn-portal {
            display: inline-flex;
            width: 100%;
            background: transparent;
            color: var(--text-muted);
            border: 1px solid var(--border);
            padding: 1rem;
            border-radius: 0.75rem;
            font-size: 1rem;
            font-weight: 700;
            text-decoration: none;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s;
        }

        .btn-portal:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-heading);
        }
    </style>
</head>
<body>

    <div class="failed-card">
        <div class="icon-circle">
            <i class="fa-solid fa-circle-xmark"></i>
        </div>
        
        <h2 class="title">Payment Failed</h2>
        <p class="subtitle">Unfortunately, your payment could not be processed. Please try again.</p>

        <div class="receipt-box">
            <div class="receipt-row">
                <span class="label">Customer Name</span>
                <span class="val"><?php echo htmlspecialchars($name); ?></span>
            </div>
            <div class="receipt-row">
                <span class="label">Order ID</span>
                <span class="val"><?php echo htmlspecialchars($order_id); ?></span>
            </div>
            <div class="receipt-row">
                <span class="label">Status</span>
                <span class="val danger-text">DECLINED</span>
            </div>
            <div class="receipt-row">
                <span class="label">Amount</span>
                <span class="val danger-text">₹<?php echo number_format($amount, 2); ?></span>
            </div>
        </div>

        <div class="btn-action-container">
            <a href="../index.html" class="btn-retry">
                <i class="fa-solid fa-rotate-right"></i> Try Again
            </a>
            <a href="../index.html" class="btn-portal">
                <i class="fa-solid fa-house"></i> Return to Store
            </a>
        </div>
    </div>

</body>
</html>
