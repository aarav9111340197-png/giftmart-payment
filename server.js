const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

console.log("===== BASEUPI DEBUG =====");
console.log("SECRET KEY loaded:", !!process.env.BASEUPI_SECRET_KEY);
console.log("=========================");

app.get("/", (req, res) => {
  res.json({ status: "Server Running ✅" });
});

// Using Official SDK (DNS issue bypass + better error handling)
let baseupi;
try {
  const { BaseUPI } = require('baseupi');
  baseupi = new BaseUPI({ secretKey: process.env.BASEUPI_SECRET_KEY });
  console.log("✅ BaseUPI SDK initialized");
} catch (e) {
  console.log("SDK load failed, using fallback");
}

app.post("/api/create-payment", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 2000) {
      return res.status(400).json({ success: false, error: "Minimum ₹2000 required" });
    }

    const orderId = `ORD${Date.now()}`;

    let result;

    if (baseupi) {
      // Official SDK use kar rahe hain
      result = await baseupi.orders.create({
        amountPaise: Number(amount) * 100,
        merchantOrderId: orderId,
      });
    } else {
      // Fallback (agar SDK fail ho)
      const axios = require('axios');
      const response = await axios.post("https://api.baseupi.com/api/v1/orders", {
        amountPaise: Number(amount) * 100,
        merchantOrderId: orderId,
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASEUPI_SECRET_KEY}`
        },
        timeout: 30000
      });
      result = response.data;
    }

    const paymentUrl = result.checkout_url || result.upi_deeplink || result.upiLink;

    return res.json({
      success: true,
      payment_url: paymentUrl,
      orderId: orderId
    });

  } catch (error) {
    console.error("BaseUPI Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Payment service mein temporary issue hai. 1-2 minute baad try karo."
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});