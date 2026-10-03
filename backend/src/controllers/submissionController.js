import multer from "multer";
import Registration from "../models/Registration.js";
import { deletePdf, deriveSubmissionStatus, isPdfBuffer, isWellFormedToken, MAX_PDF_SIZE_BYTES, safePdfFileName, storePdf, tokenLookupQuery } from "../services/submissionService.js";

const MAX_MB = Math.round((MAX_PDF_SIZE_BYTES / 1024 / 1024) * 10) / 10;
const INVALID_LINK = { success: false, message: "This submission link is invalid. Please use the link from your DEXATHON 2026 confirmation email." };
const ALREADY_SUBMITTED = { success: false, alreadySubmitted: true, message: "Your team has already submitted the PDF." };

const findByToken = (token) => (isWellFormedToken(token) ? Registration.findOne(tokenLookupQuery(token)) : null);

// Only what the team needs to see on its own submission page (read-only details from registration).
const toPublicView = (registration) => ({
  teamName: registration.teamName,
  teamHead: registration.leader?.name || "",
  teamHeadEmail: registration.leader?.email || "",
  submitted: Boolean(registration.pdfSubmission?.fileId),
  submission: registration.pdfSubmission?.fileId ? { fileName: registration.pdfSubmission.fileName, fileSize: registration.pdfSubmission.fileSize, submittedAt: registration.pdfSubmission.submittedAt } : null,
  maxFileSize: MAX_PDF_SIZE_BYTES,
});

export const getSubmission = async (request, response) => {
  const registration = await findByToken(request.params.token);
  if (!registration) return response.status(404).json(INVALID_LINK);
  return response.json({ success: true, ...toPublicView(registration) });
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE_BYTES, files: 1, fields: 0 },
  fileFilter: (_request, file, callback) => {
    const isPdf = file.mimetype === "application/pdf" && /\.pdf$/i.test(file.originalname || "");
    callback(isPdf ? null : Object.assign(new Error("Only PDF files are allowed."), { status: 400 }), isPdf);
  },
}).single("pdf");

// Validates the link (and that nothing was submitted yet) before reading the upload; turns multer errors into clear messages.
export const receivePdf = async (request, response, next) => {
  const registration = await findByToken(request.params.token);
  if (!registration) return response.status(404).json(INVALID_LINK);
  if (registration.pdfSubmission?.fileId) return response.status(409).json(ALREADY_SUBMITTED);
  request.registration = registration;
  upload(request, response, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return response.status(413).json({ success: false, message: `File size must not exceed ${MAX_MB} MB.` });
    return response.status(400).json({ success: false, message: error.code ? "Upload a single PDF file." : error.message });
  });
};

export const submitPdf = async (request, response) => {
  const { registration, file } = request;
  if (!file) return response.status(400).json({ success: false, message: "Choose a PDF file to upload." });
  if (!isPdfBuffer(file.buffer)) return response.status(400).json({ success: false, message: "Only PDF files are allowed. This file is not a valid PDF document." });

  const fileName = safePdfFileName(file.originalname);
  const fileId = await storePdf(file.buffer, fileName, registration._id);
  const submittedAt = new Date();

  // Atomic: only the first submission for this team is recorded; a parallel duplicate is discarded.
  const result = await Registration.updateOne(
    { _id: registration._id, $or: [{ "pdfSubmission.fileId": { $exists: false } }, { "pdfSubmission.fileId": null }] },
    { $set: { "pdfSubmission.fileId": fileId, "pdfSubmission.fileName": fileName, "pdfSubmission.fileSize": file.size, "pdfSubmission.submittedAt": submittedAt, "pdfSubmission.status": "Submitted" } },
  );
  if (!result.modifiedCount) {
    await deletePdf(fileId);
    return response.status(409).json(ALREADY_SUBMITTED);
  }

  const updated = await Registration.findById(registration._id);
  console.log(`PDF submission received for ${registration._id} (${file.size} bytes).`);
  return response.status(201).json({ success: true, message: "PDF submitted successfully. Your submission has been received successfully.", ...toPublicView(updated), status: deriveSubmissionStatus(updated) });
};
