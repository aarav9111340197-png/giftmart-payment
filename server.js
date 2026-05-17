require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Middleware Setup
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ==========================================
// Environment Variables Check
// ==========================================
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.trim() : null;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ? process.env.RAZORPAY_KEY_SECRET.trim() : null;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error("==========================================");
    console.error("CRITICAL WARNING: ENVIRONMENT VARIABLES MISSING");
    console.error("Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env or Render dashboard!");
    console.error("==========================================");
} else {
    const maskKey = (key) => key && key.length > 8 ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : 'INVALID_LENGTH';
    console.log("==========================================");
    console.log("[Auth Setup] Razorpay Keys Loaded Successfully!");
    console.log(`[Auth Setup] Masked Key ID: ${maskKey(RAZORPAY_KEY_ID)}`);
    console.log(`[Auth Setup] Masked Secret: ${maskKey(RAZORPAY_KEY_SECRET)}`);
    console.log("==========================================");
}

// Initialize Razorpay SDK
let razorpayInstance;
try {
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
        razorpayInstance = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET
        });
    }
} catch (error) {
    console.error("Failed to initialize Razorpay SDK:", error);
}

// ==========================================
// API Route: Create Razorpay Order
// ==========================================
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, item_name } = req.body;

        if (!amount || amount < 2000) {
            return res.status(400).json({ error: 'Minimum amount must be ₹2000' });
        }

        if (!razorpayInstance) {
            return res.status(500).json({ error: 'Server configuration error. Razorpay SDK not initialized.' });
        }

        const amountPaise = parseInt(amount) * 100;
        const receiptId = `receipt_${Date.now()}`;

        console.log(`[Razorpay] Creating order for ${amount} INR (${amountPaise} paise)...`);

        const options = {
            amount: amountPaise,
            currency: 'INR',
            receipt: receiptId,
            notes: {
                item: item_name || 'Gift Card'
            }
        };

        const order = await razorpayInstance.orders.create(options);
        
        console.log("[Razorpay] Order created successfully:", order.id);

        return res.status(200).json({
            status: 'success',
            order_id: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        return res.status(500).json({ error: 'Failed to create payment order. Please try again.' });
    }
});

// ==========================================
// API Route: Verify Payment Signature
// ==========================================
app.post('/api/verify-payment', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing required payment details for verification' });
        }

        // Generate the expected signature using the Secret Key
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        // Compare signatures securely
        if (expectedSignature === razorpay_signature) {
            console.log(`[Verification] Payment SUCCESS! Order ID: ${razorpay_order_id}, Payment ID: ${razorpay_payment_id}`);
            // Note: Fulfill order in database here
            return res.status(200).json({ status: 'success', message: 'Payment verified successfully' });
        } else {
            console.error(`[Verification] FAILED! Signature mismatch for Order ID: ${razorpay_order_id}`);
            return res.status(400).json({ status: 'failure', error: 'Payment signature verification failed' });
        }

    } catch (error) {
        console.error("Payment verification error:", error);
        return res.status(500).json({ error: 'Internal server error during verification' });
    }
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`Razorpay Server is running on port ${PORT}`);
});