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
    origin: '*', // For production, replace '*' with your actual Netlify frontend URL
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-baseupi-signature']
}));

// Handle preflight OPTIONS requests explicitly
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
    console.error("CRITICAL ERROR: BASEUPI_API_KEY or BASEUPI_SECRET_KEY is missing from environment variables.");
    // We don't exit here so Render doesn't crash repeatedly during setup.
}

// ==========================================
// API Route: Create Payment
// ==========================================
app.post('/api/create-payment', async (req, res) => {
    try {
        const { amount, currency, item_name } = req.body;

        // Validation
        if (!amount || amount < 2000) {
            return res.status(400).json({ error: 'Minimum amount must be ₹2000' });
        }

        // Production BaseUPI API Call using Axios for better compatibility
        const response = await axios.post('https://api.baseupi.app/v1/payment/create', {
            amount: amount,
            currency: currency || 'INR',
            description: `Purchase: ${item_name}`
        }, {
            headers: {
                'Authorization': `Bearer ${BASEUPI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = response.data;

        // Return the payment URL/Intent link to the frontend
        if (data && (data.payment_url || data.intent_url)) {
            return res.status(200).json({
                status: 'success',
                payment_url: data.payment_url || data.intent_url,
                order_id: data.order_id
            });
        } else {
            console.error("Unexpected BaseUPI response structure:", data);
            return res.status(500).json({ error: 'Received invalid response structure from payment gateway.' });
        }

    } catch (error) {
        console.error("Error creating BaseUPI payment:", error.response?.data || error.message);
        
        // Return specific gateway error if available
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
        // Retrieve signature from headers (BaseUPI standard)
        const signatureHeader = req.headers['x-baseupi-signature'];
        
        if (!signatureHeader) {
            console.warn("Webhook received without signature header.");
            return res.status(400).send("Missing Signature");
        }

        // Generate HMAC SHA256 of the raw payload body
        if (!req.rawBody) {
            return res.status(400).send("Empty Payload");
        }

        const hmac = crypto.createHmac('sha256', BASEUPI_SECRET_KEY);
        hmac.update(req.rawBody);
        const generatedSignature = hmac.digest('hex');

        // Securely compare signatures
        if (signatureHeader !== generatedSignature) {
            console.error("Webhook signature mismatch! Potential spoofing attempt.");
            return res.status(400).send("Invalid Signature");
        }

        // Signature is valid, process Event
        const event = req.body;
        
        if (event.status === 'PAID' || event.status === 'SUCCESS') {
            console.log(`[Webhook] Payment SUCCESS for Order: ${event.order_id}, Amount: ${event.amount}`);
            // TODO: Fulfill order in database
        } else if (event.status === 'FAILED') {
            console.log(`[Webhook] Payment FAILED for Order: ${event.order_id}`);
            // TODO: Handle failure logic in database
        }

        // Return 200 OK so gateway knows we received it
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
        console.log(`API Key loaded successfully: ${BASEUPI_API_KEY.substring(0, 15)}...`);
    } else {
        console.log(`WARNING: Environment variables not detected!`);
    }
});
