export const Lexorank = {
  getMedian(prev: string, next: string): string {
    const p = prev || '';
    const n = next || '';

    if (!p && !n) {
      return 'n';
    }

    if (!p) {
      // Insert before n
      let i = 0;
      let result = '';
      while (true) {
        const charN = n[i] || 'z';
        const valN = charN.charCodeAt(0);
        if (valN > 97) { // 'a'
          const midVal = Math.floor((97 + valN) / 2);
          result += String.fromCharCode(midVal);
          break;
        } else {
          result += 'a';
          if (n[i] === undefined) {
            result += 'a';
            break;
          }
          i++;
        }
      }
      return result;
    }

    if (!n) {
      // Insert after p
      let i = 0;
      let result = '';
      while (true) {
        const charP = p[i] || 'a';
        const valP = charP.charCodeAt(0);
        if (valP < 122) { // 'z'
          const midVal = Math.floor((valP + 122) / 2);
          result += String.fromCharCode(midVal);
          break;
        } else {
          result += 'z';
          if (p[i] === undefined) {
            result += 'z';
            break;
          }
          i++;
        }
      }
      return result;
    }

    // Insert between p and n
    let i = 0;
    let result = '';
    while (true) {
      const charP = p[i] || 'a';
      const charN = n[i] || 'z';

      const valP = charP.charCodeAt(0);
      const valN = charN.charCodeAt(0);

      if (valN - valP > 1) {
        const midVal = Math.floor((valP + valN) / 2);
        result += String.fromCharCode(midVal);
        break;
      } else {
        result += charP;
        if (p[i] === undefined) {
          result += 'n';
          break;
        }
        i++;
      }
    }

    // Safety fallbacks to ensure strict ordering
    if (result <= p) {
      return p + 'n';
    }
    if (result >= n) {
      return p + 'h';
    }

    return result;
  },

  generateInitialPositions(count: number): string[] {
    const positions: string[] = [];
    let current = '';
    for (let i = 0; i < count; i++) {
      current = this.getMedian(current, '');
      positions.push(current);
    }
    return positions;
  }
}
