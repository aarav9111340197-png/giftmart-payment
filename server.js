require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

// Manual CORS middleware fallback to ensure headers are sent for preflight and options
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Parse urlencoded (form data) and JSON payloads
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Setup session support in-memory (to store sandbox states)
const mockSessions = {};
function getSession(req) {
    const ip = req.ip || 'default';
    if (!mockSessions[ip]) {
        mockSessions[ip] = {};
    }
    return mockSessions[ip];
}

// Credentials (support Render env vars)
const MERCHANT_ID = process.env.WATCHPAYS_MERCHANT_ID || '100555268';
const PAYIN_KEY = process.env.WATCHPAYS_PAYIN_KEY || 'fce7570887b30ff4cef9486029d61088';
const PAYOUT_KEY = process.env.WATCHPAYS_PAYOUT_KEY || '7DB1C23BB59C7065D45D253AD67D9B4B';
const PAYIN_URL = 'https://api.watchpays.com/v1/create';
const PAYOUT_URL = 'https://api.watchpays.com/payout/payment.php';

// Files
const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
const LOG_FILE = path.join(__dirname, 'api.log');

// MD5 Helper
function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

// Logging Helper
function writeLog(message, level = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logMsg = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logMsg, 'utf8');
}

// API Logger
function logApiCall(endpoint, requestData, responseData, status = 'SUCCESS') {
    let reqStr = typeof requestData === 'object' ? JSON.stringify(requestData) : String(requestData);
    let resStr = typeof responseData === 'object' ? JSON.stringify(responseData) : String(responseData);
    
    // Mask sensitive keys
    reqStr = reqStr.replace(/(key|payout_key|secret|password|account_number)="?([^"&]+)"?/ig, '$1=********');
    resStr = resStr.replace(/(key|payout_key|secret|password|account_number)="?([^"&]+)"?/ig, '$1=********');
    
    writeLog(`API CALL: ${endpoint} | Status: ${status}\nRequest: ${reqStr}\nResponse: ${resStr}\n${'-'.repeat(40)}`, 'API');
}

// DB Helpers
function getAllTransactions() {
    if (!fs.existsSync(TRANSACTIONS_FILE)) return {};
    try {
        const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
        return JSON.parse(data) || {};
    } catch (e) {
        return {};
    }
}

function saveTransaction(txnId, data) {
    const txns = getAllTransactions();
    txns[txnId] = {
        ...txns[txnId],
        ...data,
        updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(txns, null, 2), 'utf8');
}

function getTransaction(txnId) {
    const txns = getAllTransactions();
    return txns[txnId] || null;
}

// Telegram Bot Alert Helper
async function sendTelegramAlert(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        writeLog("[Telegram] Config missing. Notification not sent.", 'WARNING');
        return;
    }
    
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        writeLog("[Telegram] Alert sent successfully!", 'INFO');
    } catch (err) {
        writeLog(`[Telegram] Failed: ${err.message}`, 'ERROR');
    }
}

// Helper to get APP URL dynamically
function getAppUrl(req) {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${protocol}://${req.get('host')}`;
}

// ----------------------------------------------------
// API ENDPOINTS FOR FRONTEND INTEGRATION
// ----------------------------------------------------

// POST: /create-payment -> Receives payment info and returns payment_url
app.post('/create-payment', async (req, res) => {
    const { amount, orderId, customerName, customerEmail, customerPhone } = req.body;
    
    if (!amount || !orderId || !customerName || !customerEmail || !customerPhone) {
        return res.status(400).json({ error: "Missing required parameters" });
    }
    
    const appUrl = getAppUrl(req);
    const callback_url = `${appUrl}/callback.php`;
    const return_url = `${appUrl}/success.php?order_id=${orderId}`;
    const fail_url = `${appUrl}/failed.php?order_id=${orderId}`;
    const merchant_order_no = orderId;
    
    // Format amount to exactly 2 decimal places (e.g., "1000.00")
    const formattedAmount = parseFloat(amount).toFixed(2);
    
    // Create params object for signing
    const signParams = {
        merchant_id: MERCHANT_ID,
        amount: formattedAmount,
        merchant_order_no: merchant_order_no,
        callback_url: callback_url
    };
    
    // Remove empty/null/undefined values
    const cleanParams = {};
    Object.keys(signParams).forEach(key => {
        if (signParams[key] !== null && signParams[key] !== undefined && signParams[key] !== '') {
            cleanParams[key] = signParams[key].toString();
        }
    });
    
    // Sort parameters alphabetically by key
    const sortedKeys = Object.keys(cleanParams).sort();
    
    // Build signStr: key=value&key=value...&key=PAYIN_API_KEY
    let signStr = sortedKeys.map(k => `${k}=${cleanParams[k]}`).join('&');
    signStr += `&key=${PAYIN_KEY}`;
    
    // Generate signature
    const signature = md5(signStr);
    
    const txnData = {
        type: 'PAYIN',
        amount: parseFloat(formattedAmount),
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        status: 'PENDING',
        gateway_txn_id: '',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    saveTransaction(orderId, txnData);

    const payload = {
        merchant_id: MERCHANT_ID,
        api_key: PAYIN_KEY,
        merchant_order_no: merchant_order_no,
        amount: formattedAmount,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        callback_url,
        return_url,
        fail_url,
        signature
    };
    
    // Safe Debug Logs: log signStr and payload without exposing full key
    const maskedKey = PAYIN_KEY ? `${PAYIN_KEY.substring(0, 4)}...${PAYIN_KEY.substring(PAYIN_KEY.length - 4)}` : 'MISSING';
    const keyExists = !!PAYIN_KEY;
    const safeSignStrLog = signStr.replace(PAYIN_KEY, maskedKey);
    const safePayloadLog = { ...payload, api_key: maskedKey };
    
    console.log(`[Watchpays SignStr]: ${safeSignStrLog}`);
    console.log(`[Watchpays Debug] merchant_id: ${MERCHANT_ID}`);
    console.log(`[Watchpays Debug] PAYIN_KEY exists: ${keyExists}`);
    console.log(`[Watchpays Debug] PAYIN_KEY value: ${maskedKey}`);
    console.log(`[Watchpays Debug] Request body: ${JSON.stringify(safePayloadLog)}`);
    writeLog(`[Watchpays SignStr]: ${safeSignStrLog} | merchant_id: ${MERCHANT_ID} | PAYIN_KEY exists: ${keyExists} | key: ${maskedKey}`, 'DEBUG');
    
    try {
        const response = await axios.post(PAYIN_URL, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        logApiCall(PAYIN_URL, payload, response.data, 'SUCCESS');
        
        if (response.data && response.data.payment_url) {
            return res.json({ status: "SUCCESS", payment_url: response.data.payment_url });
        } else {
            const errorMsg = response.data && response.data.message ? response.data.message : 'Watchpays gateway response missing payment_url.';
            writeLog(`Watchpays API Error: ${errorMsg} | Full response: ${JSON.stringify(response.data)}`, 'ERROR');
            return res.status(400).json({ error: errorMsg, response: response.data });
        }
    } catch (err) {
        const errorDetails = err.response && err.response.data ? err.response.data : null;
        const errMsg = errorDetails ? JSON.stringify(errorDetails) : err.message;
        logApiCall(PAYIN_URL, payload, errMsg, 'FAILED');
        writeLog(`Watchpays API Request Failed: ${err.message} | Details: ${errMsg}`, 'ERROR');
        return res.status(500).json({ error: `Failed to contact Watchpays gateway: ${err.message}`, details: errorDetails });
    }
});

// POST: /create-payout -> Receives payout request and creates transaction
app.post('/create-payout', async (req, res) => {
    const { amount, account_number, ifsc, name, bank_name } = req.body;
    
    if (!amount || !account_number || !ifsc || !name || !bank_name) {
        return res.status(400).json({ error: "Missing required parameters" });
    }
    
    if (parseFloat(amount) < 100) {
        return res.status(400).json({ error: "Amount must be at least ₹100." });
    }
    
    const transaction_id = 'WD_' + Date.now() + Math.floor(Math.random() * 900 + 100);
    const appUrl = getAppUrl(req);
    const callback_url = `${appUrl}/payout_callback.php`;
    
    const raw_sig_str = account_number + amount + bank_name + callback_url + ifsc + MERCHANT_ID + name + transaction_id + PAYOUT_KEY;
    const signature = md5(raw_sig_str);
    
    const transactionData = {
        type: 'PAYOUT',
        account_number,
        amount: parseFloat(amount),
        bank_name,
        ifsc,
        customer_name: name,
        transaction_id,
        status: 'PENDING',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    saveTransaction(transaction_id, transactionData);
    
    const payload = {
        account_number,
        amount,
        bank_name,
        callback_url,
        ifsc,
        merchant_id: MERCHANT_ID,
        name,
        transaction_id,
        signature
    };
    
    try {
        const response = await axios.post(PAYOUT_URL, new URLSearchParams(payload).toString(), {
            timeout: 10000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        logApiCall(PAYOUT_URL, payload, response.data, 'SUCCESS');
        
        if (response.data && response.data.status === 'SUCCESS') {
            return res.json({ status: "SUCCESS", message: "Payout initiated successfully. Transferred to bank." });
        } else {
            const errorMsg = response.data && response.data.message ? response.data.message : 'Watchpays payout request failed.';
            writeLog(`Watchpays Payout API Error: ${errorMsg}`, 'ERROR');
            return res.status(400).json({ error: errorMsg, response: response.data });
        }
    } catch (err) {
        const errMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
        logApiCall(PAYOUT_URL, payload, errMsg, 'FAILED');
        return res.status(500).json({ error: `Failed to contact Watchpays payout gateway: ${err.message}` });
    }
});

// ----------------------------------------------------
// ROUTES: PAYIN FLOW
// ----------------------------------------------------

// GET: payment.php -> Renders Checkout Form
app.get(['/payment.php', '/backend/payment.php'], (req, res) => {
    const pre_amount = req.query.amount || '2000';
    const pre_item = req.query.item || 'Gift Card';
    const pre_email = req.query.email || '';

    const html = `<!DOCTYPE html>
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
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
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
        }
        .header-section { margin-bottom: 2rem; }
        .header-section i { font-size: 2.5rem; color: var(--primary); margin-bottom: 0.5rem; }
        .header-section h2 { font-size: 1.6rem; font-weight: 800; color: var(--text-heading); }
        .header-section p { font-size: 0.9rem; color: var(--text-muted); }
        .input-group { margin-bottom: 1.25rem; text-align: left; }
        .input-group label { display: block; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; }
        .input-wrapper { position: relative; }
        .input-wrapper i { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .input-field {
            width: 100%;
            padding: 0.85rem 1rem 0.85rem 2.75rem;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            font-size: 1rem;
            color: var(--text-heading);
            outline: none;
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
        .pay-summary-label { font-weight: 600; color: var(--text-body); }
        .pay-summary-val { font-size: 1.2rem; font-weight: 800; color: var(--text-heading); }
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
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4);
        }
        .back-link { display: inline-block; margin-top: 1.5rem; color: var(--text-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    </style>
</head>
<body>
    <div class="checkout-container">
        <div class="header-section">
            <i class="fa-solid fa-shield-halved"></i>
            <h2>Secure Checkout</h2>
            <p>Complete your purchase securely via Watchpays</p>
        </div>
        <form action="payment.php" method="POST">
            <input type="hidden" name="item_name" value="${pre_item}">
            <div class="input-group">
                <label>Billing Name</label>
                <div class="input-wrapper">
                    <input type="text" name="name" class="input-field" placeholder="e.g. Rahul Kumar" required>
                    <i class="fa-solid fa-user"></i>
                </div>
            </div>
            <div class="input-group">
                <label>Email Address</label>
                <div class="input-wrapper">
                    <input type="email" name="email" class="input-field" placeholder="e.g. rahul@gmail.com" value="${pre_email}" required>
                    <i class="fa-solid fa-envelope"></i>
                </div>
            </div>
            <div class="input-group">
                <label>Phone Number</label>
                <div class="input-wrapper">
                    <input type="tel" name="phone" class="input-field" placeholder="e.g. 9876543210" pattern="[0-9]{10}" required>
                    <i class="fa-solid fa-phone"></i>
                </div>
            </div>
            <div class="input-group">
                <label>Order Amount (INR)</label>
                <div class="input-wrapper">
                    <input type="number" id="amount" name="amount" class="input-field" value="${pre_amount}" min="2000" required>
                    <i class="fa-solid fa-indian-rupee-sign"></i>
                </div>
            </div>
            <div class="pay-summary">
                <span class="pay-summary-label">Total to Pay</span>
                <span class="pay-summary-val" id="summary-val">₹${parseFloat(pre_amount).toLocaleString('en-IN', {minimumFractionDigits:2})}</span>
            </div>
            <button type="submit" class="submit-btn">
                <i class="fa-solid fa-credit-card"></i> Pay Securely Now
            </button>
        </form>
        <a href="/" class="back-link"><i class="fa-solid fa-arrow-left"></i> Return to Store</a>
    </div>
    <script>
        document.getElementById('amount').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('summary-val').textContent = isNaN(val) ? '₹0.00' : '₹' + val.toLocaleString('en-IN', {minimumFractionDigits:2});
        });
    </script>
</body>
</html>`;
    res.send(html);
});

// POST: payment.php -> Processes payment submission
app.post(['/payment.php', '/backend/payment.php'], async (req, res) => {
    const { amount, email, name, phone, item_name } = req.body;

    if (!amount || !email || !name || !phone) {
        return res.status(400).send('All payment fields are required.');
    }

    const order_id = 'ORD_' + Date.now() + Math.floor(Math.random() * 900 + 100);
    const appUrl = getAppUrl(req);
    const callback_url = `${appUrl}/callback.php`;
    const return_url = `${appUrl}/success.php?order_id=${order_id}`;
    const fail_url = `${appUrl}/failed.php?order_id=${order_id}`;

    // MD5 Signature calculation
    const raw_sig_str = amount + callback_url + MERCHANT_ID + order_id + PAYIN_KEY;
    const signature = md5(raw_sig_str);

    // Save transaction
    const txnData = {
        type: 'PAYIN',
        amount: parseFloat(amount),
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        item_name: item_name || 'Gift Card',
        status: 'PENDING',
        gateway_txn_id: '',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    saveTransaction(order_id, txnData);

    writeLog(`Initiated Payin Order: ${order_id} | Amount: ${amount}`, 'PAYIN');

    const payload = {
        merchant_id: MERCHANT_ID,
        order_id,
        amount,
        name,
        email,
        phone,
        callback_url,
        return_url,
        fail_url,
        signature
    };

    try {
        // Send request to Watchpays Payin API
        const response = await axios.post(PAYIN_URL, new URLSearchParams(payload).toString(), {
            timeout: 7000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        logApiCall(PAYIN_URL, payload, response.data, 'SUCCESS');

        if (response.data && response.data.payment_url) {
            return res.redirect(response.data.payment_url);
        } else {
            // Fallback to local sandbox if API responded negatively
            writeLog(`Watchpays API error: ${JSON.stringify(response.data)}. Falling back to sandbox.`, 'WARNING');
            const session = getSession(req);
            session.sandbox_payload = payload;
            return res.redirect('/payin_sandbox.php');
        }
    } catch (err) {
        // Fallback to sandbox on cURL offline/network failures
        writeLog(`Watchpays API Offline (${err.message}). Falling back to sandbox.`, 'WARNING');
        logApiCall(PAYIN_URL, payload, err.message, 'FAILED');
        const session = getSession(req);
        session.sandbox_payload = payload;
        return res.redirect('/payin_sandbox.php');
    }
});

// POST: callback.php -> Webhook verification
app.post(['/callback.php', '/backend/callback.php'], async (req, res) => {
    writeLog("Callback webhook received.", 'CALLBACK');
    const data = req.body;

    writeLog("Callback Raw Payload: " + JSON.stringify(data), 'CALLBACK');

    const { merchant_id, order_id, amount, status, transaction_id, signature } = data;

    if (merchant_id !== MERCHANT_ID) {
        writeLog(`Callback error: Invalid Merchant ID (${merchant_id})`, 'ERROR');
        return res.status(400).json({ error: 'Invalid merchant' });
    }

    // Verify Signature: md5(amount + merchant_id + order_id + status + transaction_id + payin_key)
    const raw_sig_str = amount + merchant_id + order_id + status + transaction_id + PAYIN_KEY;
    const calculated_signature = md5(raw_sig_str);

    if (calculated_signature !== signature) {
        writeLog(`Callback signature verification failed. Calculated: ${calculated_signature}, Received: ${signature}`, 'ERROR');
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const transaction = getTransaction(order_id);
    if (!transaction) {
        writeLog(`Callback error: Transaction ${order_id} not found`, 'ERROR');
        return res.status(404).json({ error: 'Order not found' });
    }

    if (transaction.status !== 'PENDING') {
        writeLog(`Callback warning: Order ${order_id} already processed. Status: ${transaction.status}`, 'WARNING');
        return res.json({ status: 'ok', message: 'Already processed' });
    }

    // Update status
    transaction.status = status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
    transaction.gateway_txn_id = transaction_id;
    transaction.callback_payload = data;
    saveTransaction(order_id, transaction);

    writeLog(`Callback verified. Order ${order_id} updated to ${transaction.status}`, 'CALLBACK');

    // Send Telegram Notification
    if (transaction.status === 'SUCCESS') {
        const msg = `🔔 *Watchpays Payin Successful* 🔔\n\n` +
                    `📦 *Order ID:* \`${order_id}\`\n` +
                    `💰 *Amount Paid:* ₹${parseFloat(amount).toLocaleString('en-IN', {minimumFractionDigits:2})}\n` +
                    `👤 *Customer Name:* ${transaction.customer_name}\n` +
                    `📧 *Email:* ${transaction.customer_email}\n` +
                    `🔢 *Gateway Txn ID:* \`${transaction_id}\`\n` +
                    `⏰ *Time:* ${new Date().toISOString().replace('T', ' ').substring(0,19)}`;
        await sendTelegramAlert(msg);
    }

    return res.json({ status: 'ok', message: 'Status updated' });
});

// ----------------------------------------------------
// ROUTES: PAYOUT FLOW
// ----------------------------------------------------

// GET: payout.php -> Renders Payout dashboard
app.get(['/payout.php', '/backend/payout.php'], (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watchpays Payout Dashboard | GiftMart</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #6366f1;
            --primary-dark: #4f46e5;
            --primary-light: rgba(99, 102, 241, 0.1);
            --bg-body: #0b0f19;
            --bg-card: rgba(22, 28, 45, 0.6);
            --text-heading: #ffffff;
            --text-body: #94a3b8;
            --text-muted: #64748b;
            --border: rgba(148, 163, 184, 0.1);
            --success: #10b981;
            --danger: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body {
            background-color: var(--bg-body);
            background-image: 
                radial-gradient(at 100% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
                radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
            color: var(--text-body);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }
        .payout-container {
            width: 100%;
            max-width: 550px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 1.5rem;
            padding: 2.5rem;
            backdrop-filter: blur(20px);
        }
        .header-section { text-align: center; margin-bottom: 2rem; }
        .header-section i { font-size: 3rem; color: var(--primary); margin-bottom: 0.5rem; }
        .header-section h2 { font-size: 1.75rem; font-weight: 800; color: var(--text-heading); }
        .header-section p { font-size: 0.9rem; color: var(--text-muted); }
        .alert { padding: 1rem; border-radius: 0.75rem; margin-bottom: 1.5rem; font-size: 0.9rem; font-weight: 600; display: none; align-items: center; gap: 0.5rem; }
        .alert-danger { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: var(--danger); }
        .alert-success { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: var(--success); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .input-group { margin-bottom: 1.25rem; text-align: left; }
        .input-group.full-width { grid-column: span 2; }
        .input-group label { display: block; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; }
        .input-wrapper { position: relative; }
        .input-wrapper i { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .input-field {
            width: 100%;
            padding: 0.85rem 1rem 0.85rem 2.75rem;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            font-size: 1rem;
            color: var(--text-heading);
            outline: none;
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
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1.5rem;
            grid-column: span 2;
        }
        .footer-links { margin-top: 2rem; display: flex; justify-content: space-between; font-size: 0.85rem; }
        .footer-links a { color: var(--primary); text-decoration: none; font-weight: 600; }
        .loading-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(11, 15, 25, 0.9); z-index: 9999; justify-content: center; align-items: center; flex-direction: column; gap: 1.5rem; }
        .spinner { width: 50px; height: 50px; border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .loading-text { color: var(--text-heading); font-size: 1.2rem; font-weight: 600; }
    </style>
</head>
<body>
    <div class="payout-container">
        <div class="header-section">
            <i class="fa-solid fa-money-bill-transfer"></i>
            <h2>Secure Payout</h2>
            <p>Initiate a direct merchant payout transfer instantly</p>
        </div>
        <div class="alert alert-danger" id="errorAlert"></div>
        <div class="alert alert-success" id="successAlert"></div>
        <form id="payoutForm" onsubmit="handlePayoutSubmit(event)">
            <div class="form-grid">
                <div class="input-group full-width">
                    <label>Account Holder Name</label>
                    <div class="input-wrapper">
                        <input type="text" name="name" class="input-field" placeholder="e.g. Rahul Kumar" required>
                        <i class="fa-solid fa-user"></i>
                    </div>
                </div>
                <div class="input-group full-width">
                    <label>Bank Account Number</label>
                    <div class="input-wrapper">
                        <input type="text" name="account_number" class="input-field" placeholder="e.g. 1234567890" pattern="[0-9]{9,18}" required>
                        <i class="fa-solid fa-file-invoice"></i>
                    </div>
                </div>
                <div class="input-group">
                    <label>Bank Name</label>
                    <div class="input-wrapper">
                        <input type="text" name="bank_name" class="input-field" placeholder="e.g. HDFC Bank" required>
                        <i class="fa-solid fa-building-columns"></i>
                    </div>
                </div>
                <div class="input-group">
                    <label>IFSC Code</label>
                    <div class="input-wrapper">
                        <input type="text" name="ifsc" class="input-field" placeholder="e.g. HDFC0001234" pattern="^[A-Z]{4}0[A-Z0-9]{6}$" required>
                        <i class="fa-solid fa-shield"></i>
                    </div>
                </div>
                <div class="input-group full-width">
                    <label>Withdrawal Amount (INR)</label>
                    <div class="input-wrapper">
                        <input type="number" name="amount" class="input-field" placeholder="Minimum: ₹100" min="100" required>
                        <i class="fa-solid fa-indian-rupee-sign"></i>
                    </div>
                </div>
                <button type="submit" class="submit-btn" id="submitBtn">
                    <i class="fa-solid fa-paper-plane"></i> Request Withdrawal
                </button>
            </div>
        </form>
        <div class="footer-links">
            <a href="/"><i class="fa-solid fa-arrow-left"></i> Return to Store</a>
            <a href="/payout_logs.php"><i class="fa-solid fa-chart-line"></i> Payout Logs <i class="fa-solid fa-arrow-right"></i></a>
        </div>
    </div>
    <div class="loading-overlay" id="loadingOverlay">
        <div class="spinner"></div>
        <div class="loading-text">Processing payout transaction...</div>
    </div>
    <script>
        async function handlePayoutSubmit(event) {
            event.preventDefault();
            const errorAlert = document.getElementById('errorAlert');
            const successAlert = document.getElementById('successAlert');
            const loadingOverlay = document.getElementById('loadingOverlay');
            const form = document.getElementById('payoutForm');
            
            errorAlert.style.display = 'none';
            successAlert.style.display = 'none';
            loadingOverlay.style.display = 'flex';

            const formData = new URLSearchParams(new FormData(form));
            try {
                const response = await fetch('/create-payout', {
                    method: 'POST',
                    body: formData,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                const result = await response.json();
                loadingOverlay.style.display = 'none';

                if (result.status === 'SUCCESS' || result.status === 'PENDING') {
                    successAlert.innerHTML = '<i class="fa-solid fa-circle-check"></i> ' + result.message;
                    successAlert.style.display = 'flex';
                    form.reset();
                    if (result.redirect_sandbox) {
                        setTimeout(() => { window.location.href = result.redirect_sandbox; }, 1500);
                    }
                } else {
                    errorAlert.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ' + (result.message || 'Failed.');
                    errorAlert.style.display = 'flex';
                }
            } catch (err) {
                loadingOverlay.style.display = 'none';
                errorAlert.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Network error.';
                errorAlert.style.display = 'flex';
            }
        }
    </script>
</body>
</html>`;
    res.send(html);
});

// POST: withdrawal_api.php -> Payout Request Processing
app.post(['/withdrawal_api.php', '/backend/withdrawal_api.php'], async (req, res) => {
    const { name, account_number, bank_name, ifsc, amount } = req.body;

    if (!name || !account_number || !bank_name || !ifsc || !amount) {
        return res.json({ status: 'FAILED', message: 'All payout fields are required.' });
    }

    if (parseFloat(amount) < 100) {
        return res.json({ status: 'FAILED', message: 'Amount must be at least ₹100.' });
    }

    const transaction_id = 'WD_' + Date.now() + Math.floor(Math.random() * 900 + 100);
    const appUrl = getAppUrl(req);
    const callback_url = `${appUrl}/payout_callback.php`;

    // Signature formulation: md5(account_number + amount + bank_name + callback_url + ifsc + merchant_id + name + transaction_id + payout_key)
    const raw_sig_str = account_number + amount + bank_name + callback_url + ifsc + MERCHANT_ID + name + transaction_id + PAYOUT_KEY;
    const signature = md5(raw_sig_str);

    const transactionData = {
        type: 'PAYOUT',
        account_number,
        amount: parseFloat(amount),
        bank_name,
        ifsc,
        customer_name: name,
        transaction_id,
        status: 'PENDING',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    saveTransaction(transaction_id, transactionData);

    writeLog(`Initiated Payout for Txn: ${transaction_id} | Amount: ${amount}`, 'PAYOUT');

    const payload = {
        account_number,
        amount,
        bank_name,
        callback_url,
        ifsc,
        merchant_id: MERCHANT_ID,
        name,
        transaction_id,
        signature
    };

    try {
        const response = await axios.post(PAYOUT_URL, new URLSearchParams(payload).toString(), {
            timeout: 7000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        logApiCall(PAYOUT_URL, payload, response.data, 'SUCCESS');

        if (response.data && response.data.status === 'SUCCESS') {
            return res.json({
                status: 'SUCCESS',
                message: 'Payout initiated successfully. Transferred to bank.'
            });
        } else {
            // Redirect simulator sandbox
            const err_msg = response.data?.message || 'Payout API returned error. Redirecting to Sandbox.';
            const session = getSession(req);
            session.payout_sandbox_payload = payload;
            return res.json({
                status: 'PENDING',
                message: err_msg,
                redirect_sandbox: '/payout_sandbox.php'
            });
        }
    } catch (err) {
        writeLog(`Payout API Offline (${err.message}). Redirecting to Sandbox.`, 'WARNING');
        logApiCall(PAYOUT_URL, payload, err.message, 'FAILED');
        const session = getSession(req);
        session.payout_sandbox_payload = payload;
        return res.json({
            status: 'PENDING',
            message: 'API offline. Redirecting to Sandbox...',
            redirect_sandbox: '/payout_sandbox.php'
        });
    }
});

// POST: payout_callback.php -> Webhook verification
app.post(['/payout_callback.php', '/backend/payout_callback.php'], async (req, res) => {
    writeLog("Payout callback webhook received.", 'PAYOUT_CALLBACK');
    const data = req.body;

    writeLog("Payout Callback Raw Payload: " + JSON.stringify(data), 'PAYOUT_CALLBACK');

    const { merchant_id, transaction_id, amount, status, signature } = data;

    if (merchant_id !== MERCHANT_ID) {
        writeLog(`Payout Callback error: Invalid Merchant ID (${merchant_id})`, 'ERROR');
        return res.status(400).json({ error: 'Invalid merchant' });
    }

    // Payout Callback MD5 Signature: md5(amount + merchant_id + status + transaction_id + payout_key)
    const raw_sig_str = amount + merchant_id + status + transaction_id + PAYOUT_KEY;
    const calculated_signature = md5(raw_sig_str);

    if (calculated_signature !== signature) {
        writeLog(`Payout Callback signature mismatch. Calculated: ${calculated_signature}, Received: ${signature}`, 'ERROR');
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const transaction = getTransaction(transaction_id);
    if (!transaction) {
        writeLog(`Payout Callback error: Transaction ${transaction_id} not found`, 'ERROR');
        return res.status(404).json({ error: 'Order not found' });
    }

    if (transaction.status !== 'PENDING') {
        writeLog(`Payout Callback warning: Order ${transaction_id} already processed. Status: ${transaction.status}`, 'WARNING');
        return res.json({ status: 'ok', message: 'Already processed' });
    }

    // Update status
    transaction.status = status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
    transaction.callback_payload = data;
    saveTransaction(transaction_id, transaction);

    writeLog(`Payout callback completed. Status updated for ${transaction_id} to ${transaction.status}`, 'PAYOUT_CALLBACK');

    // Telegram Bot notification
    const msg = `💸 *Watchpays Payout Callback* 💸\n\n` +
                 `🔢 *Transaction ID:* \`${transaction_id}\`\n` +
                 `💰 *Payout Amount:* ₹${parseFloat(amount).toLocaleString('en-IN', {minimumFractionDigits:2})}\n` +
                 `👤 *Beneficiary:* ${transaction.customer_name}\n` +
                 `🏦 *Bank Name:* ${transaction.bank_name}\n` +
                 `🟢 *New Status:* *${transaction.status}*\n` +
                 `⏰ *Time:* ${new Date().toISOString().replace('T', ' ').substring(0,19)}`;
    await sendTelegramAlert(msg);

    return res.json({ status: 'ok', message: 'Status updated' });
});

// ----------------------------------------------------
// ROUTES: REDIRECT SCREENS
// ----------------------------------------------------

app.get(['/success.php', '/backend/success.php'], (req, res) => {
    const order_id = req.query.order_id || '';
    const transaction = getTransaction(order_id);
    const amount = transaction ? transaction.amount : 0.00;
    const name = transaction ? transaction.customer_name : 'Customer';
    const gateway_txn_id = transaction ? (transaction.gateway_txn_id || 'N/A') : 'N/A';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Successful | GiftMart</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #10b981;
            --primary-dark: #059669;
            --primary-light: rgba(16, 185, 129, 0.1);
            --bg-body: #0b0f19;
            --bg-card: rgba(22, 28, 45, 0.6);
            --text-heading: #ffffff;
            --text-body: #94a3b8;
            --text-muted: #64748b;
            --border: rgba(148, 163, 184, 0.1);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body {
            background-color: var(--bg-body);
            background-image: 
                radial-gradient(at 50% 0%, rgba(16, 185, 129, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.05) 0px, transparent 50%);
            color: var(--text-body);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }
        .success-card {
            width: 100%;
            max-width: 480px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 1.5rem;
            padding: 3rem 2.5rem;
            backdrop-filter: blur(20px);
            text-align: center;
        }
        .icon-circle {
            width: 80px;
            height: 80px;
            background: var(--primary-light);
            border: 2px solid rgba(16, 185, 129, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 2rem;
        }
        .icon-circle i { font-size: 2.5rem; color: var(--primary); }
        .title { font-size: 1.8rem; font-weight: 800; color: var(--text-heading); margin-bottom: 0.5rem; }
        .subtitle { font-size: 0.95rem; color: var(--text-body); margin-bottom: 2rem; }
        .receipt-box { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; margin-bottom: 2.5rem; text-align: left; }
        .receipt-row { display: flex; justify-content: space-between; margin-bottom: 0.85rem; font-size: 0.95rem; }
        .receipt-row:last-child { margin-bottom: 0; padding-top: 0.85rem; border-top: 1px solid var(--border); }
        .label { color: var(--text-muted); font-weight: 500; }
        .val { color: var(--text-heading); font-weight: 700; }
        .val.success-text { color: var(--primary); }
        .btn-portal {
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
            box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3);
        }
    </style>
</head>
<body>
    <div class="success-card">
        <div class="icon-circle"><i class="fa-solid fa-circle-check"></i></div>
        <h2 class="title">Payment Successful!</h2>
        <p class="subtitle">Thank you for your payment. Your transaction has been completed.</p>
        <div class="receipt-box">
            <div class="receipt-row"><span class="label">Customer Name</span><span class="val">${name}</span></div>
            <div class="receipt-row"><span class="label">Order ID</span><span class="val">${order_id}</span></div>
            <div class="receipt-row"><span class="label">Transaction ID</span><span class="val">${gateway_txn_id}</span></div>
            <div class="receipt-row"><span class="label">Status</span><span class="val success-text">APPROVED</span></div>
            <div class="receipt-row"><span class="label">Amount Paid</span><span class="val success-text">₹${amount.toLocaleString('en-IN', {minimumFractionDigits:2})}</span></div>
        </div>
        <a href="/" class="btn-portal"><i class="fa-solid fa-house"></i> Return to Store</a>
    </div>
</body>
</html>`);
});

app.get(['/failed.php', '/backend/failed.php'], (req, res) => {
    const order_id = req.query.order_id || '';
    const transaction = getTransaction(order_id);
    const amount = transaction ? transaction.amount : 0.00;
    const name = transaction ? transaction.customer_name : 'Customer';

    res.send(`<!DOCTYPE html>
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
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
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
            text-align: center;
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
        }
        .icon-circle i { font-size: 2.5rem; color: var(--primary); }
        .title { font-size: 1.8rem; font-weight: 800; color: var(--text-heading); margin-bottom: 0.5rem; }
        .subtitle { font-size: 0.95rem; color: var(--text-body); margin-bottom: 2rem; }
        .receipt-box { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; margin-bottom: 2.5rem; text-align: left; }
        .receipt-row { display: flex; justify-content: space-between; margin-bottom: 0.85rem; font-size: 0.95rem; }
        .receipt-row:last-child { margin-bottom: 0; padding-top: 0.85rem; border-top: 1px solid var(--border); }
        .label { color: var(--text-muted); font-weight: 500; }
        .val { color: var(--text-heading); font-weight: 700; }
        .val.danger-text { color: var(--primary); }
        .btn-action-container { display: flex; flex-direction: column; gap: 1rem; }
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
        }
    </style>
</head>
<body>
    <div class="failed-card">
        <div class="icon-circle"><i class="fa-solid fa-circle-xmark"></i></div>
        <h2 class="title">Payment Failed</h2>
        <p class="subtitle">Unfortunately, your payment could not be processed. Please try again.</p>
        <div class="receipt-box">
            <div class="receipt-row"><span class="label">Customer Name</span><span class="val">${name}</span></div>
            <div class="receipt-row"><span class="label">Order ID</span><span class="val">${order_id}</span></div>
            <div class="receipt-row"><span class="label">Status</span><span class="val danger-text">DECLINED</span></div>
            <div class="receipt-row"><span class="label">Amount</span><span class="val danger-text">₹${amount.toLocaleString('en-IN', {minimumFractionDigits:2})}</span></div>
        </div>
        <div class="btn-action-container">
            <a href="/" class="btn-retry"><i class="fa-solid fa-rotate-right"></i> Try Again</a>
            <a href="/" class="btn-portal"><i class="fa-solid fa-house"></i> Return to Store</a>
        </div>
    </div>
</body>
</html>`);
});

// ----------------------------------------------------
// ROUTES: SANDBOX SIMULATORS & LOGS
// ----------------------------------------------------

app.get(['/payin_sandbox.php', '/backend/payin_sandbox.php'], (req, res) => {
    const session = getSession(req);
    const payload = session.sandbox_payload;
    if (!payload) return res.redirect('/');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>Watchpays Checkout Sandbox</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: #f59e0b; --bg-body: #0f172a; --bg-card: rgba(30, 41, 59, 0.7); --text-heading: #fff; --text-body: #94a3b8; --border: rgba(148, 163, 184, 0.1); --success: #10b981; --danger: #ef4444; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body { background-color: var(--bg-body); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1.5rem; }
        .sandbox-card { width: 100%; max-width: 480px; background: var(--bg-card); border: 2px dashed var(--primary); border-radius: 1.5rem; padding: 2.5rem; text-align: center; }
        .badge { display: inline-block; padding: 0.35rem 1rem; background: rgba(245,158,11,0.1); color: var(--primary); border: 1px solid rgba(245,158,11,0.3); border-radius: 2rem; font-size: 0.8rem; font-weight: 700; margin-bottom: 1.5rem; }
        .details-box { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; margin-bottom: 2rem; text-align: left; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 0.75rem; }
        .btn-container { display: flex; flex-direction: column; gap: 1rem; }
        .btn { width: 100%; padding: 1rem; border: none; border-radius: 0.75rem; font-size: 1rem; font-weight: 700; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; text-decoration: none; }
        .btn-success { background: var(--success); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .btn-cancel { background: transparent; color: #94a3b8; border: 1px solid var(--border); }
    </style>
</head>
<body>
    <div class="sandbox-card">
        <span class="badge"><i class="fa-solid fa-flask"></i> Payin Sandbox</span>
        <h2>Mock Gateway Payment</h2>
        <br>
        <div class="details-box">
            <div class="detail-row"><span>Order ID</span><strong>${payload.order_id}</strong></div>
            <div class="detail-row"><span>Customer Name</span><strong>${payload.name}</strong></div>
            <div class="detail-row"><span>Amount</span><strong style="color:var(--primary)">₹${parseFloat(payload.amount).toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></div>
        </div>
        <div class="btn-container">
            <form action="payin_sandbox_trigger.php" method="POST">
                <input type="hidden" name="status" value="SUCCESS">
                <button type="submit" class="btn btn-success"><i class="fa-solid fa-circle-check"></i> Authorize Success Webhook</button>
            </form>
            <form action="payin_sandbox_trigger.php" method="POST">
                <input type="hidden" name="status" value="FAILED">
                <button type="submit" class="btn btn-danger"><i class="fa-solid fa-circle-xmark"></i> Reject & Fail Payment</button>
            </form>
            <a href="/" class="btn btn-cancel">Cancel</a>
        </div>
    </div>
</body>
</html>`;
    res.send(html);
});

app.post(['/payin_sandbox_trigger.php', '/backend/payin_sandbox_trigger.php'], async (req, res) => {
    const session = getSession(req);
    const payload = session.sandbox_payload;
    if (!payload) return res.redirect('/');

    const status = req.body.status || 'FAILED';
    const transaction_id = 'WP_TXN_' + Math.floor(Math.random() * 900000000 + 100000000);
    const appUrl = getAppUrl(req);
    const callback_endpoint = `${appUrl}/callback.php`;

    // Signature creation for callback: md5(amount + merchant_id + order_id + status + transaction_id + payin_key)
    const raw_sig_str = payload.amount + MERCHANT_ID + payload.order_id + status + transaction_id + PAYIN_KEY;
    const signature = md5(raw_sig_str);

    const callback_data = {
        merchant_id: MERCHANT_ID,
        order_id: payload.order_id,
        amount: payload.amount,
        status,
        transaction_id,
        signature
    };

    writeLog(`SANDBOX: Firing mock callback webhook with status: ${status}`, 'SANDBOX');

    try {
        const response = await axios.post(callback_endpoint, callback_data, { timeout: 5000 });
        writeLog(`SANDBOX: Callback response code: ${response.status} | Response: ${JSON.stringify(response.data)}`, 'SANDBOX');
    } catch (err) {
        writeLog(`SANDBOX: Callback trigger failed (${err.message})`, 'ERROR');
    }

    delete session.sandbox_payload;

    if (status === 'SUCCESS') {
        res.redirect(payload.return_url);
    } else {
        res.redirect(payload.fail_url);
    }
});

app.get(['/payout_sandbox.php', '/backend/payout_sandbox.php'], (req, res) => {
    const session = getSession(req);
    const payload = session.payout_sandbox_payload;
    if (!payload) return res.redirect('/payout.php');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>Watchpays Payout Sandbox</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: #f59e0b; --bg-body: #0f172a; --bg-card: rgba(30, 41, 59, 0.7); --text-heading: #fff; --text-body: #94a3b8; --border: rgba(148, 163, 184, 0.1); --success: #10b981; --danger: #ef4444; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body { background-color: var(--bg-body); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1.5rem; }
        .sandbox-card { width: 100%; max-width: 500px; background: var(--bg-card); border: 2px dashed var(--primary); border-radius: 1.5rem; padding: 2.5rem; text-align: center; }
        .badge { display: inline-block; padding: 0.35rem 1rem; background: rgba(245,158,11,0.1); color: var(--primary); border: 1px solid rgba(245,158,11,0.3); border-radius: 2rem; font-size: 0.8rem; font-weight: 700; margin-bottom: 1.5rem; }
        .details-box { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; margin-bottom: 2rem; text-align: left; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 0.75rem; }
        .btn-container { display: flex; flex-direction: column; gap: 1rem; }
        .btn { width: 100%; padding: 1rem; border: none; border-radius: 0.75rem; font-size: 1rem; font-weight: 700; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; text-decoration: none; }
        .btn-success { background: var(--success); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .btn-cancel { background: transparent; color: #94a3b8; border: 1px solid var(--border); }
    </style>
</head>
<body>
    <div class="sandbox-card">
        <span class="badge"><i class="fa-solid fa-flask"></i> Payout Simulator</span>
        <h2>Mock Payout Transfer</h2>
        <br>
        <div class="details-box">
            <div class="detail-row"><span>Transaction ID</span><strong>${payload.transaction_id}</strong></div>
            <div class="detail-row"><span>Beneficiary</span><strong>${payload.name}</strong></div>
            <div class="detail-row"><span>Account Number</span><strong>${payload.account_number}</strong></div>
            <div class="detail-row"><span>Amount</span><strong style="color:var(--primary)">₹${parseFloat(payload.amount).toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></div>
        </div>
        <div class="btn-container">
            <form action="payout_sandbox_trigger.php" method="POST">
                <input type="hidden" name="status" value="SUCCESS">
                <button type="submit" class="btn btn-success"><i class="fa-solid fa-circle-check"></i> Approve & Process Transfer</button>
            </form>
            <form action="payout_sandbox_trigger.php" method="POST">
                <input type="hidden" name="status" value="FAILED">
                <button type="submit" class="btn btn-danger"><i class="fa-solid fa-circle-xmark"></i> Reject & Fail Transfer</button>
            </form>
            <a href="/payout.php" class="btn btn-cancel">Cancel</a>
        </div>
    </div>
</body>
</html>`;
    res.send(html);
});

app.post(['/payout_sandbox_trigger.php', '/backend/payout_sandbox_trigger.php'], async (req, res) => {
    const session = getSession(req);
    const payload = session.payout_sandbox_payload;
    if (!payload) return res.redirect('/payout.php');

    const status = req.body.status || 'FAILED';
    const appUrl = getAppUrl(req);
    const callback_endpoint = `${appUrl}/payout_callback.php`;

    // Signature formulation: md5(amount + merchant_id + status + transaction_id + payout_key)
    const raw_sig_str = payload.amount + MERCHANT_ID + status + payload.transaction_id + PAYOUT_KEY;
    const signature = md5(raw_sig_str);

    const callback_data = {
        merchant_id: MERCHANT_ID,
        transaction_id: payload.transaction_id,
        amount: payload.amount,
        status,
        signature
    };

    writeLog(`SANDBOX: Firing mock payout callback webhook with status: ${status}`, 'SANDBOX');

    try {
        const response = await axios.post(callback_endpoint, callback_data, { timeout: 5000 });
        writeLog(`SANDBOX: Payout callback response code: ${response.status}`, 'SANDBOX');
    } catch (err) {
        writeLog(`SANDBOX: Payout callback failed (${err.message})`, 'ERROR');
    }

    delete session.payout_sandbox_payload;
    res.redirect('/payout.php?status_updated=' + status);
});

app.get(['/payout_logs.php', '/backend/payout_logs.php'], (req, res) => {
    const txns = getAllTransactions();
    const sortedTxns = Object.entries(txns).sort((a, b) => b[1].created_at.localeCompare(a[1].created_at));

    let logsContent = 'No logs created yet.';
    if (fs.existsSync(LOG_FILE)) {
        const fileLines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
        logsContent = fileLines.slice(-50).join('\n');
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>Gateway Admin Logs</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: #4f46e5; --bg-body: #090d16; --bg-card: rgba(17, 24, 39, 0.7); --text-heading: #fff; --text-body: #94a3b8; --border: rgba(148, 163, 184, 0.08); --success: #10b981; --warning: #f59e0b; --danger: #ef4444; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body { background-color: var(--bg-body); padding: 2.5rem; color: var(--text-body); }
        .dashboard-container { max-width: 1200px; margin: 0 auto; }
        .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.5rem; }
        .btn { padding: 0.65rem 1.25rem; border-radius: 0.5rem; font-weight: 600; text-decoration: none; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 0.5rem; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-outline { background: transparent; color: #94a3b8; border: 1px solid var(--border); }
        .btn-danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 1rem; padding: 1.75rem; margin-bottom: 2rem; }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th { padding: 0.75rem 1rem; border-bottom: 2px solid var(--border); font-size: 0.75rem; text-transform: uppercase; color: #fff; }
        td { padding: 1rem; border-bottom: 1px solid var(--border); }
        .console-box { background: #05070c; color: #34d399; font-family: monospace; padding: 1.25rem; border-radius: 0.75rem; max-height: 350px; overflow-y: auto; white-space: pre-wrap; text-align: left; }
        .badge-type { padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700; }
        .badge-payin { background: rgba(79, 70, 229, 0.15); color: #818cf8; }
        .badge-payout { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
        .badge-status { padding: 0.25rem 0.6rem; border-radius: 2rem; font-size: 0.75rem; font-weight: 700; }
        .status-success { background: rgba(16, 185, 129, 0.12); color: var(--success); }
        .status-pending { background: rgba(245, 158, 11, 0.12); color: var(--warning); }
        .status-failed { background: rgba(239, 68, 68, 0.12); color: var(--danger); }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <div class="dashboard-header">
            <div>
                <h1>Admin Logs Console</h1>
                <p>Monitor transaction logs and live Webhook API tails</p>
            </div>
            <div>
                <a href="/" class="btn btn-outline"><i class="fa-solid fa-arrow-left"></i> Home</a>
                <a href="/payout.php" class="btn btn-primary">New Payout</a>
            </div>
        </div>
        <div class="card">
            <h3>Transaction Logs</h3>
            <br>
            <table style="width: 100%;">
                <thead>
                    <tr><th>Date</th><th>ID</th><th>Type</th><th>Beneficiary</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${sortedTxns.map(([id, txn]) => `
                        <tr>
                            <td>${txn.created_at}</td>
                            <td><code>${id}</code></td>
                            <td><span class="badge-type ${txn.type === 'PAYIN' ? 'badge-payin' : 'badge-payout'}">${txn.type}</span></td>
                            <td>${txn.customer_name}</td>
                            <td><strong>₹${txn.amount.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
                            <td><span class="badge-status ${txn.status === 'SUCCESS' ? 'status-success' : (txn.status === 'PENDING' ? 'status-pending' : 'status-failed')}">${txn.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>Console API log tail (api.log)</h3>
                <form action="payout_logs.php" method="POST">
                    <input type="hidden" name="clear" value="1">
                    <button type="submit" class="btn btn-danger">Clear Logs</button>
                </form>
            </div>
            <br>
            <div class="console-box">${logsContent}</div>
        </div>
    </div>
</body>
</html>`;
    res.send(html);
});

app.post(['/payout_logs.php', '/backend/payout_logs.php'], (req, res) => {
    if (req.body.clear && fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '', 'utf8');
        writeLog("Logs cleared by admin.", 'ADMIN');
    }
    res.redirect('/payout_logs.php');
});

// Serve frontend static folder
app.use(express.static(__dirname));

// Default routing fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    writeLog(`GiftMart API Payment Server running on port ${PORT}`, 'SYSTEM');
    console.log(`Watchpays Gateway Server running on port ${PORT}`);
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        console.log(`Telegram Bot alerts enabled!`);
    }
});
