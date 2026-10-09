import axios from "axios";
import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PaymentHistory.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminPagination, AdminSkeleton, useDebouncedValue } from "../components/AdminListParts";

const apiUrl = API_URL;
const PAGE_SIZES = [20, 50, 100];
const EMAIL_POLL_MS = 2000;
const EMAIL_POLL_LIMIT = 75; // 2.5 minutes: longer than the slowest possible send, so the final status is always shown
const FILTERS = [["all", "All"], ["success", "Successful"], ["pending", "Pending"], ["failed", "Failed"], ["confirmed", "Verified"], ["not-confirmed", "Not Verified"]];
const COLUMNS = ["Team", "Team Head", "Email", "Project Theme", "Amount", "Transaction ID", "Payment Status", "Date", "Actions"];

// Safe display helpers: older or incomplete records never break the table.
const text = (value, fallback = "N/A") => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : fallback);
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "N/A";
};
const formatAmount = (value) => (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? `₹${Number(value).toLocaleString("en-IN")}` : "N/A");
const getPaymentCategory = (payment) => (payment?.status === "Successful" ? "success" : payment?.status === "Failed" ? "failed" : "pending");
const emailFailure = (payment) => payment?.confirmationEmailError || "The email could not be sent.";

function EmailState({ payment }) {
  const status = payment?.confirmationEmailStatus;
  if (status === "Sending") return <span className="payment-email sending">Email: SENDING…</span>;
  if (status === "Sent") return <span className="payment-email sent">Email: ✓ SENT</span>;
  if (status === "Failed") return <span className="payment-email failed" title={emailFailure(payment)}>Email: ⚠ FAILED — {emailFailure(payment).split(/(?<=\.)\s/)[0]}</span>;
  return <span className="payment-email">Email: Not sent</span>;
}

// One broken record shows a notice in its own row instead of blanking the whole table.
class RowBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("Payment History: could not display record", this.props.id, error); }
  render() {
    if (this.state.failed) return <tr className="payment-row-error"><td colSpan={COLUMNS.length}>This payment record could not be displayed{this.props.id ? ` (ID ${this.props.id})` : ""}. Other records are unaffected.</td></tr>;
    return this.props.children;
  }
}

// Memoized row: confirming or resending one payment only re-renders that row.
const PaymentRow = memo(function PaymentRow({ row, busy, onConfirm, onResend }) {
  const payment = row.payment || {};
  const category = getPaymentCategory(payment);
  const confirmed = Boolean(payment.confirmedAt);
  const sending = payment.confirmationEmailStatus === "Sending";
  const canVerify = Boolean(payment.transactionId) && category !== "failed";
  return <tr>
    <td data-label="Team"><b>{text(row.teamName)}</b><small>{text(row.teamId, "")}</small>{row.college ? <small>{row.college}</small> : null}</td>
    <td data-label="Team Head">{text(row.leader?.name)}</td>
    <td data-label="Email" className="payment-email-cell">{text(row.leader?.email)}</td>
    <td data-label="Project Theme">{row.projectTheme ? <span className="payment-theme">{row.projectTheme}</span> : <span className="payment-theme is-empty">N/A</span>}</td>
    <td data-label="Amount">{formatAmount(payment.amount)}</td>
    <td data-label="Transaction ID" className="payment-txn">{text(payment.transactionId)}</td>
    <td data-label="Payment Status">
      <span className={`payment-status ${category}`}>{category === "success" ? "SUCCESS" : category === "failed" ? "FAILED" : "PENDING"}</span>
      {confirmed
        ? <small className="payment-verified">✓ Verified {formatDate(payment.confirmedAt)}{payment.confirmedBy ? <> · by {payment.confirmedBy}</> : null}<br /><EmailState payment={payment} /></small>
        : <small className="payment-unverified">Not verified</small>}
    </td>
    <td data-label="Date">{formatDate(payment.paidAt || payment.confirmedAt || row.createdAt)}</td>
    <td data-label="Actions" className="payment-actions">
      {confirmed
        ? <button type="button" className="resend-email" disabled={sending || busy} onClick={() => onResend(row)}>{sending ? "Sending…" : "Resend Confirmation Email"}</button>
        : busy ? <span className="confirming-mark">Verifying…</span>
          : <button type="button" className="verify-payment" onClick={() => onConfirm(row)} disabled={!canVerify} title={canVerify ? "Verify this payment" : payment.transactionId ? "Failed payments cannot be verified" : "No transaction ID submitted yet"}>Verify Payment</button>}
    </td>
  </tr>;
});

export default function PaymentHistory() {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({ total: 0, successful: 0, pending: 0, failed: 0, amount: 0 });
  const [paging, setPaging] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const pollers = useRef(new Map());
  const intents = useRef(new Map()); // id -> { kind: "confirm" | "resend", teamName, email }

  const logout = useCallback(() => { localStorage.removeItem("dexathon_admin_token"); localStorage.removeItem("dexathon_admin_profile"); navigate("/admin/login"); }, [navigate]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(`${apiUrl}/admin/payment-history`, { headers, params: { page, limit: pageSize, status: statusFilter, search: debouncedSearch, from: dateFrom || undefined, to: dateTo || undefined } });
      const data = response.data || {};
      const items = Array.isArray(data.items) ? data.items.filter((row) => row && typeof row === "object") : [];
      if (!Array.isArray(data.items)) console.error("Payment History: unexpected response from the server", data);
      setPayments(items);
      setSummary({ total: 0, successful: 0, pending: 0, failed: 0, amount: 0, ...(data.summary || {}) });
      setPaging({ page: data.page || 1, pages: data.pages || 1, total: data.total || items.length });
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      console.error("Payment History: failed to load", { status: error.response?.status, response: error.response?.data, error: error.message });
      setLoadError(error.response
        ? `${error.response.data?.message || "Failed to fetch payment history."}${error.response.data?.error ? ` (${error.response.data.error})` : ""}`
        : "Unable to reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [headers, page, pageSize, statusFilter, debouncedSearch, dateFrom, dateTo, logout]);

  useEffect(() => { loadPayments(); }, [loadPayments]);
  useEffect(() => { setPage(1); }, [statusFilter, debouncedSearch, pageSize, dateFrom, dateTo]);
  useEffect(() => { const timers = pollers.current; return () => timers.forEach((timer) => clearTimeout(timer)); }, []);

  const replacePayment = useCallback((updated) => {
    if (!updated?._id) return;
    setPayments((current) => current.map((row) => (row._id === updated._id ? { ...row, ...updated, payment: { ...(row.payment || {}), ...(updated.payment || {}) } } : row)));
  }, []);

  // Final message once the background email finishes (Sent or Failed).
  const reportEmailResult = useCallback((id, payment) => {
    const intent = intents.current.get(id);
    intents.current.delete(id);
    if (!intent) return;
    const to = intent.email ? ` to ${intent.email}` : "";
    if (payment.confirmationEmailStatus === "Sent") {
      setMessage({ ok: true, lines: intent.kind === "confirm" ? ["✓ Payment verified successfully.", `✓ Confirmation email sent successfully${to}.`] : [`✓ Confirmation email sent successfully${to}.`] });
    } else if (payment.confirmationEmailStatus === "Failed") {
      setMessage({ ok: intent.kind === "confirm", lines: intent.kind === "confirm"
        ? ["Payment verified successfully, but confirmation email could not be sent.", "Please use Resend Confirmation Email.", `Reason: ${emailFailure(payment)}`]
        : ["Confirmation email could not be sent.", "Please use Resend Confirmation Email to try again.", `Reason: ${emailFailure(payment)}`] });
    }
  }, []);

  // While one row's email is "Sending", check only that row until it is Sent or Failed.
  const watchEmail = useCallback((id, attempt = 0) => {
    clearTimeout(pollers.current.get(id));
    if (attempt >= EMAIL_POLL_LIMIT) { pollers.current.delete(id); intents.current.delete(id); setMessage({ ok: false, text: "The email server did not respond in time. Use Refresh to see the final status, then Resend Confirmation Email if needed." }); return; }
    pollers.current.set(id, setTimeout(async () => {
      try {
        const { data } = await axios.get(`${apiUrl}/admin/payments/${id}/email-status`, { headers });
        replacePayment({ _id: id, payment: data });
        if (data.confirmationEmailStatus === "Sending") watchEmail(id, attempt + 1);
        else { pollers.current.delete(id); reportEmailResult(id, data); }
      } catch {
        watchEmail(id, attempt + 1);
      }
    }, EMAIL_POLL_MS));
  }, [headers, replacePayment, reportEmailResult]);

  const confirmPayment = async () => {
    if (!confirmTarget || busyId) return;
    const target = confirmTarget;
    setBusyId(target._id);
    setMessage(null);
    try {
      const response = await axios.put(`${apiUrl}/admin/payments/${target._id}/confirm`, {}, { headers });
      replacePayment(response.data.registration);
      if (!response.data.alreadyConfirmed && target.payment?.status !== "Successful") {
        const wasFailed = target.payment?.status === "Failed";
        setSummary((current) => ({ ...current, successful: current.successful + 1, pending: wasFailed ? current.pending : current.pending - 1, failed: wasFailed ? current.failed - 1 : current.failed, amount: current.amount + (Number(target.payment?.amount) || 0) }));
      }
      setConfirmTarget(null);
      // The backend waits for Brevo and returns the real email result (Sent / Failed) with the verified payment.
      const emailPayment = response.data.registration?.payment;
      const emailStatus = emailPayment?.confirmationEmailStatus;
      if (response.data.alreadyConfirmed) {
        setMessage({ ok: true, text: "Payment was already verified." });
      } else if (emailStatus === "Sent" || emailStatus === "Failed") {
        intents.current.set(target._id, { kind: "confirm", teamName: target.teamName, email: target.leader?.email });
        reportEmailResult(target._id, emailPayment);
      } else if (emailStatus === "Sending") {
        intents.current.set(target._id, { kind: "confirm", teamName: target.teamName, email: target.leader?.email });
        setMessage({ ok: true, lines: ["✓ Payment verified successfully.", "Sending the confirmation email…"] });
        watchEmail(target._id);
      } else {
        setMessage({ ok: true, text: "✓ Payment verified successfully." });
      }
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      setMessage({ ok: false, text: error.response?.data?.message || "Unable to verify the payment. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const resendEmail = useCallback(async (row) => {
    setMessage(null);
    replacePayment({ _id: row._id, payment: { confirmationEmailStatus: "Sending" } });
    try {
      const response = await axios.post(`${apiUrl}/admin/payments/${row._id}/resend-email`, {}, { headers });
      replacePayment(response.data.registration);
      intents.current.set(row._id, { kind: "resend", teamName: row.teamName, email: row.leader?.email });
      const emailPayment = response.data.registration?.payment;
      if (emailPayment?.confirmationEmailStatus === "Sending") { setMessage({ ok: true, text: `${text(row.teamName, "Team")}: sending the confirmation email…` }); watchEmail(row._id); }
      else reportEmailResult(row._id, emailPayment || {});
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      const failedPayment = error.response?.data?.registration?.payment;
      if (error.response?.data?.registration) replacePayment(error.response.data.registration);
      else replacePayment({ _id: row._id, payment: { confirmationEmailStatus: row.payment?.confirmationEmailStatus } });
      if (failedPayment?.confirmationEmailStatus === "Failed") {
        // Brevo did not accept the email: show the real reason (the payment stays verified).
        intents.current.set(row._id, { kind: "resend", teamName: row.teamName, email: row.leader?.email });
        reportEmailResult(row._id, failedPayment);
      } else {
        setMessage({ ok: false, text: error.response?.data?.message || "Unable to resend the confirmation email. Please try again." });
      }
    }
  }, [headers, replacePayment, watchEmail, reportEmailResult, logout]);

  const openConfirm = useCallback((row) => setConfirmTarget(row), []);
  const refresh = () => { loadPayments(); };
  const clearDates = () => { setDateFrom(""); setDateTo(""); };

  const nav = <nav><AdminNav /></nav>;

  if (loadError && !payments.length && !loading) return <main className="payment-history"><header><div><p>DEXATHON 2026 ADMIN</p><h1>Payment History</h1></div>{nav}</header><section className="payment-history-error"><h1>Unable to load payment history.</h1><p>{loadError}</p><button type="button" onClick={refresh}>Retry</button></section></main>;

  return <main className="payment-history">
    <header><div><p>DEXATHON 2026 ADMIN</p><h1>Payment History</h1><span>Track and verify all registration payments.</span></div>{nav}</header>
    {message ? <p className={`payment-history-message ${message.ok ? "" : "is-error"}`} role="status">{message.lines ? message.lines.map((line) => <span key={line}>{line}</span>) : message.text}</p> : null}
    <section className="payment-summary">{[["Total Payments", summary.total], ["Successful", summary.successful], ["Pending", summary.pending], ["Failed", summary.failed], ["Total Amount Received", formatAmount(summary.amount)]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value ?? 0}</strong></article>)}</section>
    <section className="payment-history-filters">
      <div className="payment-history-status">{FILTERS.map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Team / Team Head / Email / Theme / Transaction ID" aria-label="Search payments" />
      <div className="payment-date-filter">
        <label>From <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>To <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
        {dateFrom || dateTo ? <button type="button" className="resend-email" onClick={clearDates}>Clear dates</button> : null}
      </div>
      <div className="payment-filter-tools">
        <label className="payment-page-size">Show <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select> per page</label>
        <button type="button" className="payment-refresh" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
      </div>
    </section>
    {loadError ? <p className="payment-history-message is-error">{loadError} <button type="button" className="resend-email" onClick={loadPayments}>Retry</button></p> : null}
    {loading && !payments.length ? <AdminSkeleton rows={6} /> : <div className={`payment-history-table ${loading ? "is-refreshing" : ""}`}><table><thead><tr>{COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
      {payments.map((row, index) => <RowBoundary key={row._id || `row-${index}`} id={row._id}><PaymentRow row={row} busy={busyId === row._id} onConfirm={openConfirm} onResend={resendEmail} /></RowBoundary>)}
    </tbody></table>{!payments.length ? <p className="payment-history-empty">{summary.total ? "No payment records match the selected filters." : "No payment records found."}</p> : null}</div>}
    <AdminPagination page={paging.page} pages={paging.pages} total={paging.total} limit={pageSize} onChange={setPage} label="payments" />
    {confirmTarget ? <div className="confirmation-overlay" role="dialog" aria-modal="true"><section><h2>Verify Payment</h2><p>Are you sure you want to verify this payment? The team will be emailed a confirmation.</p><dl><div><dt>Team</dt><dd>{text(confirmTarget.teamName)}</dd></div><div><dt>Amount</dt><dd>{formatAmount(confirmTarget.payment?.amount)}</dd></div><div><dt>Transaction ID</dt><dd>{text(confirmTarget.payment?.transactionId)}</dd></div></dl><footer><button type="button" onClick={() => setConfirmTarget(null)} disabled={Boolean(busyId)}>Cancel</button><button type="button" onClick={confirmPayment} disabled={Boolean(busyId)}>{busyId ? "Verifying…" : "Verify Payment"}</button></footer></section></div> : null}
  </main>;
}
