export async function computeTxHash(date: string, description: string, amount: number, type: string): Promise<string> {
  const cleanDate = (date || '').trim().slice(0, 10);
  const cleanAmt = Math.abs(Number(amount) || 0).toFixed(2);
  const payload = `${cleanDate}|${(description || '').trim().toLowerCase()}|${cleanAmt}|${(type || '').trim().toLowerCase()}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Simple fallback string hash for non-secure HTTP contexts
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'fallback-' + Math.abs(hash).toString(16);
}
