const express = require("express");
const cors = require("cors");
const axios = require("axios");
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

    const payload = {
      amount_paise: Number(amount) * 100,      // ← Yeh change kiya hai (important)
      merchantOrderId: orderId,
    };

    console.log("BaseUPI Request Payload:", payload);

    const response = await axios.post(
      "https://api.baseupi.com/api/v1/orders",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASEUPI_SECRET_KEY}`
        },
        timeout: 30000
      }
    );

    console.log("BaseUPI Success Response:", response.data);

    const paymentUrl = response.data.checkout_url || 
                       response.data.upi_deeplink || 
                       response.data.paymentLink || 
                       response.data.url;

    if (!paymentUrl) {
      throw new Error("Payment URL not found in BaseUPI response");
    }

    return res.json({
      success: true,
      payment_url: paymentUrl,
      orderId: orderId
    });

  } catch (error) {
    console.error("🔴 BaseUPI Full Error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data || error.response
    });

    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || "Payment creation failed"
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});