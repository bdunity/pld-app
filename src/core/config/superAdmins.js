// Super Admin emails - these users bypass onboarding and have access to all tenants
export const SUPER_ADMIN_EMAILS = [
  'sergio@bdunity.com',
];

export const isSuperAdmin = (email) => {
  return SUPER_ADMIN_EMAILS.includes(email?.toLowerCase());
};
