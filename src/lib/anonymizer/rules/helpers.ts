export function luhnCheck(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function isDateLike(raw: string): boolean {
  const value = raw.trim();
  return (
    /^(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19\d{2}|20\d{2})$/.test(value) ||
    /^(?:19\d{2}|20\d{2})[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])$/.test(value)
  );
}

export function hasPersonContext(
  text: string,
  start: number,
  end: number,
): boolean {
  const contextWindow = 32;
  const context = text
    .slice(Math.max(0, start - contextWindow), Math.min(text.length, end + contextWindow))
    .toLowerCase();

  return (
    context.includes("клиент") ||
    context.includes("фио") ||
    context.includes("заемщик") ||
    context.includes("получатель") ||
    context.includes("customer") ||
    context.includes("client") ||
    context.includes("name")
  );
}
