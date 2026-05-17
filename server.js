require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Middleware Setup
// ==========================================
// 1. Enable Explicit CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'x-baseupi-signature', 'Authorization']
}));
app.options('*', cors());

// 2. Parse JSON and save raw body for secure webhook verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ==========================================
// Environment Variables Check
// ==========================================
const BASEUPI_API_KEY = process.env.BASEUPI_API_KEY;
const BASEUPI_SECRET_KEY = process.env.BASEUPI_SECRET_KEY;

if (!BASEUPI_API_KEY || !BASEUPI_SECRET_KEY) {
    console.error("CRITICAL WARNING: BASEUPI_API_KEY or BASEUPI_SECRET_KEY is missing from environment variables.");
}

// ==========================================
// API Route: Create Payment
// ==========================================
app.post('/api/create-payment', async (req, res) => {
    try {
        const { amount, item_name } = req.body;

        // Validation
        if (!amount || amount < 2000) {
            return res.status(400).json({ error: 'Minimum amount must be ₹2000' });
        }

        const internalOrderId = `gm_${Date.now()}`;
        const amountPaise = parseInt(amount) * 100;
        
        console.log(`[BaseUPI] Creating order for ${amount} INR (${amountPaise} paise)...`);

        // Use native Axios HTTP request to the exact official BaseUPI API endpoint
        const response = await axios.post('https://baseupi.app/api/v1/orders', {
            merchant_order_id: internalOrderId,
            line_items: [
                {
                    name: `GiftMart Purchase: ${item_name || 'Gift Card'}`,
                    amount_paise: amountPaise,
                    quantity: 1
                }
            ]
        }, {
            headers: {
                'x-api-key': BASEUPI_API_KEY, // BaseUPI expects x-api-key, NOT Bearer
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        const data = response.data;
        console.log("[BaseUPI] API Response:", data);

        // BaseUPI Official SDK returns 'checkout_url'
        if (data && data.checkout_url) {
            return res.status(200).json({
                status: 'success',
                payment_url: data.checkout_url,
                order_id: data.id || data.merchant_order_id || internalOrderId
            });
        } else {
            console.error("Unexpected BaseUPI response structure:", data);
            return res.status(500).json({ error: 'Received invalid response structure from payment gateway.' });
        }

    } catch (error) {
        console.error("Error creating BaseUPI payment:", error.response?.data || error.message);
        
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({ 
                error: error.response.data.message || error.response.data.error || 'Failed to initialize payment with the BaseUPI gateway.',
                details: error.response.data
            });
        }

        return res.status(500).json({ error: 'Payment Service is currently unreachable. Please try again later.' });
    }
});

// ==========================================
// Webhook Route: Handle Payment Status
// ==========================================
app.post('/webhooks/baseupi', (req, res) => {
    try {
        const signatureHeader = req.headers['x-baseupi-signature'];
        
        if (!signatureHeader) {
            console.warn("Webhook received without signature header.");
            return res.status(400).send("Missing Signature");
        }

        if (!req.rawBody) {
            return res.status(400).send("Empty Payload");
        }

        // Generate HMAC SHA256 exactly as the official SDK does
        const expectedSignature = crypto.createHmac('sha256', BASEUPI_SECRET_KEY).update(req.rawBody).digest('hex');
        
        const signatureBuffer = Buffer.from(signatureHeader, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');

        if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            console.error("Webhook signature mismatch! Potential spoofing attempt.");
            return res.status(400).send("Invalid Signature");
        }

        // Signature is valid, process Event
        const event = req.body;
        
        if (event.event === 'payment.completed' || event.status === 'COMPLETED' || event.status === 'PAID') {
            console.log(`[Webhook] Payment SUCCESS for Order: ${event.order_id || event.merchant_order_id}`);
            // TODO: Fulfill order in database
        } else if (event.status === 'FAILED') {
            console.log(`[Webhook] Payment FAILED for Order: ${event.order_id || event.merchant_order_id}`);
            // TODO: Handle failure logic
        }

        return res.status(200).send("Webhook Received & Verified");

    } catch (error) {
        console.error("Webhook Error:", error.message);
        return res.status(500).send("Webhook Server Error");
    }
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`BaseUPI Server is running on port ${PORT}`);
    if (BASEUPI_API_KEY) {
        console.log(`API Key loaded successfully: ${BASEUPI_API_KEY.substring(0, 10)}...`);
    } else {
        console.log(`WARNING: Environment variables not detected!`);
    }
});
