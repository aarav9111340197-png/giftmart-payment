const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Debug logs (Render check ke liye)
console.log("===== BASEUPI DEBUG =====");
console.log("API KEY:", process.env.BASEUPI_API_KEY ? "LOADED" : "MISSING");
console.log("SECRET KEY:", process.env.BASEUPI_SECRET_KEY ? "LOADED" : "MISSING");
console.log("=========================");

// Health check route
app.get("/", (req, res) => {
  res.json({ status: "Server Running" });
});

// PAYMENT ROUTE
app.post("/api/create-payment", async (req, res) => {
  try {
    const { amount, orderId } = req.body;

    if (!amount || !orderId) {
      return res.status(400).json({ error: "Amount and Order ID required" });
    }

    // BaseUPI API request
    const response = await axios.post(
      "https://api.baseupi.app/payment/create",
      {
        amount,
        orderId
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

    // IMPORTANT: Always return JSON
    return res.json({
      success: true,
      payment: response.data
    });

  } catch (error) {
    console.log("BaseUPI Error:", error.response?.data || error.message);

    // IMPORTANT FIX: never return HTML
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error || "Payment creation failed"
    });
  }
});

// 404 handler (IMPORTANT - fixes <!DOCTYPE html> issue)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found"
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`BaseUPI Server running on port ${PORT}`);
});