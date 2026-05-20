<?php
require_once 'config.php';

// Set response content type to JSON
header('Content-Type: application/json');

writeLog("Payout callback webhook received.", 'PAYOUT_CALLBACK');

// Read POST data
$data = $_POST;
if (empty($data)) {
    $raw_input = file_get_contents('php://input');
    $data = json_decode($raw_input, true) ?: [];
}

writeLog("Payout Callback Raw Payload: " . json_encode($data), 'PAYOUT_CALLBACK');

// Required Parameters
$merchant_id = sanitizeInput($data['merchant_id'] ?? '');
$transaction_id = sanitizeInput($data['transaction_id'] ?? '');
$amount = sanitizeInput($data['amount'] ?? '');
$status = sanitizeInput($data['status'] ?? '');
$signature = sanitizeInput($data['signature'] ?? '');

// 1. Validate Merchant ID
if ($merchant_id !== MERCHANT_ID) {
    writeLog("Payout Callback validation error: Invalid Merchant ID ($merchant_id)", 'ERROR');
    http_response_code(400);
    echo json_encode(['error' => 'Invalid merchant']);
    exit;
}

// 2. Validate Signature
// Payout Callback Signature format: md5(amount + merchant_id + status + transaction_id + payout_key)
$raw_sig_str = $amount . $merchant_id . $status . $transaction_id . PAYOUT_KEY;
$calculated_signature = md5($raw_sig_str);

if ($calculated_signature !== $signature) {
    writeLog("Payout Callback validation error: Signature verification failed. Calculated: $calculated_signature, Received: $signature", 'ERROR');
    http_response_code(400);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// 3. Find transaction in our database
$transaction = getTransaction($transaction_id);
if (!$transaction) {
    writeLog("Payout Callback validation error: Transaction $transaction_id not found in local database", 'ERROR');
    http_response_code(404);
    echo json_encode(['error' => 'Order not found']);
    exit;
}

// Idempotency: check if transaction already processed
if ($transaction['status'] !== 'PENDING') {
    writeLog("Payout Callback warning: Transaction $transaction_id is already processed with status: " . $transaction['status'], 'WARNING');
    echo json_encode(['status' => 'ok', 'message' => 'Already processed']);
    exit;
}

// 4. Update transaction status
$transaction['status'] = ($status === 'SUCCESS') ? 'SUCCESS' : 'FAILED';
$transaction['callback_payload'] = $data;
saveTransaction($transaction_id, $transaction);

// Send Telegram Notification
$msg = "💸 *Watchpays Payout Callback* 💸\n\n" .
       "🔢 *Transaction ID:* `{$transaction_id}`\n" .
       "💰 *Payout Amount:* ₹" . number_format($amount, 2) . "\n" .
       "👤 *Beneficiary:* {$transaction['customer_name']}\n" .
       "🏦 *Bank Name:* {$transaction['bank_name']}\n" .
       "🟢 *New Status:* *{$transaction['status']}*\n" .
       "⏰ *Time:* " . date('Y-m-d H:i:s');
sendTelegramAlert($msg);

writeLog("Payout Callback verified and database updated. Txn ID: $transaction_id | Status: $status", 'PAYOUT_CALLBACK');

echo json_encode(['status' => 'ok', 'message' => 'Status updated']);
exit;
?>
