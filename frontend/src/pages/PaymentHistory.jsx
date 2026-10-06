import axios from "axios";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./PaymentHistory.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminPagination, AdminSkeleton, useDebouncedValue } from "../components/AdminListParts";

const apiUrl = API_URL;
const PAGE_SIZES = [20, 50, 100];
const EMAIL_POLL_MS = 2000;
const EMAIL_POLL_LIMIT = 30;
const FILTERS = [["all", "All"], ["success", "Successful"], ["pending", "Pending"], ["failed", "Failed"], ["confirmed", "Confirmed"], ["not-confirmed", "Not Confirmed"]];
const getPaymentCategory = (payment) => payment?.status === "Successful" ? "success" : payment?.status === "Failed" ? "failed" : "pending";
const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

function EmailState({ payment }) {
  const status = payment?.confirmationEmailStatus;
  if (status === "Sending") return <span className="payment-email sending">Email: Sending…</span>;
  if (status === "Sent") return <span className="payment-email sent">✓ Email sent</span>;
  if (status === "Failed") return <span className="payment-email failed">⚠ Email could not be sent</span>;
  return <span className="payment-email">Email: Not sent</span>;
}

// Memoized row: confirming or resending one payment only re-renders that row.
const PaymentRow = memo(function PaymentRow({ row, busy, onConfirm, onResend }) {
  const category = getPaymentCategory(row.payment);
  const confirmed = Boolean(row.payment?.confirmedAt);
  const sending = row.payment?.confirmationEmailStatus === "Sending";
  return <tr>
    <td>{confirmed ? <span className="confirmed-mark">✓ Confirmed</span>
      : busy ? <span className="confirming-mark">Confirming...</span>
        : <label className="confirm-checkbox"><input type="checkbox" checked={false} onChange={() => onConfirm(row)} disabled={!row.payment?.transactionId || category === "failed"} />Confirm Payment</label>}</td>
    <td><b>{row.teamName}</b><small>{row.teamId}</small></td>
    <td>{row.leader?.name || "—"}{row.leader?.email ? <small className="payment-head-email">{row.leader.email}</small> : null}</td>
    <td>{row.projectTheme ? <span className="payment-theme">{row.projectTheme}</span> : <span className="payment-theme is-empty">Not selected</span>}</td>
    <td>{row.college}</td>
    <td>₹{row.payment?.amount}</td>
    <td>{row.payment?.transactionId || "—"}</td>
    <td>
      <span className={`payment-status ${category}`}>{category === "success" ? "SUCCESS" : category === "failed" ? "FAILED" : "PENDING"}</span>
      {confirmed ? <small>Confirmed {formatDate(row.payment.confirmedAt)}<br />By {row.payment.confirmedBy}<br /><EmailState payment={row.payment} /></small> : null}
      {confirmed ? <button type="button" className="resend-email" disabled={sending || busy} onClick={() => onResend(row)}>{sending ? "Sending…" : "Resend Email"}</button> : null}
    </td>
    <td>{formatDate(row.payment?.paidAt || row.payment?.confirmedAt || row.createdAt)}</td>
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

  const logout = useCallback(() => { localStorage.removeItem("dexathon_admin_token"); localStorage.removeItem("dexathon_admin_profile"); navigate("/admin/login"); }, [navigate]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(`${apiUrl}/admin/payment-history`, { headers, params: { page, limit: pageSize, status: statusFilter, search: debouncedSearch } });
      setPayments(response.data.items);
      setSummary(response.data.summary);
      setPaging({ page: response.data.page, pages: response.data.pages, total: response.data.total });
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      setLoadError(error.response?.data?.message || "Unable to load payment history.");
    } finally {
      setLoading(false);
    }
  }, [headers, page, pageSize, statusFilter, debouncedSearch, logout]);

  useEffect(() => { loadPayments(); }, [loadPayments]);
  useEffect(() => { setPage(1); }, [statusFilter, debouncedSearch, pageSize]);
  useEffect(() => { const timers = pollers.current; return () => timers.forEach((timer) => clearTimeout(timer)); }, []);

  const replacePayment = useCallback((updated) => setPayments((current) => current.map((row) => (row._id === updated._id ? { ...row, ...updated, payment: { ...row.payment, ...updated.payment } } : row))), []);

  // While one row's email is "Sending", check only that row until it is Sent or Failed.
  const watchEmail = useCallback((id, attempt = 0) => {
    clearTimeout(pollers.current.get(id));
    if (attempt >= EMAIL_POLL_LIMIT) return;
    pollers.current.set(id, setTimeout(async () => {
      try {
        const { data } = await axios.get(`${apiUrl}/admin/payments/${id}/email-status`, { headers });
        replacePayment({ _id: id, payment: data });
        if (data.confirmationEmailStatus === "Sending") watchEmail(id, attempt + 1);
        else pollers.current.delete(id);
      } catch {
        watchEmail(id, attempt + 1);
      }
    }, EMAIL_POLL_MS));
  }, [headers, replacePayment]);

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
      setMessage({ ok: true, text: response.data.alreadyConfirmed ? "Payment was already confirmed." : "Payment confirmed successfully." });
      setConfirmTarget(null);
      if (response.data.registration?.payment?.confirmationEmailStatus === "Sending") watchEmail(target._id);
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      setMessage({ ok: false, text: error.response?.data?.message || "Unable to complete the action. Please try again." });
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
      setMessage({ ok: true, text: `${row.teamName}: sending the confirmation email…` });
      watchEmail(row._id);
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      if (error.response?.data?.registration) replacePayment(error.response.data.registration);
      else replacePayment({ _id: row._id, payment: { confirmationEmailStatus: row.payment?.confirmationEmailStatus } });
      setMessage({ ok: false, text: error.response?.data?.message || "Unable to resend the confirmation email. Please try again." });
    }
  }, [headers, replacePayment, watchEmail, logout]);

  const openConfirm = useCallback((row) => setConfirmTarget(row), []);

  const nav = <nav><AdminNav /></nav>;

  if (loadError && !payments.length && !loading) return <main className="payment-history"><section className="payment-history-error"><h1>Unable to load payment history.</h1><p>{loadError}</p><button type="button" onClick={loadPayments}>Retry</button></section></main>;

  return <main className="payment-history">
    <header><div><p>DEXATHON 2026 ADMIN</p><h1>Payment History</h1><span>Track and verify all registration payments.</span></div>{nav}</header>
    {message ? <p className={`payment-history-message ${message.ok ? "" : "is-error"}`} role="status">{message.text}</p> : null}
    <section className="payment-summary">{[["Total Payments", summary.total], ["Successful", summary.successful], ["Pending", summary.pending], ["Failed", summary.failed], ["Total Amount Received", `₹${summary.amount}`]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="payment-history-filters"><div className="payment-history-status">{FILTERS.map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}</div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Team / Team Head / Email / Transaction ID" /><label className="payment-page-size">Show <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select> per page</label></section>
    {loadError ? <p className="payment-history-message is-error">{loadError} <button type="button" className="resend-email" onClick={loadPayments}>Retry</button></p> : null}
    {loading && !payments.length ? <AdminSkeleton rows={6} /> : <div className={`payment-history-table ${loading ? "is-refreshing" : ""}`}><table><thead><tr><th>Select</th><th>Team</th><th>Team Head</th><th>Project Theme</th><th>College</th><th>Amount</th><th>Transaction ID</th><th>Status</th><th>Date</th></tr></thead><tbody>
      {payments.map((row) => <PaymentRow key={row._id} row={row} busy={busyId === row._id} onConfirm={openConfirm} onResend={resendEmail} />)}
    </tbody></table>{!payments.length ? <p className="payment-history-empty">{summary.total ? "No payment records match the selected filters." : "No payment records found."}</p> : null}</div>}
    <AdminPagination page={paging.page} pages={paging.pages} total={paging.total} limit={pageSize} onChange={setPage} label="payments" />
    {confirmTarget ? <div className="confirmation-overlay" role="dialog" aria-modal="true"><section><h2>Confirm Payment</h2><p>Are you sure you want to confirm this payment?</p><dl><div><dt>Team</dt><dd>{confirmTarget.teamName}</dd></div><div><dt>Amount</dt><dd>₹{confirmTarget.payment?.amount}</dd></div><div><dt>Transaction ID</dt><dd>{confirmTarget.payment?.transactionId}</dd></div></dl><footer><button type="button" onClick={() => setConfirmTarget(null)} disabled={Boolean(busyId)}>Cancel</button><button type="button" onClick={confirmPayment} disabled={Boolean(busyId)}>{busyId ? "Confirming..." : "Confirm Payment"}</button></footer></section></div> : null}
  </main>;
}
