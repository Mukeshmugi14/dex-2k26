import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./PaymentPage.css";
import { API_URL } from "../config/api";
import { PAYMENT_SETTINGS_KEY, readSessionJson, REGISTRATION_KEY } from "../config/session";

const apiUrl = API_URL;

const buildUpiPaymentUri = (settings) => {
  const registrationAmount = Number(settings?.registrationAmount);
  if (!settings?.upiId || !settings?.upiName || !Number.isFinite(registrationAmount) || registrationAmount <= 0) return "";

  return `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.upiName)}&am=${encodeURIComponent(registrationAmount)}&cu=INR`;
};

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registrationId = sessionStorage.getItem("dexathon_registration_id");
  // Render immediately from the registration handed over by the Register page and the cached payment settings.
  const [registration, setRegistration] = useState(() => {
    const handedOver = location.state?.registration || readSessionJson(REGISTRATION_KEY);
    return handedOver?._id && handedOver._id === registrationId ? handedOver : null;
  });
  const [settings, setSettings] = useState(() => readSessionJson(PAYMENT_SETTINGS_KEY));
  const [transactionId, setTransactionId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const record = useMemo(() => (registration && settings
    ? { ...registration, payment: { ...registration.payment, amount: settings.registrationAmount ?? registration.payment.amount } }
    : null), [registration, settings]);

  useEffect(() => {
    if (!registrationId) { navigate("/register", { replace: true }); return; }
    const showError = () => setMessage("Unable to load payment details. Please try again.");
    axios.get(`${apiUrl}/payment-settings`)
      .then((response) => { setSettings(response.data); sessionStorage.setItem(PAYMENT_SETTINGS_KEY, JSON.stringify(response.data)); })
      .catch(showError);
    if (!registration) axios.get(`${apiUrl}/registrations/${registrationId}`).then((response) => setRegistration(response.data)).catch(showError);
    // Only refetch when the registration changes, not when it is filled in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, registrationId]);

  const paymentLink = useMemo(() => buildUpiPaymentUri(settings), [settings]);
  const trimmedTransactionId = transactionId.trim();
  const canSubmit = trimmedTransactionId.length > 0 && !submitting;
  const submitTransaction = async (event) => {
    event.preventDefault();
    if (!trimmedTransactionId) {
      setMessage("Please enter your Transaction ID to continue.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await axios.post(`${apiUrl}/payment/upi-transaction`, { registrationId, transactionId: trimmedTransactionId });
      const submittedRegistration = response.data.registration || record;
      navigate("/thank-you", {
        replace: true,
        state: {
          record: {
            ...submittedRegistration,
            payment: {
              ...submittedRegistration.payment,
              amount: record?.payment?.amount ?? submittedRegistration.payment?.amount,
            },
          },
          transactionId: trimmedTransactionId,
        },
      });
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || "Unable to submit the transaction ID.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!record || !settings) return <main className="payment-page"><p>{message || "Loading payment…"}</p></main>;
  if (!settings?.paymentEnabled || !settings.upiId) return <main className="payment-page"><section className="payment-card"><span>DEXATHON 2026</span><h1>Payments unavailable</h1><p>Payment settings have not been enabled by the event administrator.</p></section></main>;

  return <main className="payment-page"><section className="payment-card"><span>DEXATHON 2026</span><h1>Registration Payment</h1><div className="payment-details"><p><b>Team Name</b>{record.teamName}</p><p><b>Team ID</b>{record.teamId}</p><p><b>College</b>{record.college}</p><p><b>Team Members</b>{record.members.length} Members</p></div><h2>₹{record.payment.amount}</h2><section className="upi-card"><div><b>Pay Using UPI</b><small>UPI ID</small><strong>{settings.upiId}</strong><small>{settings.upiName}</small></div><a className="upi-link" href={paymentLink}>Open UPI App</a></section><section className="qr-card"><b>Scan & Pay</b><QRCodeSVG value={paymentLink} size={180} includeMargin /><small>Scan this QR code using your UPI app</small></section><p className="app-list">Google Pay · PhonePe · Paytm · Other UPI Apps</p><form className="transaction-form" onSubmit={submitTransaction}><label>Transaction ID<input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Enter UPI transaction ID" required /></label><button type="submit" disabled={!canSubmit} aria-disabled={!canSubmit}>{submitting ? "Submitting…" : "Submit for Verification"}</button></form>{message && <p className="payment-message">{message}</p>}</section></main>;
}
