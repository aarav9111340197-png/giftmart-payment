<?php
require_once 'config.php';

// Response content type JSON
header('Content-Type: application/json');

writeLog("Callback webhook received.", 'CALLBACK');

// Read POST payload
$data = $_POST;
if (empty($data)) {
    $raw_input = file_get_contents('php://input');
    $data = json_decode($raw_input, true) ?: [];
}

writeLog("Callback Raw Payload: " . json_encode($data), 'CALLBACK');

$merchant_id = sanitizeInput($data['merchant_id'] ?? '');
$order_id = sanitizeInput($data['order_id'] ?? '');
$amount = sanitizeInput($data['amount'] ?? '');
$status = sanitizeInput($data['status'] ?? '');
$transaction_id = sanitizeInput($data['transaction_id'] ?? '');
$signature = sanitizeInput($data['signature'] ?? '');

// 1. Verify Merchant
if ($merchant_id !== MERCHANT_ID) {
    writeLog("Callback validation error: Invalid Merchant ID ($merchant_id)", 'ERROR');
    http_response_code(400);
    echo json_encode(['error' => 'Invalid merchant']);
    exit;
}

// 2. Verify Signature
// Format: md5(amount + merchant_id + order_id + status + transaction_id + payin_key)
$raw_sig_str = $amount . $merchant_id . $order_id . $status . $transaction_id . PAYIN_KEY;
$calculated_signature = md5($raw_sig_str);

if ($calculated_signature !== $signature) {
    writeLog("Callback validation error: Signature verification failed. Calculated: $calculated_signature, Received: $signature", 'ERROR');
    http_response_code(400);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// 3. Get transaction
$transaction = getTransaction($order_id);
if (!$transaction) {
    writeLog("Callback validation error: Transaction $order_id not found in local database", 'ERROR');
    http_response_code(404);
    echo json_encode(['error' => 'Order not found']);
    exit;
}

// Idempotency check
if ($transaction['status'] !== 'PENDING') {
    writeLog("Callback warning: Transaction $order_id is already processed with status: " . $transaction['status'], 'WARNING');
    echo json_encode(['status' => 'ok', 'message' => 'Already processed']);
    exit;
}

// 4. Update status
$transaction['status'] = ($status === 'SUCCESS') ? 'SUCCESS' : 'FAILED';
$transaction['gateway_txn_id'] = $transaction_id;
$transaction['callback_payload'] = $data;
saveTransaction($order_id, $transaction);

// Send Telegram Notification
if ($transaction['status'] === 'SUCCESS') {
    $msg = "🔔 *Watchpays Payin Successful* 🔔\n\n" .
           "📦 *Order ID:* `{$order_id}`\n" .
           "💰 *Amount Paid:* ₹" . number_format($amount, 2) . "\n" .
           "👤 *Customer Name:* {$transaction['customer_name']}\n" .
           "📧 *Email:* {$transaction['customer_email']}\n" .
           "🔢 *Gateway Txn ID:* `{$transaction_id}`\n" .
           "⏰ *Time:* " . date('Y-m-d H:i:s');
    sendTelegramAlert($msg);
}

writeLog("Callback verified and database updated. Order ID: $order_id | Gateway Txn ID: $transaction_id | Status: $status", 'CALLBACK');

echo json_encode(['status' => 'ok', 'message' => 'Status updated']);
exit;
?>
