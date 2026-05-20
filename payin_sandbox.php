<?php
require_once 'config.php';

$payload = $_SESSION['sandbox_payload'] ?? null;
if (!$payload) {
    header('Location: ../index.html');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watchpays Checkout Sandbox Simulator</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #f59e0b;
            --primary-dark: #d97706;
            --primary-light: rgba(245, 158, 11, 0.1);
            --bg-body: #0f172a;
            --bg-card: rgba(30, 41, 59, 0.7);
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
            background-image: radial-gradient(at 50% 0%, rgba(245, 158, 11, 0.12) 0px, transparent 50%);
            color: var(--text-body);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }

        .sandbox-card {
            width: 100%;
            max-width: 480px;
            background: var(--bg-card);
            border: 2px dashed var(--primary);
            border-radius: 1.5rem;
            padding: 2.5rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
            text-align: center;
            animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .badge {
            display: inline-block;
            padding: 0.35rem 1rem;
            background: var(--primary-light);
            color: var(--primary);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 2rem;
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 1.5rem;
        }

        .title {
            font-size: 1.6rem;
            font-weight: 800;
            color: var(--text-heading);
            margin-bottom: 0.5rem;
        }

        .subtitle {
            font-size: 0.9rem;
            color: var(--text-muted);
            margin-bottom: 2rem;
        }

        .details-box {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
            text-align: left;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.75rem;
            font-size: 0.95rem;
        }

        .detail-row:last-child {
            margin-bottom: 0;
            padding-top: 0.75rem;
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

        .val.amount {
            color: var(--primary);
            font-size: 1.25rem;
        }

        .btn-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .btn {
            width: 100%;
            padding: 1rem;
            border: none;
            border-radius: 0.75rem;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
        }

        .btn-success {
            background: var(--success);
            color: white;
            box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3);
        }

        .btn-success:hover {
            background: #059669;
            transform: translateY(-2px);
        }

        .btn-danger {
            background: var(--danger);
            color: white;
            box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3);
        }

        .btn-danger:hover {
            background: #dc2626;
            transform: translateY(-2px);
        }

        .btn-cancel {
            background: transparent;
            color: var(--text-muted);
            border: 1px solid var(--border);
        }

        .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-heading);
        }
    </style>
</head>
<body>

    <div class="sandbox-card">
        <span class="badge"><i class="fa-solid fa-flask"></i> Payin Sandbox</span>
        <h2 class="title">Mock Gateway Payment</h2>
        <p class="subtitle">Select transaction outcome to simulate webhook execution.</p>

        <div class="details-box">
            <div class="detail-row">
                <span class="label">Merchant ID</span>
                <span class="val"><?php echo htmlspecialchars($payload['merchant_id']); ?></span>
            </div>
            <div class="detail-row">
                <span class="label">Order ID</span>
                <span class="val"><?php echo htmlspecialchars($payload['order_id']); ?></span>
            </div>
            <div class="detail-row">
                <span class="label">Customer Name</span>
                <span class="val"><?php echo htmlspecialchars($payload['name']); ?></span>
            </div>
            <div class="detail-row">
                <span class="label">Customer Email</span>
                <span class="val"><?php echo htmlspecialchars($payload['email']); ?></span>
            </div>
            <div class="detail-row">
                <span class="label">Amount</span>
                <span class="val amount">₹<?php echo number_format($payload['amount'], 2); ?></span>
            </div>
        </div>

        <div class="btn-container">
            <form action="payin_sandbox_trigger.php" method="POST">
                <input type="hidden" name="status" value="SUCCESS">
                <button type="submit" class="btn btn-success">
                    <i class="fa-solid fa-circle-check"></i> Authorize Success Webhook
                </button>
            </form>

            <form action="payin_sandbox_trigger.php" method="POST">
                <input type="hidden" name="status" value="FAILED">
                <button type="submit" class="btn btn-danger">
                    <i class="fa-solid fa-circle-xmark"></i> Reject Payment & Fail
                </button>
            </form>

            <a href="../index.html" class="btn btn-cancel">Cancel & Go Back</a>
        </div>
    </div>

</body>
</html>
