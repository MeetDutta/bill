/**
 * Indian Number to Words Converter
 * Converts monetary amounts to Indian numbering system: Crores, Lakhs, Thousands, Hundreds, and Paise.
 * Example:
 *   1939.60 -> "Rupees One Thousand Nine Hundred Thirty-Nine and Sixty Paise Only"
 *   1500.00 -> "Rupees One Thousand Five Hundred Only"
 *   0.50    -> "Fifty Paise Only"
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitsToWords(n: number): string {
  if (n <= 0) return "";
  if (n < 20) return ONES[n];
  const tensVal = TENS[Math.floor(n / 10)];
  const onesVal = ONES[n % 10];
  return onesVal ? `${tensVal}-${onesVal}` : tensVal;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (hundreds) {
    parts.push(`${ONES[hundreds]} Hundred`);
  }
  if (rem) {
    parts.push(twoDigitsToWords(rem));
  }
  return parts.join(" ");
}

function integerToWordsRecursive(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const crores = Math.floor(n / 10000000);
  let rem = n % 10000000;
  const lakhs = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousands = Math.floor(rem / 1000);
  rem = rem % 1000;

  if (crores) {
    parts.push(`${integerToWordsRecursive(crores)} Crore`);
  }
  if (lakhs) {
    parts.push(`${twoDigitsToWords(lakhs)} Lakh`);
  }
  if (thousands) {
    parts.push(`${twoDigitsToWords(thousands)} Thousand`);
  }
  if (rem) {
    parts.push(threeDigitsToWords(rem));
  }

  return parts.filter(Boolean).join(" ");
}

export function indianNumberToWords(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || String(amount).trim() === "") {
    return "Zero Rupees Only";
  }

  const num = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (isNaN(num)) {
    return "Zero Rupees Only";
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const rupees = Math.floor(absNum);
  const paise = Math.round((absNum - rupees) * 100);

  if (rupees === 0 && paise === 0) {
    return "Zero Rupees Only";
  }

  const rupeeWords = integerToWordsRecursive(rupees);
  const prefix = isNegative ? "Minus " : "";
  let result = rupeeWords ? `${prefix}Rupees ${rupeeWords}` : "";

  if (paise > 0) {
    const paiseStr = `${twoDigitsToWords(paise)} Paise`;
    if (result) {
      result = `${result} and ${paiseStr} Only`;
    } else {
      result = `${prefix}${paiseStr} Only`;
    }
  } else {
    result = `${result} Only`;
  }

  return result;
}

