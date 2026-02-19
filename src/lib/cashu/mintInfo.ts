/**
 * NUT-06: Mint information via cashu-ts Mint.getInfo().
 * @see https://github.com/cashubtc/nuts/blob/main/06.md
 */

import { Mint } from '@cashu/cashu-ts';
import type { GetInfoResponse } from '@cashu/cashu-ts';

/**
 * Fetch NUT-06 mint information from the mint's /v1/info endpoint using cashu-ts.
 * Returns null on network error or timeout.
 */
export async function getMintInfo(
  mintUrl: string,
  _options?: { signal?: AbortSignal },
): Promise<GetInfoResponse | null> {
  if (!mintUrl || typeof mintUrl !== 'string' || !mintUrl.startsWith('http')) {
    return null;
  }

  try {
    const mint = new Mint(mintUrl);
    const info = await mint.getInfo();

    return info;
  } catch {
    return null;
  }
}
