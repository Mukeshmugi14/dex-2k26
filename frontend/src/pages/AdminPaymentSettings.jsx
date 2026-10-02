import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./AdminPaymentSettings.css";
import { API_URL } from "../config/api";

const apiUrl = API_URL;

const emptySettings = {
  registrationAmount: 300,
  upiId: "",
  upiName: "DEXATHON 2026",
  paymentEnabled: false,
};

const normalizeSettings = (settings) => ({
  registrationAmount: Number(settings?.registrationAmount) > 0 ? Number(settings.registrationAmount) : emptySettings.registrationAmount,
  upiId: typeof settings?.upiId === "string" ? settings.upiId : emptySettings.upiId,
  upiName: typeof settings?.upiName === "string" && settings.upiName.trim() ? settings.upiName : emptySettings.upiName,
  paymentEnabled: settings?.paymentEnabled === true,
});

export default function AdminPaymentSettings() {
  const [form, setForm] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const token = localStorage.getItem("dexathon_admin_token");
  const hasUpiId = Boolean(form.upiId.trim());
  const qrLink = useMemo(
    () => `upi://pay?pa=${encodeURIComponent(form.upiId.trim())}&pn=${encodeURIComponent(form.upiName.trim())}&am=${form.registrationAmount}&cu=INR`,
    [form],
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(`${apiUrl}/payment-settings`);
      setForm(normalizeSettings(response.data?.settings ?? response.data));
    } catch {
      setForm(emptySettings);
      setLoadError("Unable to load payment settings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveMessage("");
  };

  const save = async (event) => {
    event.preventDefault();
    setSaveMessage("");

    if (form.paymentEnabled && !hasUpiId) {
      setSaveMessage("Enter a UPI ID before enabling payments.");
      return;
    }

    setSaving(true);
    try {
      const response = await axios.put(
        `${apiUrl}/admin/payment-settings`,
        {
          registrationAmount: Number(form.registrationAmount),
          upiId: form.upiId.trim(),
          upiName: form.upiName.trim(),
          paymentEnabled: form.paymentEnabled,
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setForm(normalizeSettings(response.data?.settings ?? response.data));
      setSaveMessage(response.data?.message || "Payment settings updated successfully.");
    } catch {
      setSaveMessage("Unable to save payment settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("dexathon_admin_token");
    window.location.assign("/admin/login");
  };

  return (
    <main className="payment-settings">
      <aside className="payment-settings-sidebar">
        <b>DEXATHON ADMIN</b>
        <Link to="/admin/dashboard">Dashboard</Link>
        <Link to="/admin/payment-history">Payment History</Link>
        <Link to="/admin/payment-settings">Payment Settings</Link>
        <button type="button" onClick={logout}>Logout</button>
      </aside>
      <section className="payment-settings-content">
        <header className="payment-settings-heading">
          <p>PAYMENT SETTINGS</p>
          <h1>Configure registration payment details</h1>
        </header>
        {loading ? <p className="settings-state">Loading payment settings...</p> : null}
        {loadError ? <div className="settings-state settings-error"><p>{loadError}</p><button type="button" onClick={loadSettings}>Retry</button></div> : null}
        {!loading && !loadError ? (
          <div className="settings-grid">
            <form className="settings-form" onSubmit={save}>
              <h2>Payment configuration</h2>
              <label>
                Registration Amount
                <span className="amount-input"><span>₹</span><input type="number" min="1" step="1" value={form.registrationAmount} onChange={(event) => update("registrationAmount", event.target.value)} required /></span>
              </label>
              <label>
                UPI ID
                <input value={form.upiId} onChange={(event) => update("upiId", event.target.value)} placeholder="Enter UPI ID" required={form.paymentEnabled} />
              </label>
              <label>
                UPI Display Name
                <input value={form.upiName} onChange={(event) => update("upiName", event.target.value)} placeholder="DEXATHON 2026" required />
              </label>
              <label className="payment-toggle">
                <span>Payment Enabled</span>
                <input type="checkbox" checked={form.paymentEnabled} onChange={(event) => update("paymentEnabled", event.target.checked)} />
                <strong>{form.paymentEnabled ? "ON" : "OFF"}</strong>
              </label>
              <button className="save-settings" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
              {saveMessage ? <p className="settings-message" role="status">{saveMessage}</p> : null}
            </form>
            <section className="settings-qr" aria-label="UPI QR Preview">
              <h2>UPI QR Preview</h2>
              {hasUpiId ? (
                <>
                  <QRCodeSVG value={qrLink} size={190} includeMargin />
                  <strong>{form.upiName}</strong>
                  <small>{form.upiId}</small>
                </>
              ) : <p>Enter a UPI ID to generate QR</p>}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
