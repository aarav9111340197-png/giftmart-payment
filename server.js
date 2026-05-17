const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// DEBUG (safe)
console.log("BASEUPI API KEY:", process.env.BASEUPI_API_KEY ? "LOADED" : "MISSING");
console.log("BASEUPI SECRET:", process.env.BASEUPI_SECRET_KEY ? "LOADED" : "MISSING");

// CREATE PAYMENT
app.post("/create-payment", async (req, res) => {
    try {
        const { amount, orderId } = req.body;

        if (!amount) {
            return res.status(400).json({ error: "Amount required" });
        }

        const response = await axios.post(
            "https://api.baseupi.app/v1/payment/create", // ⚠️ confirm endpoint from docs
            {
                amount: amount,
                order_id: orderId || "ORDER_" + Date.now(),
                currency: "INR"
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.BASEUPI_API_KEY}`,
                    "x-secret-key": process.env.BASEUPI_SECRET_KEY
                }
            }
        );

        return res.json({
            payment_url: response.data.payment_url || response.data.url,
            success: true
        });

    } catch (error) {
        console.error("BaseUPI Error:", error.response?.data || error.message);

        return res.status(500).json({
            error: error.response?.data || "Payment creation failed"
        });
    }
});

// WEBHOOK (optional)
app.post("/webhooks/baseupi", (req, res) => {
    console.log("Webhook received:", req.body);
    res.sendStatus(200);
});

// SERVER START
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});