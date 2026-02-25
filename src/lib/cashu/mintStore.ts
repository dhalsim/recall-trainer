import { Mint } from '@cashu/cashu-ts';
import type { GetInfoResponse, MintKeyset, MintKeys } from '@cashu/cashu-ts';

import { logger } from '../../utils/logger';

const MINT_CACHE_PREFIX = 'recall-trainer-mint-data-';
const { error: logError } = logger();

export type MintData = {
  info: GetInfoResponse;
  keysets: MintKeyset[];
  keys: MintKeys[];
  lastUpdated: number;
};

function getCacheKey(mintUrl: string): string {
  return `${MINT_CACHE_PREFIX}${mintUrl.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function saveMintData(mintUrl: string, data: MintData): void {
  try {
    const key = getCacheKey(mintUrl);
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    logError('[mintStore] Failed to save mint data:', err);
  }
}

export function loadMintData(mintUrl: string): MintData | null {
  try {
    const key = getCacheKey(mintUrl);
    const raw = localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as MintData;

    if (!parsed || !parsed.info || !Array.isArray(parsed.keysets)) {
      return null;
    }

    return parsed;
  } catch (err) {
    logError('[mintStore] Failed to load mint data:', err);

    return null;
  }
}

export function clearMintData(mintUrl: string): void {
  try {
    const key = getCacheKey(mintUrl);
    localStorage.removeItem(key);
  } catch (err) {
    logError('[mintStore] Failed to clear mint data:', err);
  }
}

export async function fetchAndStoreMintData(mintUrl: string): Promise<MintData | null> {
  try {
    const mint = new Mint(mintUrl);

    const [info, keysetsResponse, keysResponse] = await Promise.all([
      mint.getInfo(),
      mint.getKeySets(),
      mint.getKeys(),
    ]);

    const data: MintData = {
      info,
      keysets: keysetsResponse.keysets,
      keys: keysResponse.keysets,
      lastUpdated: Date.now(),
    };

    saveMintData(mintUrl, data);

    return data;
  } catch (err) {
    logError('[mintStore] Failed to fetch mint data:', err);

    return null;
  }
}

export async function updateMintKeysets(mintUrl: string): Promise<MintKeyset[] | null> {
  try {
    const mint = new Mint(mintUrl);
    const keysetsResponse = await mint.getKeySets();

    const existingData = loadMintData(mintUrl);

    const updatedData: MintData = {
      info: existingData?.info ?? ({} as GetInfoResponse),
      keysets: keysetsResponse.keysets,
      keys: existingData?.keys ?? [],
      lastUpdated: Date.now(),
    };

    const allKeys: MintKeys[] = [...(existingData?.keys ?? [])];

    for (const keyset of keysetsResponse.keysets) {
      if (!allKeys.find((k) => k.id === keyset.id)) {
        try {
          const keyResponse = await mint.getKeys(keyset.id);
          allKeys.push(...keyResponse.keysets);
        } catch {
          logError(`[mintStore] Failed to fetch keys for keyset: ${keyset.id}`);
        }
      }
    }

    updatedData.keys = allKeys;
    saveMintData(mintUrl, updatedData);

    return keysetsResponse.keysets;
  } catch (err) {
    logError('[mintStore] Failed to update keysets:', err);

    return null;
  }
}
