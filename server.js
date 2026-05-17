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

// CREATE PAYMENT - Final Correct Version
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
      amountPaise: Number(amount) * 100,        // Paise mein convert
      merchantOrderId: orderId,
    };

    console.log("BaseUPI Request:", payload);

    const response = await axios.post(
      "https://api.baseupi.com/api/v1/orders",   // Correct Endpoint
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASEUPI_SECRET_KEY}`   // Secret Key
        },
        timeout: 20000
      }
    );

    const paymentUrl = response.data.checkoutUrl || 
                       response.data.upiLink || 
                       response.data.payment_url;

    return res.json({
      success: true,
      payment_url: paymentUrl,
      orderId: orderId
    });

  } catch (error) {
    console.error("BaseUPI Full Error:", error.response?.data || error.message);
    
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || "Payment creation failed"
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BaseUPI Server running on port ${PORT}`);
});