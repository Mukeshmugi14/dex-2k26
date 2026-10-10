import crypto from "crypto";
import mongoose from "mongoose";
import { Readable } from "stream";
import Registration from "../models/Registration.js";

export const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;
const BUCKET_NAME = "submissions";

// --- Secret per-team submission links -------------------------------------------------------
// Each team has ONE permanent link: token = HMAC(server secret, registration id + random per-team salt).
// Re-sending the confirmation email therefore always reproduces the same working link.
// Only the salt and a SHA-256 hash of the token are stored, never the token itself.

const getLinkSecret = () => process.env.SUBMISSION_LINK_SECRET || process.env.JWT_SECRET || "dexathon-submission-link";

export const hashSubmissionToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const deriveToken = (registrationId, salt) => crypto.createHmac("sha256", getLinkSecret()).update(`${registrationId}:${salt}`).digest("base64url");

// Returns the team's permanent submission token. The salt is created atomically exactly once, so concurrent or repeated
// confirmation emails can never produce different links. Writes directly to the database (no document save needed).
export const issueSubmissionToken = async (registrationId) => {
  const _id = new mongoose.Types.ObjectId(String(registrationId));
  const noSalt = { _id, $or: [{ "pdfSubmission.linkSalt": { $exists: false } }, { "pdfSubmission.linkSalt": null }] };
  await Registration.collection.updateOne(noSalt, [{
    $set: {
      "pdfSubmission.linkSalt": crypto.randomBytes(16).toString("hex"),
      "pdfSubmission.legacyTokenHash": "$pdfSubmission.tokenHash", // keep any link issued by the earlier scheme working
    },
  }]);
  const stored = await Registration.collection.findOne({ _id }, { projection: { pdfSubmission: 1 } });
  const token = deriveToken(_id, stored.pdfSubmission.linkSalt);
  await Registration.collection.updateOne({ _id }, { $set: { "pdfSubmission.tokenHash": hashSubmissionToken(token), "pdfSubmission.tokenIssuedAt": stored.pdfSubmission.tokenIssuedAt || new Date() } });
  return token;
};

export const tokenLookupQuery = (token) => {
  const hash = hashSubmissionToken(token);
  return { $or: [{ "pdfSubmission.tokenHash": hash }, { "pdfSubmission.legacyTokenHash": hash }] };
};
export const isWellFormedToken = (token) => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

// The public site URL used in emails: SITE_URL if set, otherwise the first https origin allowed for CORS.
// Public site used in every email link. Never a local/dev address: SITE_URL if set, else the first https origin
// allowed for CORS, else the deployed DEXATHON site.
const DEPLOYED_SITE_URL = "https://dexathon.in";
export const getSiteUrl = () => {
  if (process.env.SITE_URL) return process.env.SITE_URL.trim().replace(/\/+$/, "");
  const httpsOrigin = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
    .flatMap((value) => (value || "").split(","))
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .find((origin) => origin.startsWith("https://"));
  return httpsOrigin || DEPLOYED_SITE_URL;
};

// Team Head Portal access shared by the login check and the emails.
export const getTeamLoginUrl = () => {
  if (process.env.TEAM_LOGIN_URL) return process.env.TEAM_LOGIN_URL.trim().replace(/\/+$/, "");
  if (process.env.SITE_URL) return `${process.env.SITE_URL.trim().replace(/\/+$/, "")}/team-login`;
  return "https://dexathon.vercel.app/team-login";
};
export const getTeamPortalPassword = () => process.env.TEAM_PORTAL_PASSWORD || "Dexathon@2026";

export const buildSubmissionUrl = (token) => `${getSiteUrl()}/submit-document/${token}`;

// --- Submission status --------------------------------------------------------------------

export const deriveSubmissionStatus = (registration) => {
  if (!registration.pdfSubmission?.fileId) return "Pending";
  const result = registration.evaluation?.result;
  if (result === "Selected" || result === "Not Selected") return result;
  if (registration.evaluation?.evaluatedAt) return "Under Review";
  return "Submitted";
};

// --- PDF storage (MongoDB GridFS) ------------------------------------------------------------

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });

export const isPdfBuffer = (buffer) => Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";

export const storePdf = (buffer, fileName, registrationId) => new Promise((resolve, reject) => {
  const upload = getBucket().openUploadStream(fileName, { metadata: { registrationId: String(registrationId), contentType: "application/pdf" } });
  Readable.from(buffer).pipe(upload).on("error", reject).on("finish", () => resolve(upload.id));
});

export const deletePdf = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(new mongoose.Types.ObjectId(String(fileId)));
  } catch (error) {
    console.error("Unable to delete previous PDF submission:", error.message);
  }
};

export const openPdfStream = (fileId) => getBucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));

// Keep only safe characters in file names used in headers and storage.
export const safePdfFileName = (name) => {
  const base = String(name || "submission").replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9 ._-]+/g, "").trim().slice(0, 80) || "submission";
  return `${base}.pdf`;
};
