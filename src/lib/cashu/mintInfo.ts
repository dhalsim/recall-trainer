/**
 * NUT-06: Mint information via cashu-ts Mint.getInfo().
 * @see https://github.com/cashubtc/nuts/blob/main/06.md
 */

import { HttpResponseError, Mint } from '@cashu/cashu-ts';
import type { GetInfoResponse } from '@cashu/cashu-ts';

export type GetMintInfoResult = { ok: true; info: GetInfoResponse } | { ok: false; error: string };

/**
 * Fetch NUT-06 mint information from the mint's /v1/info endpoint using cashu-ts.
 * Returns success with info, or failure with an error code (e.g. "404", "502", "timeout", "unreachable").
 */
export async function getMintInfo(
  mintUrl: string,
  _options?: { signal?: AbortSignal },
): Promise<GetMintInfoResult> {
  if (!mintUrl || typeof mintUrl !== 'string' || !mintUrl.startsWith('http')) {
    return { ok: false, error: 'invalid_url' };
  }

  try {
    const mint = new Mint(mintUrl);
    const info = await mint.getInfo();

    return { ok: true, info };
  } catch (err) {
    if (err instanceof HttpResponseError) {
      const status = err.status;

      return { ok: false, error: String(status) };
    }

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { ok: false, error: 'timeout' };
      }

      if (err instanceof TypeError || err.message?.toLowerCase().includes('fetch')) {
        return { ok: false, error: 'unreachable' };
      }
    }

    return { ok: false, error: 'unknown' };
  }
}
