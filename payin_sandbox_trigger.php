<?php
require_once 'config.php';

$payload = $_SESSION['sandbox_payload'] ?? null;
if (!$payload || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../index.html');
    exit;
}

$status = sanitizeInput($_POST['status'] ?? 'FAILED');
$order_id = $payload['order_id'];
$amount = $payload['amount'];

$transaction_id = 'WP_TXN_' . rand(100000000, 999999999);

// Calculate callback signature (md5 of callback parameters + key)
// Standard format for callback: md5(amount + merchant_id + order_id + status + transaction_id + payin_key)
$raw_sig_str = $amount . MERCHANT_ID . $order_id . $status . $transaction_id . PAYIN_KEY;
$callback_signature = md5($raw_sig_str);

$callback_data = [
    'merchant_id' => MERCHANT_ID,
    'order_id' => $order_id,
    'amount' => $amount,
    'status' => $status,
    'transaction_id' => $transaction_id,
    'signature' => $callback_signature
];

$callback_endpoint = APP_URL . '/backend/callback.php';

writeLog("SANDBOX: Firing mock callback webhook to $callback_endpoint with status: $status", 'SANDBOX');

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

writeLog("SANDBOX: Callback endpoint response code: $http_code | Response: $response", 'SANDBOX');

unset($_SESSION['sandbox_payload']);

if ($status === 'SUCCESS') {
    header('Location: ' . $payload['return_url']);
} else {
    header('Location: ' . $payload['fail_url']);
}
exit;
