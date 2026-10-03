// Team Head Portal session (a signed token from the backend; the backend re-checks it on every request).
const TEAM_TOKEN_KEY = "dexathon_team_token";

export const getTeamToken = () => { try { return localStorage.getItem(TEAM_TOKEN_KEY); } catch { return null; } };
export const setTeamToken = (token) => { try { localStorage.setItem(TEAM_TOKEN_KEY, token); } catch { /* storage unavailable */ } };
export const clearTeamToken = () => { try { localStorage.removeItem(TEAM_TOKEN_KEY); } catch { /* storage unavailable */ } };
