// Evaluator Portal session: the signed token from the server, kept in sessionStorage (this tab only; cleared when
// the browser closes). The server re-checks the account on every request. Signs out after 60 minutes idle.
const KEY = "dexathon_evaluator_session";
export const EVALUATOR_IDLE_MS = 60 * 60 * 1000;

const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };
const write = (value) => { try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

let lastActive = Date.now();
if (typeof window !== "undefined") {
  ["mousedown", "keydown", "touchstart", "scroll", "wheel"].forEach((event) => window.addEventListener(event, () => { lastActive = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    if (read() && Date.now() - lastActive > EVALUATOR_IDLE_MS) {
      write(null);
      if (window.location.pathname.startsWith("/evaluator") && !window.location.pathname.startsWith("/evaluator/login")) window.location.assign("/evaluator/login?expired=1");
    }
  }, 30 * 1000);
}

export const getEvaluatorSession = () => read();
export const getEvaluatorToken = () => read()?.token || null;
export const setEvaluatorSession = (token, evaluator) => { lastActive = Date.now(); write({ token, evaluator }); };
export const clearEvaluatorSession = () => write(null);
export const evaluatorHeaders = () => ({ Authorization: `Bearer ${getEvaluatorToken()}` });
