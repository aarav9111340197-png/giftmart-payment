<?php
require_once 'config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'FAILED', 'message' => 'Method not allowed.']);
    exit;
}

// Input Sanitization
$name = sanitizeInput($_POST['name'] ?? '');
$account_number = sanitizeInput($_POST['account_number'] ?? '');
$bank_name = sanitizeInput($_POST['bank_name'] ?? '');
$ifsc = sanitizeInput($_POST['ifsc'] ?? '');
$amount = sanitizeInput($_POST['amount'] ?? '');

// Server Side Validation
if (empty($name) || empty($account_number) || empty($bank_name) || empty($ifsc) || empty($amount)) {
    echo json_encode(['status' => 'FAILED', 'message' => 'All payout fields are required.']);
    exit;
}

if (!is_numeric($amount) || $amount < 100) {
    echo json_encode(['status' => 'FAILED', 'message' => 'Withdrawal amount must be at least ₹100.']);
    exit;
}

// Generate unique transaction ID starting with WD_
$transaction_id = 'WD_' . time() . rand(100, 999);

$callback_url = APP_URL . '/backend/payout_callback.php';

// Generate MD5 Payout Signature
// md5(account_number + amount + bank_name + callback_url + ifsc + merchant_id + name + transaction_id + payout_key)
$raw_sig_str = $account_number . $amount . $bank_name . $callback_url . $ifsc . MERCHANT_ID . $name . $transaction_id . PAYOUT_KEY;
$signature = md5($raw_sig_str);

// Save transaction as PENDING in local JSON database
$transactionData = [
    'type' => 'PAYOUT',
    'account_number' => $account_number,
    'amount' => $amount,
    'bank_name' => $bank_name,
    'ifsc' => $ifsc,
    'customer_name' => $name,
    'transaction_id' => $transaction_id,
    'status' => 'PENDING',
    'created_at' => date('Y-m-d H:i:s')
];
saveTransaction($transaction_id, $transactionData);

writeLog("Initiated Payout for Txn: $transaction_id | Amount: $amount", 'PAYOUT');

// Prepare payload for Watchpays
$payload = [
    'account_number' => $account_number,
    'amount' => $amount,
    'bank_name' => $bank_name,
    'callback_url' => $callback_url,
    'ifsc' => $ifsc,
    'merchant_id' => MERCHANT_ID,
    'name' => $name,
    'transaction_id' => $transaction_id,
    'signature' => $signature
];

// Send cURL to Payout API
$ch = curl_init(PAYOUT_URL);
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

logApiCall(PAYOUT_URL, $payload, $response ?: $curl_err, $response ? 'SUCCESS' : 'FAILED');

if ($response === false || $http_code !== 200) {
    // Gateway is offline/mocked, fallback to Sandbox simulator for local testing
    writeLog("Watchpays payout server offline ($curl_err). Redirecting to payout sandbox.", 'WARNING');
    $_SESSION['payout_sandbox_payload'] = $payload;
    echo json_encode([
        'status' => 'PENDING',
        'message' => 'Redirecting to Sandbox Simulator...',
        'redirect_sandbox' => 'payout_sandbox.php'
    ]);
    exit;
}

$resDecoded = json_decode($response, true);
if (isset($resDecoded['status']) && $resDecoded['status'] === 'SUCCESS') {
    echo json_encode([
        'status' => 'SUCCESS',
        'message' => 'Payout initiated successfully. Transferred to bank.'
    ]);
} else {
    // If API responded with error but works, display error message
    $err_msg = $resDecoded['message'] ?? 'Watchpays Payout API returned an error. Redirecting to Sandbox.';
    $_SESSION['payout_sandbox_payload'] = $payload;
    echo json_encode([
        'status' => 'PENDING',
        'message' => $err_msg,
        'redirect_sandbox' => 'payout_sandbox.php'
    ]);
}
exit;
?>
