const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
};

export const deterministicRoll = (...parts: Array<string | number>): number =>
  hashString(parts.join("|")) / 0x1_0000_0000;

export const deterministicRange = (
  min: number,
  max: number,
  ...parts: Array<string | number>
): number => min + deterministicRoll(...parts) * (max - min);
