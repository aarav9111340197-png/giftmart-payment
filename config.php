<?php
// Prevent direct access
if (count(get_included_files()) === 1) {
    http_response_code(403);
    exit("Direct access not allowed.");
}

// Start session if not started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Load Environment variables from root .env if it exists
$envPath = dirname(__DIR__) . '/.env';
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $name = trim($parts[0]);
            $value = trim($parts[1]);
            $value = trim($value, "\"'");
            putenv("$name=$value");
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
}

// Helper constants - read environment variables (support Render env vars)
define('MERCHANT_ID', getenv('WATCHPAYS_MERCHANT_ID') ?: '100555268');
define('PAYIN_KEY', getenv('WATCHPAYS_PAYIN_KEY') ?: 'fce7570887b30ff4cef9486029d61088');
define('PAYOUT_KEY', getenv('WATCHPAYS_PAYOUT_KEY') ?: '7DB1C23BB59C7065D45D253AD67D9B4B');
define('PAYIN_URL', getenv('WATCHPAYS_PAYIN_URL') ?: 'http://api.watchpays.com/payin/payment.php');
define('PAYOUT_URL', getenv('WATCHPAYS_PAYOUT_URL') ?: 'http://api.watchpays.com/payout/payment.php');

// Detect host dynamically to support absolute redirection urls anywhere
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
define('APP_URL', $protocol . '://' . $host);

define('LOG_FILE', __DIR__ . '/logs/api.log');

// Ensure log directory exists
$logDir = dirname(LOG_FILE);
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

// Logging helper
function writeLog($message, $level = 'INFO') {
    $timestamp = date('Y-m-d H:i:s');
    $logMsg = "[$timestamp] [$level] $message" . PHP_EOL;
    file_put_contents(LOG_FILE, $logMsg, FILE_APPEND);
}

// Input Sanitization
function sanitizeInput($data) {
    return htmlspecialchars(strip_tags(trim($data)), ENT_QUOTES, 'UTF-8');
}

// Transaction database simulation using transactions.json inside backend
define('TXN_FILE', __DIR__ . '/transactions.json');
function saveTransaction($txnId, $data) {
    $txns = [];
    if (file_exists(TXN_FILE)) {
        $txns = json_decode(file_get_contents(TXN_FILE), true) ?: [];
    }
    $txns[$txnId] = array_merge($data, [
        'updated_at' => date('Y-m-d H:i:s')
    ]);
    file_put_contents(TXN_FILE, json_encode($txns, JSON_PRETTY_PRINT));
}

function getTransaction($txnId) {
    if (!file_exists(TXN_FILE)) return null;
    $txns = json_decode(file_get_contents(TXN_FILE), true) ?: [];
    return isset($txns[$txnId]) ? $txns[$txnId] : null;
}

function getAllTransactions() {
    if (!file_exists(TXN_FILE)) return [];
    return json_decode(file_get_contents(TXN_FILE), true) ?: [];
}

// API interaction logger
function logApiCall($endpoint, $requestData, $responseData, $status = 'SUCCESS') {
    $reqStr = is_array($requestData) ? json_encode($requestData) : $requestData;
    $resStr = is_array($responseData) ? json_encode($responseData) : $responseData;
    
    // Mask sensitive keys
    $reqStr = preg_replace('/(key|payout_key|secret|password|account_number)="?([^"&]+)"?/i', '$1=********', $reqStr);
    $resStr = preg_replace('/(key|payout_key|secret|password|account_number)="?([^"&]+)"?/i', '$1=********', $resStr);
    
    writeLog("API CALL: $endpoint | Status: $status\nRequest: $reqStr\nResponse: $resStr\n" . str_repeat('-', 40), 'API');
}

// Telegram Bot Alert Helper
function sendTelegramAlert($message) {
    $token = getenv('TELEGRAM_BOT_TOKEN');
    $chatId = getenv('TELEGRAM_CHAT_ID');
    
    if (!$token || !$chatId) {
        writeLog("[Telegram] Config missing. Notification not sent.", 'WARNING');
        return;
    }
    
    $url = "https://api.telegram.org/bot{$token}/sendMessage";
    $payload = [
        'chat_id' => $chatId,
        'text' => $message,
        'parse_mode' => 'Markdown'
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt_array($ch, [
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    writeLog("[Telegram] Alert sent. Response: " . $res, 'INFO');
}
