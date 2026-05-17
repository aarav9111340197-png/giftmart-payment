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

let baseupiClient;

try {
  const BaseUPI = require('baseupi').default || require('baseupi');
  baseupiClient = new BaseUPI({
    secretKey: process.env.BASEUPI_SECRET_KEY
  });
  console.log("✅ BaseUPI SDK Loaded Successfully");
} catch (e) {
  console.log("❌ SDK Load Failed:", e.message);
}

app.post("/api/create-payment", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || Number(amount) < 2000) {
      return res.status(400).json({ 
        success: false, 
        error: "Minimum amount ₹2000 required" 
      });
    }

    const orderId = `ORD${Date.now()}`;

    let result;

    if (baseupiClient) {
      result = await baseupiClient.orders.create({
        amountPaise: Number(amount) * 100,
        merchantOrderId: orderId,
      });
    } else {
      throw new Error("SDK not loaded");
    }

    const paymentUrl = result.checkout_url || result.upi_deeplink || result.paymentLink || result.url;

    if (!paymentUrl) {
      throw new Error("No payment URL received");
    }

    return res.json({
      success: true,
      payment_url: paymentUrl,
      orderId: orderId
    });

  } catch (error) {
    console.error("BaseUPI Error:", error.message || error);
    return res.status(500).json({
      success: false,
      error: "Payment creation failed. Please try again later."
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});