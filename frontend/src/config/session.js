// sessionStorage keys shared by the Register and Payment pages.
export const REGISTRATION_KEY = "dexathon_registration";
export const PAYMENT_SETTINGS_KEY = "dexathon_payment_settings";

export const readSessionJson = (key) => {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
