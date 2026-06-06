export const STRICT_TEMPLATE_TOKEN = /\{\{\s*[#\/^]?\s*[\w.-]+\s*\}\}/;
export const STRICT_TEMPLATE_ZONE = /\{\{\s*#\s*(?:accounts|dispute_accounts|late_accounts|late_payment_accounts|hard_inquiries)\s*\}\}/i;

export function hasTemplateInjectionTags(xml: string) {
  return STRICT_TEMPLATE_TOKEN.test(xml);
}

export function requireTemplateInjectionTags(xml: string, label: string) {
  if (hasTemplateInjectionTags(xml)) return;
  throw new Error(`${label} template is not wired for strict source injection. Add {{consumer_name}}, {{date}}, {{bureau_name}}, {{bureau_address}}, and mapped account zones such as {{#accounts}}...{{/accounts}}. The app will not rewrite template paragraphs by position because template layout must be preserved.`);
}
