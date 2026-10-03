import mongoose from "mongoose";
export const SUBMISSION_STATUSES = ["Pending", "Submitted", "Under Review", "Selected", "Not Selected"];
export const EVALUATION_RESULTS = ["Pending", "Selected", "Not Selected"];
export const ROUND_STATUSES = ["PENDING", "COMPLETED", "LIVE", "SELECTED", "NOT_SELECTED", "UPCOMING"];
export const ROUND_DECISIONS = ["PENDING", "SELECTED", "REJECTED"];
const roundResultSchema = new mongoose.Schema({
  status: { type: String, enum: ROUND_DECISIONS, default: "PENDING" },
  decidedAt: Date,
  decidedBy: String,
  emailSent: { type: Boolean, default: false },
  emailStatus: { type: String, enum: ["Not Sent", "Sending", "Sent", "Failed"], default: "Not Sent" },
  emailedStatus: String, // the decision the team was last emailed about
  emailSentAt: Date,
  emailAttemptAt: Date,
}, { _id: false });
const memberSchema = new mongoose.Schema({ name: String, email: String, phone: String, studentId: String }, { _id: false });
const registrationSchema = new mongoose.Schema({ teamId: { type: String, unique: true }, registrationNumber: { type: String, unique: true }, teamName: String, teamLogo: String, college: String, collegeType: { type: String, enum: ["sathyabama", "other"] }, collegeName: String, department: String, year: String, leader: { name: String, email: String, phone: String }, members: [memberSchema], mentor: { name: String, email: String, phone: String }, payment: { status: { type: String, enum: ["Pending", "Awaiting Verification", "Successful", "Failed", "Refunded"], default: "Pending" }, amount: { type: Number, default: 300 }, orderId: String, paymentId: String, transactionId: String, upiId: String, paidAt: Date, confirmedAt: Date, confirmedBy: String, confirmationEmailStatus: { type: String, enum: ["Not Sent", "Sending", "Sent", "Failed"], default: "Not Sent" }, confirmationEmailSentAt: Date, confirmationEmailAttemptAt: Date },
  // Second-round PDF submission. The file lives in the "submissions" GridFS bucket; only a hash of the team's secret link token is stored.
  pdfSubmission: {
    tokenHash: { type: String, index: true, select: false },
    legacyTokenHash: { type: String, index: true, sparse: true, select: false },
    linkSalt: { type: String, select: false },
    tokenIssuedAt: Date,
    fileId: mongoose.Schema.Types.ObjectId,
    fileName: String,
    fileSize: Number,
    submittedAt: Date,
    status: { type: String, enum: SUBMISSION_STATUSES, default: "Pending" },
  },
  evaluation: {
    criterion1: Number,
    criterion2: Number,
    criterion3: Number,
    criterion4: Number,
    totalScore: Number,
    result: { type: String, enum: EVALUATION_RESULTS, default: "Pending" },
    evaluatedAt: Date,
    evaluatedBy: String,
  },
  // Second-round selection email (sent only for "Selected"), tracked so it is never sent twice by accident.
  selectionEmailSent: { type: Boolean, default: false },
  selectionEmailStatus: { type: String, enum: ["Not Sent", "Sending", "Sent", "Failed"], default: "Not Sent" },
  selectionEmailSentAt: Date,
  selectionEmailAttemptAt: Date,
  // Official round progress, set only by Admin and shown read-only in the Team Head Portal.
  rounds: {
    round1: { type: String, enum: ROUND_STATUSES, default: "PENDING" },
    round2: { type: String, enum: ROUND_STATUSES, default: "UPCOMING" },
    round3: { type: String, enum: ROUND_STATUSES, default: "UPCOMING" },
    scoreReleased: { type: Boolean, default: false },
    updatedAt: Date,
    updatedBy: String,
  },
  // Per-round Select/Reject decisions from Admin → Round Selection, each with its own result-email tracking.
  roundResults: {
    round1: { type: roundResultSchema, default: () => ({}) },
    round2: { type: roundResultSchema, default: () => ({}) },
    round3: { type: roundResultSchema, default: () => ({}) },
  },
  // Round-update email tracking: the status combination last emailed, so the same update is never emailed twice.
  roundEmail: {
    status: { type: String, enum: ["Not Sent", "Sending", "Sent", "Failed"], default: "Not Sent" },
    sentSnapshot: String,
    sentAt: Date,
    attemptAt: Date,
  },
}, { timestamps: true });

// Never send submission-link secrets in any API response.
export const stripLinkSecrets = (_doc, ret) => {
  if (ret.pdfSubmission) {
    delete ret.pdfSubmission.tokenHash;
    delete ret.pdfSubmission.legacyTokenHash;
    delete ret.pdfSubmission.linkSalt;
  }
  return ret;
};
registrationSchema.set("toJSON", { transform: stripLinkSecrets });

// Indexes for the admin lists (sorted by newest, filtered by payment state).
registrationSchema.index({ createdAt: -1 });
registrationSchema.index({ "payment.status": 1, createdAt: -1 });
registrationSchema.index({ "payment.confirmedAt": -1 });

export default mongoose.model("Registration", registrationSchema);
