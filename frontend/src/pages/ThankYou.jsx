import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import "./ThankYou.css";

export default function ThankYou() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const record = state?.record;
  const transactionId = state?.transactionId || record?.payment?.transactionId;

  return (
    <main className="thank-you-page">
      <section className="thank-you-card">
        <CheckCircle2 className="thank-you-icon" size={58} aria-hidden="true" />
        <span>DEXATHON 2026</span>
        <h1>Thank You!</h1>
        <p>Your registration and payment details have been submitted successfully.</p>
        {record ? (
          <div className="thank-you-details">
            <p><b>Team Name</b><span>{record.teamName}</span></p>
            <p><b>Team Head</b><span>{record.leader?.name || "—"}</span></p>
            {record.projectTheme ? <p><b>Project Theme</b><span>{record.projectTheme}</span></p> : null}
            <p><b>Payment Amount</b><span>₹{record.payment?.amount}</span></p>
            <p><b>Payment Status</b><span>Submitted</span></p>
          </div>
        ) : null}
        {transactionId ? <p className="thank-you-transaction"><b>Your Transaction ID:</b><strong>{transactionId}</strong></p> : null}
        <button type="button" onClick={() => navigate("/")}><ArrowLeft size={16} /> Back to Home</button>
      </section>
    </main>
  );
}
