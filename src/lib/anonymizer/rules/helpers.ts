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

function isCard16ByShape(raw: string): boolean {
  const value = raw.trim();
  return (
    /^\d{16}$/.test(value) ||
    /^\d{4}(?:[ -]{1,2}\d{4}){3}$/.test(value)
  );
}

export function isLikelyCardNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (isCard16ByShape(raw)) return true;
  if (digits.length < 13 || digits.length > 19) return false;
  return luhnCheck(raw);
}

export function isDateLike(raw: string): boolean {
  const value = raw.trim();
  return (
    /^(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19\d{2}|20\d{2})$/.test(value) ||
    /^(?:19\d{2}|20\d{2})[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])$/.test(value)
  );
}

export function isLikelyPhone(raw: string): boolean {
  if (isDateLike(raw)) return false;
  if (isCard16ByShape(raw)) return false;

  const digits = raw.replace(/\D/g, "");
  // E.164 upper bound: max 15 digits.
  if (digits.length < 9 || digits.length > 15) return false;

  return true;
}

export function hasPersonContext(
  text: string,
  start: number,
  end: number,
): boolean {
  const contextWindow = 48;
  const context = text.slice(Math.max(0, start - contextWindow), Math.min(text.length, end + contextWindow));

  const strongPersonHints: RegExp[] = [
    // Russian
    /(?:^|[^\p{L}])фио(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])фамили[яи](?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])имя(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])отчество(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])заявител(?:ь|я)(?:[^\p{L}]|$)/iu,
    /данные\s+заявителя/iu,
    // English
    /(?:^|[^\p{L}])first\s+name(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])given\s+name(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])middle\s+name(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])last\s+name(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])family\s+name(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])surname(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])legal\s+name(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])applicant(?:[^\p{L}]|$)/iu,
    // German
    /(?:^|[^\p{L}])vorname(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])familienname(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])nachname(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])geburtsname(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])antragsteller(?:in)?(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])anrede(?:[^\p{L}]|$)/iu,
    // Armenian
    /(?:^|[^\p{L}])անուն(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])ազգանուն(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])հայրանուն(?:[^\p{L}]|$)/iu,
    /դիմողի\s+անուն,\s*ազգանուն,\s*հայրանունը/iu,
  ];

  return strongPersonHints.some((hint) => hint.test(context));
}

export function hasAddressContext(
  text: string,
  start: number,
  end: number,
): boolean {
  const contextWindow = 72;
  const context = text.slice(Math.max(0, start - contextWindow), Math.min(text.length, end + contextWindow));

  const strongAddressHints: RegExp[] = [
    // Russian
    /(?:^|[^\p{L}])адрес(?:[^\p{L}]|$)/iu,
    /адрес\s+проживания/iu,
    /адрес\s+регистрации/iu,
    /место\s+жительства/iu,
    /(?:^|[^\p{L}])индекс(?:[^\p{L}]|$)/iu,
    // English
    /(?:^|[^\p{L}])address(?:[^\p{L}]|$)/iu,
    /residential\s+address/iu,
    /mailing\s+address/iu,
    /postal\s+address/iu,
    /place\s+of\s+residence/iu,
    // German
    /(?:^|[^\p{L}])anschrift(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])adresse(?:[^\p{L}]|$)/iu,
    /wohnanschrift/iu,
    /meldeadresse/iu,
    /(?:^|[^\p{L}])wohnort(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])postleitzahl(?:[^\p{L}]|$)/iu,
    /(?:^|[^\p{L}])plz(?:[^\p{L}]|$)/iu,
    // Armenian
    /(?:^|[^\p{L}])հասցե(?:[^\p{L}]|$)/iu,
    /բնակության\s+հասցե/iu,
    /գրանցման\s+հասցե/iu,
    /փոստային\s+ինդեքս/iu,
  ];

  return strongAddressHints.some((hint) => hint.test(context));
}

export function isValidIPv4(raw: string): boolean {
  const value = raw.trim();
  const octets = value.split(".");
  if (octets.length !== 4) return false;

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const num = Number(octet);
    return num >= 0 && num <= 255;
  });
}

export function isValidIPv6(raw: string): boolean {
  const value = raw.trim();
  if (value.length < 2 || value.length > 39) return false;
  if (!value.includes(":")) return false;
  if (value.includes(":::")) return false;

  const hasCompression = value.includes("::");
  if (hasCompression && value.indexOf("::") !== value.lastIndexOf("::")) return false;

  if (value.startsWith(":") && !value.startsWith("::")) return false;
  if (value.endsWith(":") && !value.endsWith("::")) return false;

  const hextet = /^[0-9a-fA-F]{1,4}$/;
  const [leftRaw, rightRaw] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];

  if (!left.every((part) => hextet.test(part))) return false;
  if (!right.every((part) => hextet.test(part))) return false;

  const totalHextets = left.length + right.length;
  if (hasCompression) {
    return totalHextets < 8;
  }
  return totalHextets === 8;
}
