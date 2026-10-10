import axios from "axios";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Mail,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./TeamLists.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminPagination, AdminSkeleton, useDebouncedValue } from "../components/AdminListParts";

const apiUrl = API_URL;
const PAGE_SIZES = [20, 50, 100];
const PROJECT_THEMES = [
  "OPEN INNOVATION",
  "BLOCKCHAIN & CYBERSECURITY",
  "HEALTHCARE",
  "AI & MACHINE LEARNING",
  "SUSTAINABILITY DEVELOPMENT",
  "FINTECH & EDTECH",
];

const FILTERS = [
  ["all", "All Teams"],
  ["sent", "Email Sent ✓"],
  ["not-sent", "Email Not Sent"],
  ["sending", "Sending…"],
  ["failed", "Email Failed ⚠"],
];

export default function TeamLists() {
  const [teams, setTeams] = useState([]);
  const [summary, setSummary] = useState({ total: 0, sent: 0, notSent: 0, failed: 0, sending: 0 });
  const [paging, setPaging] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [colleges, setColleges] = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [emailStatusFilter, setEmailStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Modals state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState("");

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const logout = useCallback(() => {
    localStorage.removeItem("dexathon_admin_token");
    localStorage.removeItem("dexathon_admin_profile");
    navigate("/admin/login");
  }, [navigate]);

  // Load teams and statistics
  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/admin/team-lists`, {
        headers,
        params: {
          page,
          limit: pageSize,
          search: debouncedSearch,
          college: collegeFilter,
          theme: themeFilter,
          emailStatus: emailStatusFilter,
        },
      });
      setTeams(response.data.items || []);
      setSummary(response.data.summary || { total: 0, sent: 0, notSent: 0, failed: 0, sending: 0 });
      setPaging({ page: response.data.page, pages: response.data.pages, total: response.data.total });
    } catch (requestError) {
      if (requestError.response?.status === 401) logout();
      else setFeedback({ type: "error", message: "Unable to load team lists. Please try again." });
    } finally {
      setLoading(false);
    }
  }, [headers, page, pageSize, debouncedSearch, collegeFilter, themeFilter, emailStatusFilter, logout]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, collegeFilter, themeFilter, emailStatusFilter, pageSize]);

  useEffect(() => {
    axios
      .get(`${apiUrl}/admin/colleges`, { headers })
      .then((res) => setColleges(res.data.colleges || []))
      .catch(() => {});
  }, [headers]);

  // Handle Spreadsheet Upload & Import
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
        setImportError("Please choose a valid .xlsx, .xls, or .csv spreadsheet file.");
        setImportFile(null);
        return;
      }
      setImportFile(file);
      setImportError("");
      setImportResult(null);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile || importing) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await axios.post(`${apiUrl}/admin/team-lists/import`, formData, {
        headers: {
          ...headers,
          "Content-Type": "multipart/form-data",
        },
      });

      setImportResult(response.data);
      setFeedback({
        type: "success",
        message: response.data.message || "Spreadsheet imported successfully!",
      });
      loadTeams();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to process the spreadsheet file.";
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  // Handle Email Preview
  const openEmailPreview = async (team) => {
    setSelectedTeam(team);
    setPreviewLoading(true);
    setPreviewModalOpen(true);
    setPreviewData(null);

    try {
      const response = await axios.get(`${apiUrl}/admin/team-lists/${team._id}/email-preview`, { headers });
      setPreviewData(response.data);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Unable to generate email preview.",
      });
      setPreviewModalOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Send Confirmation Email
  const handleSendEmail = async (teamId, force = false) => {
    setSendingEmailId(teamId);
    try {
      const response = await axios.post(
        `${apiUrl}/admin/team-lists/${teamId}/send-email`,
        { force },
        { headers }
      );
      setFeedback({
        type: "success",
        message: response.data.message || "Confirmation email sent successfully!",
      });
      setPreviewModalOpen(false);
      loadTeams();
    } catch (err) {
      if (err.response?.status === 409) {
        if (window.confirm("Email was already sent to this team. Are you sure you want to resend?")) {
          return handleSendEmail(teamId, true);
        }
      } else {
        setFeedback({
          type: "error",
          message: err.response?.data?.message || "Failed to send confirmation email.",
        });
      }
    } finally {
      setSendingEmailId(null);
    }
  };

  // Open details modal
  const openTeamDetails = (team) => {
    setSelectedTeam(team);
    setDetailModalOpen(true);
  };

  return (
    <main className="team-lists">
      {/* Header bar */}
      <header className="team-lists-header">
        <div className="team-lists-brand">
          <span>DEXATHON 2026 &bull; ADMIN</span>
          <h1>Team Lists</h1>
        </div>

        <nav className="team-lists-nav-wrap">
          <AdminNav />
        </nav>

        <div className="team-lists-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setImportModalOpen(true);
              setImportResult(null);
              setImportError("");
              setImportFile(null);
            }}
          >
            <FileSpreadsheet size={16} />
            Upload Spreadsheet (.xlsx / .csv)
          </button>
          <button type="button" className="btn-secondary" onClick={loadTeams} title="Refresh team records">
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* Prominent Spreadsheet Upload Option Banner */}
      <section
        style={{
          background: "linear-gradient(135deg, rgba(31, 79, 224, 0.15), rgba(255, 90, 31, 0.15))",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "8px",
              background: "rgba(31, 79, 224, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#55caff",
              flexShrink: 0,
            }}
          >
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff" }}>
              Upload Team Spreadsheet (Excel / CSV)
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "3px" }}>
              Automatically form new teams from the sheet without duplication. Existing teams already on the site are left untouched.
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setImportModalOpen(true);
            setImportResult(null);
            setImportError("");
            setImportFile(null);
          }}
          style={{ whiteSpace: "nowrap" }}
        >
          <FileSpreadsheet size={16} />
          Choose .xlsx / .csv File
        </button>
      </section>

      {/* Feedback banner */}
      {feedback && (
        <div
          style={{
            padding: "12px 18px",
            marginBottom: "20px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: feedback.type === "success" ? "#14532d" : "#7f1d1d",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: "transparent", border: 0, color: "#fff", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary statistics bar */}
      <section className="team-lists-stats">
        <div className="team-stat-card">
          <small>Total Teams</small>
          <b>{summary.total}</b>
        </div>
        <div className="team-stat-card stat-sent">
          <small>Confirmation Sent</small>
          <b>{summary.sent}</b>
        </div>
        <div className="team-stat-card stat-pending">
          <small>Pending Send</small>
          <b>{summary.notSent}</b>
        </div>
        <div className="team-stat-card stat-failed">
          <small>Send Failed</small>
          <b>{summary.failed}</b>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="team-lists-filter-bar">
        <div className="filter-bar-header">
          <b>Filter & Search Teams</b>
          <span>{paging.total} records found</span>
        </div>

        <div className="filter-controls">
          <label>
            College
            <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
              <option value="all">All Colleges</option>
              <option value="sathyabama">Sathyabama Institute of Science and Technology</option>
              <option value="other">Other Colleges</option>
              {colleges
                .filter((c) => c && c.toLowerCase() !== "sathyabama institute of science and technology")
                .map((college) => (
                  <option key={college} value={college}>
                    {college}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Project Theme
            <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
              <option value="all">All Themes</option>
              {PROJECT_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </label>

          <label>
            Search
            <input
              placeholder="Search by Team Name, Leader, Email, Phone, Team ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="status-pill-filters">
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, marginRight: "4px" }}>
            EMAIL STATUS:
          </span>
          {FILTERS.map(([val, label]) => (
            <button
              type="button"
              key={val}
              className={emailStatusFilter === val ? "active" : ""}
              onClick={() => setEmailStatusFilter(val)}
            >
              {label}
            </button>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>Page size:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{
                height: "28px",
                padding: "0 8px",
                background: "#07111f",
                border: "1px solid #55caff33",
                borderRadius: "4px",
                color: "#fff",
                fontSize: "12px",
              }}
            >
              {PAGE_SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Main Teams Table */}
      {loading && !teams.length ? (
        <AdminSkeleton rows={8} />
      ) : (
        <>
          <div className="team-table-wrap" style={loading ? { opacity: 0.6 } : undefined}>
            <table className="team-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Team Head</th>
                  <th>Registered Email</th>
                  <th>Members</th>
                  <th>College & Dept</th>
                  <th>Email Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      No teams registered yet. Use <b>Import Google Sheet</b> to upload teams from Google Forms.
                    </td>
                  </tr>
                ) : (
                  teams.map((row) => {
                    const isSent = row.emailStatus === "Sent";
                    const isSending = row.emailStatus === "Sending";
                    const isFailed = row.emailStatus === "Failed";

                    return (
                      <tr key={row._id}>
                        <td>
                          <b style={{ color: "#ffffff", fontSize: "14px" }}>{row.teamName}</b>
                          <br />
                          <span className="team-id-badge">{row.teamId}</span>
                          {row.projectTheme ? (
                            <div>
                              <span className="team-theme-pill">{row.projectTheme}</span>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <strong style={{ color: "#ffffff" }}>{row.leader?.name || "—"}</strong>
                          {row.leader?.phone ? (
                            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                              📞 {row.leader.phone}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <a
                            href={`mailto:${row.leader?.email}`}
                            style={{ color: "#55caff", textDecoration: "none", fontWeight: 600 }}
                          >
                            {row.leader?.email || "—"}
                          </a>
                        </td>
                        <td>
                          <span className="member-count-badge">
                            Size: {row.teamSize || ((row.members || []).length + 1)} ({1 + (row.members || []).length})
                          </span>
                          <div className="member-names-sub">
                            {(row.members || []).map((m) => m.name).filter(Boolean).slice(0, 3).join(", ")}
                            {(row.members || []).length > 3 ? "..." : ""}
                          </div>
                        </td>
                        <td>
                          <span style={{ color: "#e2e8f0" }}>{row.college}</span>
                          {row.department ? (
                            <div style={{ fontSize: "11px", color: "#94a3b8" }}>{row.department}</div>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={`email-status-badge ${
                              isSent ? "sent" : isSending ? "sending" : isFailed ? "failed" : "not-sent"
                            }`}
                          >
                            {isSent ? "✓ SENT" : isSending ? "SENDING…" : isFailed ? "⚠ FAILED" : "Not Sent"}
                          </span>
                          {row.emailSentAt ? (
                            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "3px" }}>
                              {new Date(row.emailSentAt).toLocaleDateString()}
                            </div>
                          ) : null}
                          {isFailed && row.emailError ? (
                            <div style={{ fontSize: "11px", color: "#f87171", marginTop: "2px" }} title={row.emailError}>
                              {row.emailError.slice(0, 30)}...
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className={`btn-action-email ${isSent ? "is-resend" : ""}`}
                              onClick={() => openEmailPreview(row)}
                              disabled={sendingEmailId === row._id}
                            >
                              <Mail size={12} />
                              {isSent ? "Resend Email" : "Send Email"}
                            </button>
                            <button
                              type="button"
                              className="btn-action-view"
                              onClick={() => openTeamDetails(row)}
                            >
                              <Eye size={12} />
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <AdminPagination
            page={paging.page}
            pages={paging.pages}
            total={paging.total}
            limit={pageSize}
            onChange={setPage}
            label="teams"
          />
        </>
      )}

      {/* Spreadsheet Import Modal */}
      {importModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <header className="modal-header">
              <h2>Upload Team Spreadsheet (.xlsx, .xls, .csv)</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setImportModalOpen(false)}
                disabled={importing}
              >
                &times;
              </button>
            </header>

            <div className="modal-body">
              {!importResult ? (
                <form onSubmit={handleImportSubmit}>
                  <label
                    className="upload-dropzone"
                    htmlFor="spreadsheet-file-input"
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <input
                      id="spreadsheet-file-input"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      disabled={importing}
                    />
                    <div className="dropzone-icon">
                      <FileSpreadsheet size={40} />
                    </div>
                    <div className="dropzone-text">
                      {importFile ? (
                        <>
                          <strong>Selected: {importFile.name}</strong>
                          <span>{(importFile.size / 1024).toFixed(1)} KB &bull; Click to choose a different file</span>
                        </>
                      ) : (
                        <>
                          <strong>Click or drag Excel (.xlsx, .xls) or CSV (.csv) file here</strong>
                          <span>Supports Google Form responses exported as Excel or CSV</span>
                        </>
                      )}
                    </div>
                  </label>

                  {importError && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#7f1d1d22",
                        border: "1px solid #7f1d1d",
                        borderRadius: "6px",
                        color: "#f87171",
                        fontSize: "12px",
                        marginTop: "14px",
                      }}
                    >
                      {importError}
                    </div>
                  )}

                  <div style={{ marginTop: "18px", fontSize: "12px", color: "#94a3b8" }}>
                    <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#cbd5e1" }}>
                      Automatic Processing & Deduplication Rules:
                    </p>
                    <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: "1.6" }}>
                      <li><strong>Only new teams are added:</strong> Any team not already in the site will be automatically created.</li>
                      <li><strong>Existing teams kept untouched:</strong> Teams already in the site (matching leader email or team name) are left completely free without duplicate creation.</li>
                      <li><strong>Sequential Team IDs:</strong> Each new team is automatically assigned the next sequential ID (DEX26...) in order.</li>
                      <li><strong>Auto Column Detection:</strong> Reads Team Name, Leader Name, Email, Phone, College, Department, Year, Theme, and Members.</li>
                    </ul>
                  </div>

                  <div className="modal-footer" style={{ padding: "18px 0 0", borderTop: "none" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setImportModalOpen(false)}
                      disabled={importing}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={!importFile || importing}
                    >
                      {importing ? "Processing & Forming Teams..." : "Upload & Form Teams"}
                    </button>
                  </div>
                </form>
              ) : (
                /* Import Summary Screen */
                <div>
                  <div
                    style={{
                      padding: "14px 18px",
                      background: "#14532d22",
                      border: "1px solid #15803d",
                      borderRadius: "6px",
                      color: "#4ade80",
                      fontSize: "13px",
                      fontWeight: 700,
                      marginBottom: "16px",
                    }}
                  >
                    ✓ Spreadsheet Processed Without Duplication
                  </div>

                  <div className="import-summary-grid">
                    <div className="summary-tile">
                      <small>Total Rows</small>
                      <b>{importResult.summary?.totalRows || 0}</b>
                    </div>
                    <div className="summary-tile tile-imported">
                      <small>New Teams Formed</small>
                      <b>{importResult.summary?.importedCount || 0}</b>
                    </div>
                    <div className="summary-tile tile-updated">
                      <small>Already in Site (Kept Free)</small>
                      <b>{importResult.summary?.skippedCount ?? importResult.summary?.updatedCount ?? 0}</b>
                    </div>
                    <div className="summary-tile tile-duplicate">
                      <small>Duplicates in Sheet</small>
                      <b>{importResult.summary?.duplicateCount || 0}</b>
                    </div>
                    <div className="summary-tile tile-invalid">
                      <small>Invalid Rows</small>
                      <b>{importResult.summary?.invalidCount || 0}</b>
                    </div>
                  </div>

                  {importResult.invalidRecords?.length > 0 && (
                    <div style={{ marginTop: "18px" }}>
                      <strong style={{ fontSize: "12px", color: "#f87171" }}>
                        Invalid or Skipped Rows ({importResult.invalidRecords.length}):
                      </strong>
                      <div style={{ maxHeight: "150px", overflowY: "auto", marginTop: "6px" }}>
                        <table className="invalid-records-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Team Name</th>
                              <th>Email</th>
                              <th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.invalidRecords.map((rec, i) => (
                              <tr key={i}>
                                <td>{rec.row}</td>
                                <td>{rec.teamName}</td>
                                <td>{rec.email}</td>
                                <td style={{ color: "#f87171" }}>{rec.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="modal-footer" style={{ padding: "18px 0 0", borderTop: "none" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setImportModalOpen(false)}
                    >
                      Done & View Team Lists
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email Preview & Confirmation Modal */}
      {previewModalOpen && selectedTeam && (
        <div className="modal-backdrop">
          <div className="modal-dialog modal-dialog-large">
            <header className="modal-header">
              <div>
                <h2>Email Preview: {selectedTeam.teamName}</h2>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                  Recipient: <b style={{ color: "#55caff" }}>{selectedTeam.leader?.email}</b> &bull; User ID (Team ID):{" "}
                  <b style={{ color: "#4ade80" }}>{previewData?.teamId || selectedTeam.teamId}</b> &bull; Password:{" "}
                  <b style={{ color: "#ff7432" }}>Dexathon@2026</b>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPreviewModalOpen(false)}
              >
                &times;
              </button>
            </header>

            <div className="modal-body">
              {previewLoading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                  Generating live email preview...
                </div>
              ) : previewData ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "#06111f",
                      border: "1px solid #ffffff15",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  >
                    <div>
                      <span style={{ color: "#94a3b8" }}>Subject: </span>
                      <strong style={{ color: "#ffffff" }}>{previewData.subject}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#94a3b8" }}>Current Status: </span>
                      <strong
                        style={{
                          color: previewData.status === "Sent" ? "#4ade80" : "#fbbf24",
                        }}
                      >
                        {previewData.status}
                      </strong>
                    </div>
                  </div>

                  <div className="email-preview-frame">
                    <iframe
                      title="Email Preview"
                      srcDoc={previewData.html}
                      sandbox="allow-same-origin"
                    />
                  </div>
                </>
              ) : null}
            </div>

            <footer className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewModalOpen(false)}
                disabled={sendingEmailId === selectedTeam._id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleSendEmail(selectedTeam._id, previewData?.status === "Sent")}
                disabled={sendingEmailId === selectedTeam._id || previewLoading}
              >
                {sendingEmailId === selectedTeam._id
                  ? "Sending Email..."
                  : previewData?.status === "Sent"
                  ? "Resend Confirmation Email"
                  : "Send Confirmation Email Now"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Team Details Modal */}
      {detailModalOpen && selectedTeam && (
        <div className="modal-backdrop">
          <div className="modal-dialog modal-dialog-large">
            <header className="modal-header">
              <div>
                <h2>{selectedTeam.teamName}</h2>
                <div style={{ fontSize: "12px", color: "#55caff", marginTop: "2px" }}>
                  {selectedTeam.teamId} &bull; {selectedTeam.registrationNumber}
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setDetailModalOpen(false)}
              >
                &times;
              </button>
            </header>

            <div className="modal-body">
              <div className="details-section-grid">
                <div className="details-field">
                  <dt>Team Head Name</dt>
                  <dd>{selectedTeam.leader?.name || "—"}</dd>
                </div>
                <div className="details-field">
                  <dt>Team Head Email</dt>
                  <dd>{selectedTeam.leader?.email || "—"}</dd>
                </div>
                <div className="details-field">
                  <dt>Team Head Phone</dt>
                  <dd>{selectedTeam.leader?.phone || "—"}</dd>
                </div>
                <div className="details-field">
                  <dt>Selected Project Theme</dt>
                  <dd style={{ color: "#ff7432" }}>{selectedTeam.projectTheme || "OPEN INNOVATION"}</dd>
                </div>
                <div className="details-field">
                  <dt>College / Institution</dt>
                  <dd>{selectedTeam.college || "—"}</dd>
                </div>
                <div className="details-field">
                  <dt>Team Size</dt>
                  <dd>
                    <b style={{ color: "#4ade80" }}>
                      {selectedTeam.teamSize || ((selectedTeam.members || []).length + 1)} Members
                    </b>{" "}
                    (1 Leader + {(selectedTeam.members || []).length} Members)
                  </dd>
                </div>
                <div className="details-field">
                  <dt>Department & Year</dt>
                  <dd>
                    {selectedTeam.department || "—"}{" "}
                    {selectedTeam.year ? `(${selectedTeam.year})` : ""}
                  </dd>
                </div>
                {selectedTeam.mentor?.name ? (
                  <>
                    <div className="details-field">
                      <dt>Faculty Mentor Name</dt>
                      <dd>{selectedTeam.mentor.name}</dd>
                    </div>
                    <div className="details-field">
                      <dt>Faculty Mentor Contact</dt>
                      <dd>{selectedTeam.mentor.email || selectedTeam.mentor.phone || "—"}</dd>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Members List */}
              <div style={{ marginTop: "10px" }}>
                <h3 style={{ fontSize: "14px", margin: "0 0 10px", color: "#cbd5e1" }}>
                  Registered Team Members ({(selectedTeam.members || []).length})
                </h3>
                <div className="team-table-wrap" style={{ margin: 0 }}>
                  <table className="team-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Member Name</th>
                        <th>College / Year</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Student ID / Reg No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedTeam.members || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8" }}>
                            No individual member records provided.
                          </td>
                        </tr>
                      ) : (
                        selectedTeam.members.map((member, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <b style={{ color: "#ffffff" }}>{member.name}</b>
                            </td>
                            <td>
                              <span style={{ color: "#e2e8f0" }}>{member.college || selectedTeam.college || "—"}</span>
                              {member.year ? (
                                <div style={{ fontSize: "11px", color: "#94a3b8" }}>{member.year}</div>
                              ) : null}
                            </td>
                            <td>
                              {member.phone ? (
                                <a href={`tel:${member.phone}`} style={{ color: "#55caff", textDecoration: "none" }}>
                                  {member.phone}
                                </a>
                              ) : "—"}
                            </td>
                            <td>
                              {member.email ? (
                                <a href={`mailto:${member.email}`} style={{ color: "#cbd5e1", textDecoration: "none" }}>
                                  {member.email}
                                </a>
                              ) : "—"}
                            </td>
                            <td>{member.studentId || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <footer className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setDetailModalOpen(false);
                  openEmailPreview(selectedTeam);
                }}
              >
                <Mail size={14} /> Send Email
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
