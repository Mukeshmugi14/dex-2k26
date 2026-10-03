import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./PaymentHistory.css";
import { API_URL } from "../config/api";

const apiUrl = API_URL;
const getPaymentCategory = (payment) => payment?.status === "Successful" ? "success" : payment?.status === "Failed" ? "failed" : "pending";
const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";
const getPaymentRecords = (data) => Array.isArray(data) ? data : Array.isArray(data?.payments) ? data.payments : Array.isArray(data?.data) ? data.data : [];

export default function PaymentHistory() {
  const [payments, setPayments] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadPayments = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(`${apiUrl}/admin/payment-history`, { headers });
      const records = getPaymentRecords(response.data);
      if (!Array.isArray(records)) throw new Error("The payment history response was invalid.");
      setPayments(records);
    } catch (error) {
      setPayments([]);
      setLoadError(error.response?.data?.message || "Unable to load payment history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayments(); }, []);

  const summary = useMemo(() => {
    const successful = payments.filter((row) => getPaymentCategory(row.payment) === "success");
    return {
      total: payments.length,
      successful: successful.length,
      pending: payments.filter((row) => getPaymentCategory(row.payment) === "pending").length,
      failed: payments.filter((row) => getPaymentCategory(row.payment) === "failed").length,
      amount: successful.reduce((total, row) => total + (Number(row.payment?.amount) || 0), 0),
    };
  }, [payments]);

  const visiblePayments = useMemo(() => payments.filter((row) => {
    const category = getPaymentCategory(row.payment);
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.teamName, row.teamId, row.leader?.name, row.college, row.payment?.transactionId].some((value) => value?.toLowerCase().includes(term));
    return (statusFilter === "all" || category === statusFilter) && matchesSearch;
  }), [payments, search, statusFilter]);

  const replacePayment = (registration) => setPayments((current) => current.map((row) => row._id === registration._id ? registration : row));
  const confirmPayment = async () => {
    if (!confirmTarget) return;
    setSaving(true);
    try {
      const response = await axios.put(`${apiUrl}/admin/payments/${confirmTarget._id}/confirm`, {}, { headers });
      replacePayment(response.data.registration);
      setMessage(response.data.message);
      setConfirmTarget(null);
    } catch (error) {
      setMessage(error.response?.data?.message || "Unable to confirm payment.");
    } finally {
      setSaving(false);
    }
  };
  const resendEmail = async (row) => {
    try {
      const response = await axios.post(`${apiUrl}/admin/payments/${row._id}/resend-email`, {}, { headers });
      replacePayment(response.data.registration);
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error.response?.data?.message || "Unable to resend confirmation email.");
    }
  };
  const logout = () => { localStorage.removeItem("dexathon_admin_token"); navigate("/admin/login"); };

  if (loadError) return <main className="payment-history"><section className="payment-history-error"><h1>Unable to load payment history.</h1><p>{loadError}</p><button type="button" onClick={loadPayments}>Retry</button></section></main>;

  return <main className="payment-history">
    <header><div><p>DEXATHON 2026 ADMIN</p><h1>Payment History</h1><span>Track and verify all registration payments.</span></div><nav><Link to="/admin/dashboard">Dashboard</Link><Link to="/admin/payment-history">Payment History</Link><Link to="/admin/teams">Teams</Link><Link to="/admin/pdf-submissions">PDF Submissions</Link><Link to="/admin/rounds">Round Status</Link><Link to="/admin/round-selection">Round Selection</Link><Link to="/admin/payment-settings">Payment Settings</Link><button type="button" onClick={logout}>Logout</button></nav></header>
    {message ? <p className="payment-history-message">{message}</p> : null}
    <section className="payment-summary">{[["Total Payments", summary.total], ["Successful", summary.successful], ["Pending", summary.pending], ["Failed", summary.failed], ["Total Amount Received", `₹${summary.amount}`]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="payment-history-filters"><div className="payment-history-status">{[["all", "All"], ["success", "Successful"], ["pending", "Pending"], ["failed", "Failed"]].map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}</div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Team / Transaction ID" /></section>
    {loading ? <p className="payment-history-loading">Loading payment history...</p> : <div className="payment-history-table"><table><thead><tr><th>Select</th><th>Team</th><th>Team Head</th><th>College</th><th>Amount</th><th>Transaction ID</th><th>Status</th><th>Date</th></tr></thead><tbody>{visiblePayments.map((row) => { const category = getPaymentCategory(row.payment); const confirmed = Boolean(row.payment?.confirmedAt); return <tr key={row._id}><td>{confirmed ? <span className="confirmed-mark">Payment Confirmed</span> : <label className="confirm-checkbox"><input type="checkbox" checked={false} onChange={() => setConfirmTarget(row)} disabled={!row.payment?.transactionId || category === "failed"} />Confirm Payment</label>}</td><td><b>{row.teamName}</b><small>{row.teamId}</small></td><td>{row.leader?.name || "—"}</td><td>{row.college}</td><td>₹{row.payment?.amount}</td><td>{row.payment?.transactionId || "—"}</td><td><span className={`payment-status ${category}`}>{category === "success" ? "SUCCESS" : category === "failed" ? "FAILED" : "PENDING"}</span>{confirmed ? <small>Confirmed {formatDate(row.payment.confirmedAt)}<br />By {row.payment.confirmedBy}<br />Email: {row.payment.confirmationEmailStatus}</small> : null}{confirmed ? <button type="button" className="resend-email" onClick={() => resendEmail(row)}>Resend Email</button> : null}</td><td>{formatDate(row.payment?.paidAt || row.payment?.confirmedAt || row.createdAt)}</td></tr>; })}</tbody></table>{!visiblePayments.length ? <p className="payment-history-empty">{payments.length ? "No payment records match the selected filters." : "No payment records found."}</p> : null}</div>}
    {confirmTarget ? <div className="confirmation-overlay" role="dialog" aria-modal="true"><section><h2>Confirm Payment</h2><p>Are you sure you want to confirm this payment?</p><dl><div><dt>Team</dt><dd>{confirmTarget.teamName}</dd></div><div><dt>Amount</dt><dd>₹{confirmTarget.payment?.amount}</dd></div><div><dt>Transaction ID</dt><dd>{confirmTarget.payment?.transactionId}</dd></div></dl><footer><button type="button" onClick={() => setConfirmTarget(null)} disabled={saving}>Cancel</button><button type="button" onClick={confirmPayment} disabled={saving}>{saving ? "Confirming..." : "Confirm Payment"}</button></footer></section></div> : null}
  </main>;
}
