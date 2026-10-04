import PaymentSettings from "../models/PaymentSettings.js";

const defaultSettings = {
  registrationAmount: 300,
  upiId: "",
  upiName: "DEXATHON 2026",
  paymentEnabled: false,
};
const MAX_QR_LENGTH = 1_500_000; // ~1.1 MB image
const QR_DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/;

const currentSettings = async () => {
  const settings = await PaymentSettings.findOne();
  if (settings) {
    if (settings.registrationAmount == null) {
      settings.registrationAmount = defaultSettings.registrationAmount;
      await settings.save();
    }
    return settings;
  }

  if (process.env.NODE_ENV === "production") return null;
  return PaymentSettings.create(defaultSettings);
};

// Public shape used by the Payment page and the admin form. The QR image itself is fetched separately (and cached).
const toView = (settings) => {
  const plain = settings?.toObject ? settings.toObject() : { ...defaultSettings, ...settings };
  delete plain.qrImage;
  return { ...plain, hasCustomQr: Boolean(plain.qrUpdatedAt), qrVersion: plain.qrUpdatedAt ? new Date(plain.qrUpdatedAt).getTime() : null };
};

export const getPaymentSettings = async (_request, response) => response.json(toView((await currentSettings()) || defaultSettings));

export const getPaymentQr = async (request, response) => {
  const settings = await PaymentSettings.findOne({}, "+qrImage qrUpdatedAt").lean();
  const match = settings?.qrImage ? QR_DATA_URL.exec(settings.qrImage) : null;
  if (!match) return response.status(404).end();
  const etag = `"qr-${new Date(settings.qrUpdatedAt || 0).getTime()}"`;
  response.setHeader("ETag", etag);
  response.setHeader("Cache-Control", "public, max-age=3600");
  if (request.headers["if-none-match"] === etag) return response.status(304).end();
  response.setHeader("Content-Type", match[1]);
  return response.send(Buffer.from(match[2], "base64"));
};

export const updatePaymentSettings = async (request, response) => {
  const { registrationAmount, upiId, upiName, paymentEnabled, qrImage, removeQr } = request.body;
  const amount = Number(registrationAmount);
  const normalizedUpiId = typeof upiId === "string" ? upiId.trim() : "";
  const normalizedUpiName = typeof upiName === "string" ? upiName.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return response.status(400).json({ success: false, message: "Enter a valid registration amount." });
  }
  if (!normalizedUpiName) {
    return response.status(400).json({ success: false, message: "UPI display name is required." });
  }
  if (normalizedUpiId && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/.test(normalizedUpiId)) {
    return response.status(400).json({ success: false, message: "Enter a valid UPI ID, e.g. name@bank." });
  }
  if (paymentEnabled === true && !normalizedUpiId) {
    return response.status(400).json({ success: false, message: "A UPI ID is required to enable payments." });
  }
  if (qrImage !== undefined && qrImage !== null && (typeof qrImage !== "string" || !QR_DATA_URL.test(qrImage) || qrImage.length > MAX_QR_LENGTH)) {
    return response.status(400).json({ success: false, message: "The QR code must be a PNG or JPG image up to about 1 MB." });
  }

  const update = {
    $set: { registrationAmount: amount, upiId: normalizedUpiId, upiName: normalizedUpiName, paymentEnabled: paymentEnabled === true },
  };
  if (qrImage) Object.assign(update.$set, { qrImage, qrUpdatedAt: new Date() });
  else if (removeQr === true) update.$unset = { qrImage: "", qrUpdatedAt: "" };

  const settings = await PaymentSettings.findOneAndUpdate({}, update, { new: true, upsert: true, setDefaultsOnInsert: true });
  console.log(`Payment settings updated by ${request.admin?.username || "admin"} (${request.admin?.role || "?"}).`);
  return response.json({ success: true, message: "Payment settings updated successfully.", settings: toView(settings) });
};
