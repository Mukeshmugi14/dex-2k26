import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { ImageUp, RotateCcw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminPaymentSettings.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { clearAdminSession, getAdminToken } from "../config/adminSession";

const apiUrl = API_URL;
const MAX_QR_SIDE = 800;
const UPI_ID = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/;

const emptySettings = { registrationAmount: 300, upiId: "", upiName: "DEXATHON 2026", paymentEnabled: false, hasCustomQr: false, qrVersion: null };

const normalizeSettings = (settings) => ({
  registrationAmount: Number(settings?.registrationAmount) > 0 ? Number(settings.registrationAmount) : emptySettings.registrationAmount,
  upiId: typeof settings?.upiId === "string" ? settings.upiId : emptySettings.upiId,
  upiName: typeof settings?.upiName === "string" && settings.upiName.trim() ? settings.upiName : emptySettings.upiName,
  paymentEnabled: settings?.paymentEnabled === true,
  hasCustomQr: settings?.hasCustomQr === true,
  qrVersion: settings?.qrVersion ?? null,
});

// Keep uploaded QR codes crisp but reasonably small: only downscale images larger than MAX_QR_SIDE.
const readQrImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onload = () => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => {
      const scale = Math.min(1, MAX_QR_SIDE / Math.max(image.width, image.height));
      if (scale === 1) { resolve(reader.result); return; }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function AdminPaymentSettings() {
  const [form, setForm] = useState(emptySettings);
  const [newQr, setNewQr] = useState(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [qrError, setQrError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const token = getAdminToken();
  const hasUpiId = Boolean(form.upiId.trim());
  const qrLink = useMemo(
    () => `upi://pay?pa=${encodeURIComponent(form.upiId.trim())}&pn=${encodeURIComponent(form.upiName.trim())}&am=${form.registrationAmount}&cu=INR`,
    [form.upiId, form.upiName, form.registrationAmount],
  );
  const showUploadedQr = Boolean(newQr) || (form.hasCustomQr && !removeQr);
  const uploadedQrSrc = newQr?.src || `${apiUrl}/payment-settings/qr?v=${form.qrVersion}`;

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

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaveMessage(null); };

  const chooseQr = async (file) => {
    setQrError("");
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 2 * 1024 * 1024) { setQrError("Choose a PNG or JPG image up to 2 MB."); return; }
    try {
      const src = await readQrImage(file);
      if (src.length > 1_500_000) { setQrError("This image is too large. Please use a smaller QR image."); return; }
      setNewQr({ name: file.name, src });
      setRemoveQr(false);
      setSaveMessage(null);
    } catch {
      setQrError("That image could not be read.");
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaveMessage(null);
    const amount = Number(form.registrationAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setSaveMessage({ ok: false, text: "Enter a valid payment amount." }); return; }
    if (form.upiId.trim() && !UPI_ID.test(form.upiId.trim())) { setSaveMessage({ ok: false, text: "Enter a valid UPI ID, e.g. name@bank." }); return; }
    if (form.paymentEnabled && !hasUpiId) { setSaveMessage({ ok: false, text: "Enter a UPI ID before enabling payments." }); return; }

    setSaving(true);
    try {
      const response = await axios.put(`${apiUrl}/admin/payment-settings`, {
        registrationAmount: amount,
        upiId: form.upiId.trim(),
        upiName: form.upiName.trim(),
        paymentEnabled: form.paymentEnabled,
        ...(newQr ? { qrImage: newQr.src } : removeQr ? { removeQr: true } : {}),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setForm(normalizeSettings(response.data?.settings ?? response.data));
      setNewQr(null);
      setRemoveQr(false);
      setSaveMessage({ ok: true, text: response.data?.message || "Payment settings updated successfully." });
    } catch (error) {
      if (error.response?.status === 401) { clearAdminSession(); navigate("/admin/login"); return; }
      setSaveMessage({ ok: false, text: error.response?.status === 403 ? "Your account can't change payment settings." : error.response?.data?.message || "Unable to save payment settings. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="payment-settings">
      <aside className="payment-settings-sidebar">
        <b>DEXATHON ADMIN</b>
        <AdminNav />
      </aside>
      <section className="payment-settings-content">
        <header className="payment-settings-heading">
          <p>PAYMENT SETTINGS</p>
          <h1>Configure registration payment details</h1>
        </header>
        {loading ? <p className="settings-state">Loading payment settings...</p> : null}
        {loadError ? <div className="settings-state settings-error"><p>{loadError}</p><button type="button" onClick={loadSettings}>Retry</button></div> : null}
        {!loading && !loadError ? (
          <form className="settings-grid" onSubmit={save} noValidate>
            <section className="settings-form">
              <h2>UPI Settings</h2>
              <label>
                UPI ID
                <input value={form.upiId} onChange={(event) => update("upiId", event.target.value)} placeholder="example@upi" autoComplete="off" inputMode="email" />
              </label>
              <label>
                Payment Amount
                <span className="amount-input"><span>₹</span><input type="number" min="1" step="1" value={form.registrationAmount} onChange={(event) => update("registrationAmount", event.target.value)} /></span>
              </label>
              <label>
                UPI Display Name
                <input value={form.upiName} onChange={(event) => update("upiName", event.target.value)} placeholder="DEXATHON 2026" />
              </label>
              <label className="payment-toggle">
                <span>Payment Enabled</span>
                <input type="checkbox" checked={form.paymentEnabled} onChange={(event) => update("paymentEnabled", event.target.checked)} />
                <strong>{form.paymentEnabled ? "ON" : "OFF"}</strong>
              </label>
              <button type="submit" className="save-settings" disabled={saving}>{saving ? "Saving..." : "Save Payment Settings"}</button>
              {saveMessage ? <p className={`settings-message ${saveMessage.ok ? "" : "is-error"}`} role="status">{saveMessage.text}</p> : null}
            </section>

            <section className="settings-qr" aria-label="UPI QR Code">
              <h2>UPI QR Code</h2>
              {showUploadedQr ? <img className="settings-qr-image" src={uploadedQrSrc} alt="Uploaded UPI QR code" />
                : hasUpiId ? <QRCodeSVG value={qrLink} size={190} includeMargin /> : <p>Enter a UPI ID to generate a QR, or upload one.</p>}
              <strong>{form.upiName}</strong>
              {hasUpiId ? <small>{form.upiId}</small> : null}
              <span className="settings-qr-source">{newQr ? `New upload: ${newQr.name} (saved when you press Save)` : showUploadedQr ? "Using the uploaded QR code" : removeQr ? "Will switch to the generated QR when you press Save" : "Generated automatically from the UPI ID and amount"}</span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { chooseQr(event.target.files[0]); event.target.value = ""; }} />
              <div className="settings-qr-actions">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={saving}><ImageUp size={15} /> {form.hasCustomQr || newQr ? "Update QR" : "Upload QR"}</button>
                {newQr ? <button type="button" className="ghost" onClick={() => setNewQr(null)} disabled={saving}><Undo2 size={15} /> Undo</button> : null}
                {!newQr && form.hasCustomQr && !removeQr ? <button type="button" className="ghost" onClick={() => { setRemoveQr(true); setSaveMessage(null); }} disabled={saving}><RotateCcw size={15} /> Use generated QR</button> : null}
                {removeQr ? <button type="button" className="ghost" onClick={() => setRemoveQr(false)} disabled={saving}><Undo2 size={15} /> Keep uploaded QR</button> : null}
              </div>
              {qrError ? <p className="settings-message is-error" role="alert">{qrError}</p> : null}
              <p className="settings-qr-note">An uploaded QR should point to the same UPI ID. The generated QR already includes the payment amount.</p>
            </section>
          </form>
        ) : null}
      </section>
    </main>
  );
}
