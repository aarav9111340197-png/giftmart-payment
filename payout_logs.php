<?php
require_once 'config.php';

$txns = getAllTransactions();
uasort($txns, function($a, $b) {
    return strcmp($b['created_at'], $a['created_at']);
});

$logsContent = '';
if (file_exists(LOG_FILE)) {
    $fileData = file_get_contents(LOG_FILE);
    $lines = explode(PHP_EOL, trim($fileData));
    $lastLines = array_slice($lines, -50); // last 50 lines
    $logsContent = implode(PHP_EOL, $lastLines);
} else {
    $logsContent = 'No logs created yet.';
}

if (isset($_POST['clear_logs'])) {
    if (file_exists(LOG_FILE)) {
        file_put_contents(LOG_FILE, '');
        writeLog("Logs cleared by admin.", 'ADMIN');
    }
    header('Location: payout_logs.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watchpays Integration Logs Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4f46e5;
            --primary-dark: #3730a3;
            --primary-light: rgba(79, 70, 229, 0.1);
            --bg-body: #090d16;
            --bg-card: rgba(17, 24, 39, 0.7);
            --text-heading: #ffffff;
            --text-body: #94a3b8;
            --text-muted: #4b5563;
            --border: rgba(148, 163, 184, 0.08);
            --success: #10b981;
            --warning: #f59e0b;
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
                radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.08) 0px, transparent 40%),
                radial-gradient(at 100% 0%, rgba(16, 185, 129, 0.04) 0px, transparent 40%);
            color: var(--text-body);
            min-height: 100vh;
            padding: 2.5rem;
        }

        .dashboard-container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2.5rem;
            flex-wrap: wrap;
            gap: 1rem;
        }

        .dashboard-title h1 {
            font-size: 2rem;
            font-weight: 800;
            color: var(--text-heading);
            letter-spacing: -0.5px;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .dashboard-title h1 i {
            color: var(--primary);
        }

        .dashboard-title p {
            color: var(--text-muted);
            font-size: 0.95rem;
            margin-top: 0.25rem;
        }

        .header-actions {
            display: flex;
            gap: 0.75rem;
        }

        .btn {
            padding: 0.65rem 1.25rem;
            border-radius: 0.5rem;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s;
            border: none;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-dark);
        }

        .btn-outline {
            background: transparent;
            color: var(--text-body);
            border: 1px solid var(--border);
        }

        .btn-outline:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-heading);
        }

        .btn-danger {
            background: rgba(239, 68, 68, 0.1);
            color: var(--danger);
            border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .btn-danger:hover {
            background: var(--danger);
            color: white;
        }

        .grid-layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2rem;
        }

        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 1rem;
            padding: 1.75rem;
            box-shadow: 0 10px 30px -15px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
        }

        .card-title {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--text-heading);
            margin-bottom: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .table-responsive {
            width: 100%;
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 0.925rem;
        }

        th {
            padding: 0.75rem 1rem;
            border-bottom: 2px solid var(--border);
            color: var(--text-heading);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.5px;
        }

        td {
            padding: 1rem;
            border-bottom: 1px solid var(--border);
            vertical-align: middle;
        }

        tr:hover td {
            background: rgba(255, 255, 255, 0.02);
        }

        .badge-type {
            padding: 0.2rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.75rem;
            font-weight: 700;
        }

        .badge-payin {
            background: rgba(79, 70, 229, 0.15);
            color: #818cf8;
        }

        .badge-payout {
            background: rgba(99, 102, 241, 0.15);
            color: #a5b4fc;
        }

        .badge-status {
            padding: 0.25rem 0.6rem;
            border-radius: 2rem;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
        }

        .status-success {
            background: rgba(16, 185, 129, 0.12);
            color: var(--success);
        }

        .status-pending {
            background: rgba(245, 158, 11, 0.12);
            color: var(--warning);
        }

        .status-failed {
            background: rgba(239, 68, 68, 0.12);
            color: var(--danger);
        }

        .console-box {
            background: #05070c;
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 0.75rem;
            padding: 1.25rem;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.85rem;
            color: #34d399;
            overflow-y: auto;
            max-height: 350px;
            white-space: pre-wrap;
            line-height: 1.5;
            text-align: left;
        }

        .empty-state {
            text-align: center;
            padding: 3rem 1rem;
            color: var(--text-muted);
        }

        .empty-state i {
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>

    <div class="dashboard-container">
        <div class="dashboard-header">
            <div class="dashboard-title">
                <h1><i class="fa-solid fa-gears"></i> Gateway Admin Logs</h1>
                <p>Monitor all Watchpays Payin/Payout operations, transactions, and webhook API logs.</p>
            </div>
            <div class="header-actions">
                <a href="../index.html" class="btn btn-outline"><i class="fa-solid fa-arrow-left"></i> Store Home</a>
                <a href="payout.php" class="btn btn-primary"><i class="fa-solid fa-plus"></i> New Payout</a>
            </div>
        </div>

        <div class="grid-layout">
            <!-- Transactions Table -->
            <div class="card">
                <div class="card-title">
                    <span>Transaction History</span>
                    <button class="btn btn-outline" onclick="window.location.reload()"><i class="fa-solid fa-rotate"></i> Refresh</button>
                </div>

                <div class="table-responsive">
                    <?php if (empty($txns)): ?>
                        <div class="empty-state">
                            <i class="fa-solid fa-receipt"></i>
                            <p>No transactions recorded yet.</p>
                        </div>
                    <?php else: ?>
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Transaction / Order ID</th>
                                    <th>Type</th>
                                    <th>Customer / Beneficiary</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($txns as $id => $txn): ?>
                                    <tr>
                                        <td><?php echo htmlspecialchars($txn['created_at']); ?></td>
                                        <td style="font-family: monospace; font-weight: 600; color: var(--text-heading);">
                                            <?php echo htmlspecialchars($id); ?>
                                        </td>
                                        <td>
                                            <span class="badge-type <?php echo ($txn['type'] === 'PAYIN') ? 'badge-payin' : 'badge-payout'; ?>">
                                                <?php echo htmlspecialchars($txn['type']); ?>
                                            </span>
                                        </td>
                                        <td>
                                            <?php echo htmlspecialchars($txn['customer_name'] ?? 'N/A'); ?>
                                            <?php if (isset($txn['customer_email'])): ?>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">
                                                    <?php echo htmlspecialchars($txn['customer_email']); ?>
                                                </div>
                                            <?php endif; ?>
                                        </td>
                                        <td style="font-weight: 700; color: var(--text-heading);">
                                            ₹<?php echo number_format($txn['amount'], 2); ?>
                                        </td>
                                        <td>
                                            <span class="badge-status <?php 
                                                if ($txn['status'] === 'SUCCESS') echo 'status-success';
                                                elseif ($txn['status'] === 'PENDING') echo 'status-pending';
                                                else echo 'status-failed';
                                            ?>">
                                                <?php echo htmlspecialchars($txn['status']); ?>
                                            </span>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>
            </div>

            <!-- API / cURL Console Logs -->
            <div class="card">
                <div class="card-title">
                    <span>Live API cURL Console Logs (api.log)</span>
                    <form action="" method="POST" style="margin: 0;">
                        <input type="hidden" name="clear_logs" value="1">
                        <button type="submit" class="btn btn-danger" onclick="return confirm('Are you sure you want to clear all API console logs?')">
                            <i class="fa-solid fa-trash-can"></i> Clear Logs
                        </button>
                    </form>
                </div>
                <div class="console-box"><?php echo htmlspecialchars($logsContent); ?></div>
            </div>
        </div>
    </div>

</body>
</html>
