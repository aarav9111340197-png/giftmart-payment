const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Debug logs
console.log("===== BASEUPI DEBUG =====");
console.log("API KEY:", process.env.BASEUPI_API_KEY ? "LOADED" : "MISSING");
console.log("SECRET KEY:", process.env.BASEUPI_SECRET_KEY ? "LOADED" : "MISSING");
console.log("=========================");

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Server Running ✅" });
});

// PAYMENT ROUTE - Updated for your frontend
app.post("/api/create-payment", async (req, res) => {
  try {
    let { amount, currency, item_name } = req.body;

    if (!amount) {
      return res.status(400).json({ 
        success: false, 
        error: "Amount is required" 
      });
    }

    // Auto generate Order ID if not provided
    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    console.log(`Creating payment: Amount=₹${amount}, OrderID=${orderId}`);

    // BaseUPI API Call
    const response = await axios.post(
      "https://api.baseupi.app/payment/create",
      {
        amount: Number(amount),
        orderId: orderId,
        // currency: currency || "INR",     // agar BaseUPI support kare to uncomment kar sakte hain
        // description: item_name
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASEUPI_API_KEY}`,
          "x-secret-key": process.env.BASEUPI_SECRET_KEY
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      payment_url: response.data.payment_url || response.data.url, // BaseUPI ke hisaab se adjust kar lena
      orderId: orderId
    });

  } catch (error) {
    console.error("BaseUPI Error:", error.response?.data || error.message);
    
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || "Payment creation failed"
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BaseUPI Server running on port ${PORT}`);
});