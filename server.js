const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

console.log("===== BASEUPI DEBUG =====");
console.log("API KEY:", !!process.env.BASEUPI_API_KEY);
console.log("SECRET KEY:", !!process.env.BASEUPI_SECRET_KEY);
console.log("=========================");

app.get("/", (req, res) => {
  res.json({ status: "Server Running ✅" });
});

app.post("/api/create-payment", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 2000) {
      return res.status(400).json({ success: false, error: "Minimum ₹2000 required" });
    }

    const orderId = `ORD${Date.now()}`;

    const payload = {
      amountPaise: Number(amount) * 100,
      merchantOrderId: orderId,
    };

    console.log("→ Calling BaseUPI with:", payload);

    const response = await axios.post(
      "https://api.baseupi.com/api/v1/orders",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASEUPI_SECRET_KEY}`
        },
        timeout: 25000
      }
    );

    const paymentUrl = response.data.checkout_url || 
                       response.data.upi_deeplink || 
                       response.data.upiLink;

    return res.json({
      success: true,
      payment_url: paymentUrl,
      orderId
    });

  } catch (error) {
    console.error("BaseUPI Error Details:", {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });

    return res.status(500).json({
      success: false,
      error: error.code === 'ENOTFOUND' 
        ? "BaseUPI se connect nahi ho pa raha (DNS issue)" 
        : (error.response?.data?.message || error.message)
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Running on ${PORT}`));