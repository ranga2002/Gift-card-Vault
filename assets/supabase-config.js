// Supabase public client configuration for Coupon & Gift Vault.
// Safe to commit: ONLY use your Project URL and Publishable / anon key here.
// NEVER put your Supabase `service_role` or database password in frontend code.
window.COUPON_VAULT_SUPABASE_CONFIG = {
  url: "https://rbdsxtpqnrqliscaozog.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiZHN4dHBxbnJxbGlzY2Fvem9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NjMyNzAsImV4cCI6MjExMDMzOTI3MH0.0hPXfdBy_h3SUIlRve3GWhJ2EQZaKvVc8vFLXdPAnRI"
};

// Optional EmailJS config for automatically sending invite emails from Super Admin.
// Get these 3 public IDs from https://dashboard.emailjs.com (connect your Gmail there).
window.COUPON_VAULT_EMAILJS_CONFIG = {
  publicKey: "ZUWxhrS0Tr-cDnCZL",
  serviceId: "service_tkhnapb",
  templateId: "template_b90orbr"
};

