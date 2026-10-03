import axios from "axios";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import "./SubmitDocument.css";
import { API_URL } from "../config/api";

const MB = 1024 * 1024;
const formatSize = (bytes) => (bytes >= MB / 10 ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// A real PDF starts with "%PDF-"; this rejects renamed images, documents, videos or archives before uploading.
const hasPdfSignature = (file) => file.slice(0, 5).text().then((head) => head === "%PDF-").catch(() => false);

function TeamDetails({ info }) {
  return <dl className="submit-doc-details">
    <div><dt>Team Name</dt><dd>{info.teamName}</dd></div>
    <div><dt>Team Head</dt><dd>{info.teamHead}</dd></div>
    <div><dt>Team Head Email</dt><dd>{info.teamHeadEmail}</dd></div>
  </dl>;
}

export default function SubmitDocument() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    axios.get(`${API_URL}/submissions/${encodeURIComponent(token)}`)
      .then((response) => setInfo(response.data))
      .catch((requestError) => setLoadError(requestError.response?.status === 404
        ? requestError.response.data?.message || "This submission link is invalid."
        : "Unable to load your submission details. Please check your connection and refresh the page."));
  }, [token]);

  const maxSize = info?.maxFileSize || 5 * MB;
  const maxLabel = `${Math.round((maxSize / MB) * 10) / 10} MB`;

  const chooseFile = async (chosen) => {
    setError("");
    setFile(null);
    if (!chosen) return;
    const reject = (message) => { setError(message); if (inputRef.current) inputRef.current.value = ""; };
    if (chosen.type !== "application/pdf" || !/\.pdf$/i.test(chosen.name)) return reject("Only PDF files are allowed.");
    if (chosen.size > maxSize) return reject(`File size must not exceed ${maxLabel}.`);
    if (!(await hasPdfSignature(chosen))) return reject("Only PDF files are allowed. This file is not a valid PDF document.");
    setFile(chosen);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file || uploading) return;
    const body = new FormData();
    body.append("pdf", file);
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/submissions/${encodeURIComponent(token)}`, body, {
        onUploadProgress: (progressEvent) => { if (progressEvent.total) setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100)); },
      });
      setInfo(response.data);
      setJustSubmitted(true);
      setFile(null);
    } catch (requestError) {
      if (requestError.response?.data?.alreadySubmitted) { setInfo((current) => ({ ...current, submitted: true })); return; }
      setError(requestError.response?.data?.message || "Upload failed. Please check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  const card = (content) => <main className="submit-doc"><section className="submit-doc-card"><span className="submit-doc-kicker">DEXATHON 2026</span><h1>Second Round PDF Submission</h1>{content}</section></main>;

  if (loadError) return card(<p className="submit-doc-error">{loadError}</p>);
  if (!info) return card(<p className="submit-doc-muted">Loading your team details…</p>);

  if (info.submitted) return card(<>
    <TeamDetails info={info} />
    <div className={`submit-doc-result ${justSubmitted ? "success" : "done"}`} role="status">
      <CheckCircle2 size={28} />
      {justSubmitted
        ? <div><b>PDF submitted successfully.</b><span>Your submission has been received successfully.</span></div>
        : <div><b>PDF Already Submitted</b><span>Your team has already submitted the PDF.</span></div>}
    </div>
    {info.submission ? <p className="submit-doc-file-note"><FileText size={15} /> {info.submission.fileName} · {formatSize(info.submission.fileSize)} · {formatDate(info.submission.submittedAt)}</p> : null}
  </>);

  return card(<>
    <TeamDetails info={info} />
    <form onSubmit={submit} noValidate>
      <span className="submit-doc-label">Upload your PDF</span>
      <label className={`submit-doc-drop ${file ? "has-file" : ""} ${error ? "has-error" : ""}`}>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event.target.files[0])} disabled={uploading} />
        {file ? <FileText size={26} /> : <UploadCloud size={26} />}
        <em>Choose PDF</em>
        <span>Maximum file size: {maxLabel}<br />Accepted format: PDF only</span>
      </label>

      {file ? <dl className="submit-doc-chosen"><div><dt>File</dt><dd>{file.name}</dd></div><div><dt>Size</dt><dd>{formatSize(file.size)}</dd></div></dl> : null}
      {error ? <p className="submit-doc-error" role="alert">{error}</p> : null}
      {uploading ? <div className="submit-doc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /><span>Uploading… {progress}%</span></div> : null}

      <button type="submit" disabled={!file || uploading}>{uploading ? "Submitting…" : "Submit PDF"}</button>
    </form>
  </>);
}
