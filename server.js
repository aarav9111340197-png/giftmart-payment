const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Debug
console.log("===== BASEUPI DEBUG =====");
console.log("API KEY loaded:", !!process.env.BASEUPI_API_KEY);
console.log("SECRET KEY loaded:", !!process.env.BASEUPI_SECRET_KEY);
console.log("=========================");

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Server Running ✅", service: "BaseUPI" });
});

// CREATE PAYMENT
app.post("/api/create-payment", async (req, res) => {
  try {
    const { amount, item_name } = req.body;

    if (!amount || amount < 2000) {
      return res.status(400).json({ 
        success: false, 
        error: "Minimum amount ₹2000 required" 
      });
    }

    const orderId = `ORD${Date.now()}`;

    const payload = {
      amountPaise: Number(amount) * 100,     // Important: Paise mein convert
      merchantOrderId: orderId,
      // redirectUrl: "https://yourfrontend.com/success",  // optional
    };

    console.log("Sending to BaseUPI:", payload);

    const response = await axios.post(
      "https://api.baseupi.com/api/v1/orders",   // ← Correct URL
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASEUPI_SECRET_KEY}`   // ← Secret Key use hoti hai
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      payment_url: response.data.checkout_url || response.data.upi_deeplink,
      orderId: orderId,
      raw: response.data
    });

  } catch (error) {
    console.error("BaseUPI Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || "Payment creation failed"
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});