require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Import official BaseUPI SDK
const BaseUPI = require('baseupi').default || require('baseupi');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Environment Variables Check & Initialization
// ==========================================
const BASEUPI_API_KEY = process.env.BASEUPI_API_KEY;
const BASEUPI_SECRET_KEY = process.env.BASEUPI_SECRET_KEY;

if (!BASEUPI_API_KEY || !BASEUPI_SECRET_KEY) {
    console.error("CRITICAL WARNING: BASEUPI_API_KEY or BASEUPI_SECRET_KEY is missing.");
}

// Initialize the official BaseUPI SDK
let baseupi;
try {
    baseupi = new BaseUPI(BASEUPI_API_KEY);
} catch (e) {
    console.error("Failed to initialize BaseUPI SDK. Check if API key is provided.", e.message);
}

// ==========================================
// Middleware Setup
// ==========================================
// 1. Enable Explicit CORS for all domains
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-baseupi-signature']
}));
app.options('*', cors());

// ==========================================
// API Route: Create Payment
// ==========================================
// Use standard express.json() for this route
app.post('/api/create-payment', express.json(), async (req, res) => {
    try {
        const { amount, item_name } = req.body;

        // Validation
        if (!amount || amount < 2000) {
            return res.status(400).json({ error: 'Minimum amount must be ₹2000' });
        }

        if (!baseupi) {
            return res.status(500).json({ error: 'BaseUPI SDK is not initialized. Please configure API keys on Render.' });
        }

        // Convert INR amount to paise (Amount * 100) as required by BaseUPI
        const amountPaise = parseInt(amount) * 100;
        
        // Generate a unique order ID for internal tracking
        const internalOrderId = `gm_${Date.now()}`;

        console.log(`[BaseUPI] Creating order for ${amount} INR (${amountPaise} paise)...`);

        // Use the official SDK to create the order
        const order = await baseupi.orders.create({
            merchant_order_id: internalOrderId,
            line_items: [
                {
                    name: `GiftMart Purchase: ${item_name || 'Gift Card'}`,
                    amount_paise: amountPaise,
                    quantity: 1
                }
            ]
        });

        console.log("[BaseUPI] Order created successfully:", order.id || order.merchant_order_id);

        // Return the official checkout URL
        if (order && order.checkout_url) {
            return res.status(200).json({
                status: 'success',
                payment_url: order.checkout_url,
                order_id: order.merchant_order_id
            });
        } else {
            console.error("Unexpected BaseUPI SDK response structure:", order);
            return res.status(500).json({ error: 'Received invalid response structure from payment gateway.' });
        }

    } catch (error) {
        console.error("Error creating BaseUPI payment:", error.message);
        
        // Return specific gateway error if available from SDK
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({ 
                error: error.response.data.message || error.response.data.error || 'Failed to initialize payment.',
            });
        }

        return res.status(500).json({ error: `Payment Service Error: ${error.message}` });
    }
});

// ==========================================
// Webhook Route: Handle Payment Status
// ==========================================
// VERY IMPORTANT: BaseUPI Webhook Verification REQUIRES raw body parsing.
// Do not use express.json() here. Use express.text() exactly as per documentation.
app.post('/webhooks/baseupi', express.text({ type: '*/*' }), (req, res) => {
    try {
        const signature = req.headers['x-baseupi-signature'];
        
        if (!signature) {
            console.warn("Webhook received without signature header.");
            return res.status(400).send("Missing Signature");
        }

        if (!baseupi) {
            console.error("BaseUPI SDK not initialized, cannot verify webhook.");
            return res.status(500).send("SDK Error");
        }

        let event;

        // Use the OFFICIAL SDK to securely parse and verify the webhook
        try {
            event = baseupi.webhooks.constructEvent(req.body, signature, BASEUPI_SECRET_KEY);
        } catch (err) {
            console.error('Webhook payload was compromised or invalid:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Webhook is mathematically verified! Process Event.
        if (event.event === 'payment.completed') {
            console.log(`[Webhook] Payment SUCCESS! Merchant Order ID: ${event.merchant_order_id}`);
            // TODO: Fulfill order in database using event.merchant_order_id
        }

        // Return 200 OK so gateway knows we received it
        return res.json({ received: true });

    } catch (error) {
        console.error("Webhook Route Error:", error.message);
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
        console.log(`WARNING: Keys not detected! Ensure Render Environment Variables are set.`);
    }
});
