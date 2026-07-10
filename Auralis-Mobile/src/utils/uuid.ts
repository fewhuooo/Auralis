/**
 * RFC 9562 Standard compliant UUIDv7 Generator
 * Generates time-ordered, lexicographically sortable 128-bit UUIDs.
 * 
 * Layout:
 * - 48 bits: timestamp (milliseconds since Unix epoch)
 * - 4 bits: version (0111 = 7)
 * - 12 bits: random sequence
 * - 2 bits: variant (10 = RFC 9562/4122)
 * - 62 bits: random data
 */
export function uuidv7(): string {
  const now = Date.now();
  const hexTimestamp = now.toString(16).padStart(12, '0');
  
  // 12 bits random for sequence (3 hex characters)
  const random1 = Math.floor(Math.random() * 0x1000).toString(16).padStart(3, '0');
  
  // Variant 10xx: 8, 9, a, or b
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  
  // 12 bits random + 32 bits random + 16 bits random = 60 bits
  const random2 = Math.floor(Math.random() * 0x1000).toString(16).padStart(3, '0');
  const random3 = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const random4 = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  
  const p1 = hexTimestamp.slice(0, 8);
  const p2 = hexTimestamp.slice(8, 12);
  const p3 = '7' + random1;
  const p4 = variant + random2;
  const p5 = random3 + random4;
  
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}
