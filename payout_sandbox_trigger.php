<?php
require_once 'config.php';

$payload = $_SESSION['payout_sandbox_payload'] ?? null;
if (!$payload || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: payout.php');
    exit;
}

$status = sanitizeInput($_POST['status'] ?? 'FAILED');
$transaction_id = $payload['transaction_id'];
$amount = $payload['amount'];

// Calculate payout callback signature
// Format: md5(amount + merchant_id + status + transaction_id + payout_key)
$raw_sig_str = $amount . MERCHANT_ID . $status . $transaction_id . PAYOUT_KEY;
$callback_signature = md5($raw_sig_str);

$callback_data = [
    'merchant_id' => MERCHANT_ID,
    'transaction_id' => $transaction_id,
    'amount' => $amount,
    'status' => $status,
    'signature' => $callback_signature
];

$callback_endpoint = APP_URL . '/backend/payout_callback.php';

writeLog("SANDBOX: Firing mock payout callback webhook to $callback_endpoint with status: $status", 'SANDBOX');

$ch = curl_init($callback_endpoint);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($callback_data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt_array($ch, [
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_err = curl_error($ch);
curl_close($ch);

writeLog("SANDBOX: Payout Callback response code: $http_code | Response: $response", 'SANDBOX');

unset($_SESSION['payout_sandbox_payload']);

header('Location: payout.php?status_updated=' . $status);
exit;
