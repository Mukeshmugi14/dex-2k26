import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema({
  registrationAmount: { type: Number, min: 1, default: 300 },
  upiId: { type: String, trim: true, default: "" },
  upiName: { type: String, trim: true, default: "DEXATHON 2026" },
  paymentEnabled: { type: Boolean, default: false },
  // Optional uploaded QR image (data URL). Never sent with the settings JSON; served by GET /api/payment-settings/qr.
  qrImage: { type: String, select: false },
  qrUpdatedAt: Date,
}, { timestamps: true });

export default mongoose.model("PaymentSettings", paymentSettingsSchema);
